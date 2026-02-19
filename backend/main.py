from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import sqlite3
import json
import io
import asyncio
import threading
from datetime import datetime, timedelta

from database import init_db, get_db
from auth import get_password_hash, verify_password, create_access_token, verify_token
from mqtt_service import (
    init_mqtt, sensor_store, control_store, publish_control,
    reconnect_mqtt, is_mqtt_connected, ws_connections,
    load_control_states, persist_control_state, persist_all_control_states,
)

# ─── App Setup ───────────────────────────────────────────────
app = FastAPI(title="Andrographis Smart Farm API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    init_db()
    # Load persisted control states from DB
    load_control_states()
    # Load MQTT config from DB and connect
    _start_mqtt_from_db()
    # Re-publish persisted control states to MQTT so ESP32 stays in sync
    _sync_controls_to_mqtt()
    # Start automation engine background thread
    _start_automation_engine()

@app.on_event("shutdown")
async def shutdown():
    global _automation_running
    _automation_running = False


def _start_mqtt_from_db():
    """Read MQTT config from database and start MQTT client."""
    try:
        db = sqlite3.connect("smartfarm.db", check_same_thread=False)
        db.row_factory = sqlite3.Row
        cursor = db.execute("SELECT key, value FROM config WHERE key LIKE 'mqtt_%'")
        cfg = {}
        for row in cursor:
            k = row["key"].replace("mqtt_", "")
            cfg[k] = row["value"]
        db.close()

        if cfg.get("broker"):
            init_mqtt(
                broker=cfg.get("broker", "localhost"),
                port=int(cfg.get("port", 1883)),
                username=cfg.get("username", ""),
                password=cfg.get("password", ""),
            )
        else:
            init_mqtt()
    except Exception as e:
        print(f"⚠️ Could not load MQTT config from DB: {e}")
        init_mqtt()


def _sync_controls_to_mqtt():
    """Re-publish persisted control states to MQTT so hardware stays in sync."""
    import time as _t
    _t.sleep(2)  # Wait for MQTT to connect
    for device in ["whiteLight", "purpleLight", "ventilation"]:
        if control_store.get(device):
            publish_control(device, True)
    print(f"🔄 Synced control states to MQTT: {control_store}")


# ─── Automation Engine ───────────────────────────────────────
_automation_running = False
_automation_thread = None


def _start_automation_engine():
    """Start background thread that evaluates automation rules every 30s."""
    global _automation_running, _automation_thread
    _automation_running = True
    _automation_thread = threading.Thread(target=_automation_loop, daemon=True)
    _automation_thread.start()
    print("🤖 Automation engine started")


def _automation_loop():
    """Main loop: every 30s evaluate all enabled automation rules."""
    import time as _time
    while _automation_running:
        try:
            _evaluate_automation_rules()
        except Exception as e:
            print(f"⚠️ Automation evaluation error: {e}")
        _time.sleep(30)


def _evaluate_automation_rules():
    """Load enabled rules from DB and execute matching ones."""
    try:
        db = sqlite3.connect("smartfarm.db", check_same_thread=False)
        db.row_factory = sqlite3.Row
        cursor = db.execute("SELECT * FROM automation_rules WHERE enabled = 1")
        rules = cursor.fetchall()
        db.close()
    except Exception as e:
        print(f"⚠️ Could not load automation rules: {e}")
        return

    now = datetime.now()
    current_time = now.strftime("%H:%M")

    for rule in rules:
        try:
            rule_type = rule["rule_type"]
            action_device = rule["action_device"]
            action_state = bool(rule["action_state"])

            if rule_type == "schedule":
                _execute_schedule_rule(rule, current_time, action_device, action_state)
            elif rule_type == "threshold":
                _execute_threshold_rule(rule, action_device, action_state)
        except Exception as e:
            print(f"⚠️ Error executing rule '{rule['name']}': {e}")


def _execute_schedule_rule(rule, current_time, action_device, action_state):
    """Execute a schedule-based automation rule."""
    start = rule["schedule_start"]
    end = rule["schedule_end"]

    if not start or not end:
        return

    # Check if current time is within the schedule window
    in_window = False
    if start <= end:
        # Normal range e.g. 06:00 - 18:00
        in_window = start <= current_time <= end
    else:
        # Overnight range e.g. 22:00 - 06:00
        in_window = current_time >= start or current_time <= end

    if action_device == "all":
        # Special "all" device means control all devices
        devices = ["whiteLight", "purpleLight", "ventilation"]
        target_state = action_state if in_window else (not action_state)
        for dev in devices:
            if control_store.get(dev) != target_state:
                publish_control(dev, target_state)
                control_store[dev] = target_state
                persist_control_state(dev, target_state)
                print(f"🤖 Schedule rule '{rule['name']}': {dev} → {'ON' if target_state else 'OFF'}")
        # Auto-set master switch
        master_target = any(control_store.get(d) for d in devices)
        if control_store.get("masterSwitch") != master_target:
            control_store["masterSwitch"] = master_target
            persist_control_state("masterSwitch", master_target)
    else:
        target_state = action_state if in_window else (not action_state)
        if control_store.get(action_device) != target_state:
            publish_control(action_device, target_state)
            control_store[action_device] = target_state
            persist_control_state(action_device, target_state)
            print(f"🤖 Schedule rule '{rule['name']}': {action_device} → {'ON' if target_state else 'OFF'}")


def _execute_threshold_rule(rule, action_device, action_state):
    """Execute a threshold-based automation rule (sensor triggers)."""
    sensor_type = rule["sensor_type"]
    condition = rule["condition"]  # "above" or "below"
    threshold = rule["threshold"]

    if not sensor_type or not condition or threshold is None:
        return

    # Get current sensor value
    current_value = None
    if sensor_type == "humidity":
        current_value = sensor_store.get("humidity")
    elif sensor_type == "lux":
        current_value = sensor_store.get("lux")
    elif sensor_type == "cwsi":
        cwsi1 = sensor_store.get("cwsi1", {})
        current_value = cwsi1.get("index") if isinstance(cwsi1, dict) else None
    elif sensor_type == "leaf_temp":
        current_value = sensor_store.get("leaf_temp1")
    elif sensor_type == "water_level":
        current_value = sensor_store.get("water_level1")

    if current_value is None:
        return

    # Check condition
    triggered = False
    if condition == "above" and current_value > threshold:
        triggered = True
    elif condition == "below" and current_value < threshold:
        triggered = True

    target_state = action_state if triggered else (not action_state)

    if action_device == "all":
        devices = ["whiteLight", "purpleLight", "ventilation"]
        for dev in devices:
            if control_store.get(dev) != target_state:
                publish_control(dev, target_state)
                control_store[dev] = target_state
                persist_control_state(dev, target_state)
                print(f"🤖 Threshold rule '{rule['name']}': {dev} → {'ON' if target_state else 'OFF'} ({sensor_type}={current_value})")
    else:
        if control_store.get(action_device) != target_state:
            publish_control(action_device, target_state)
            control_store[action_device] = target_state
            persist_control_state(action_device, target_state)
            print(f"🤖 Threshold rule '{rule['name']}': {action_device} → {'ON' if target_state else 'OFF'} ({sensor_type}={current_value})")


# ─── Auth Dependency ─────────────────────────────────────────
async def get_current_user(authorization: Optional[str] = Header(None)):
    """Extract and verify JWT from Authorization header."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization format. Use: Bearer <token>")

    token = parts[1]
    user = verify_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


async def get_admin_user(current_user: dict = Depends(get_current_user)):
    """Check if user is admin."""
    db = sqlite3.connect("smartfarm.db", check_same_thread=False)
    db.row_factory = sqlite3.Row
    cursor = db.execute(
        "SELECT user_type, role FROM users WHERE username = ?",
        (current_user["username"],),
    )
    row = cursor.fetchone()
    db.close()
    if not row or (row["user_type"] != "admin" and row["role"] != "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def _log_audit(db, user_id, username, action, request: Request = None, status="success"):
    """Write an entry to the audit_logs table."""
    try:
        ip = ""
        user_agent = ""
        if request:
            ip = request.client.host if request.client else ""
            user_agent = request.headers.get("user-agent", "")
        db.execute(
            """INSERT INTO audit_logs (user_id, username, action, ip_address, user_agent, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (user_id, username, action, ip, user_agent, status, datetime.now().isoformat()),
        )
        db.commit()
    except Exception as e:
        print(f"⚠️ Audit log error: {e}")


def _reload_automation_jobs():
    """Trigger immediate re-evaluation of automation rules."""
    try:
        _evaluate_automation_rules()
    except Exception as e:
        print(f"⚠️ Automation reload error: {e}")


# ─── Pydantic Models ────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    user_type: Optional[str] = "user"

class ControlRequest(BaseModel):
    device: str
    state: bool

class MasterRequest(BaseModel):
    state: bool

class ConfigUpdate(BaseModel):
    mqtt: Optional[dict] = None
    devices: Optional[list] = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class AutomationRuleCreate(BaseModel):
    name: str
    rule_type: str = "schedule"
    sensor_type: Optional[str] = None
    condition: Optional[str] = None
    threshold: Optional[float] = None
    action_device: str
    action_state: bool = True
    schedule_start: Optional[str] = None
    schedule_end: Optional[str] = None
    enabled: bool = True

class AutomationRuleUpdate(BaseModel):
    name: Optional[str] = None
    rule_type: Optional[str] = None
    sensor_type: Optional[str] = None
    condition: Optional[str] = None
    threshold: Optional[float] = None
    action_device: Optional[str] = None
    action_state: Optional[bool] = None
    schedule_start: Optional[str] = None
    schedule_end: Optional[str] = None
    enabled: Optional[bool] = None

class UserUpdate(BaseModel):
    user_type: Optional[str] = None
    role: Optional[str] = None
    permissions: Optional[dict] = None

class ExportRequest(BaseModel):
    sensor_types: List[str] = ["cwsi", "humidity", "lux"]
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class FarmStatsUpdate(BaseModel):
    days: Optional[int] = None
    plots: Optional[int] = None
    health: Optional[int] = None

class SensorDataUpdate(BaseModel):
    value: float

class SensorDataCreate(BaseModel):
    sensor_type: str
    plot_id: int = 0
    value: float
    recorded_at: Optional[str] = None


# ─── Auth Endpoints (public) ────────────────────────────────
@app.post("/api/auth/register")
def register(req: RegisterRequest, request: Request, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.execute("SELECT id FROM users WHERE username = ?", (req.username,))
    if cursor.fetchone():
        raise HTTPException(status_code=400, detail="Username already exists")

    # First user becomes admin (auto-approved)
    cursor = db.execute("SELECT COUNT(*) FROM users")
    count = cursor.fetchone()[0]
    user_type = "admin" if count == 0 else req.user_type
    role = "admin" if count == 0 else "viewer"
    approved = 1 if count == 0 else 0  # First user auto-approved, others need admin approval

    password_hash = get_password_hash(req.password)
    db.execute(
        "INSERT INTO users (username, password_hash, user_type, role, approved) VALUES (?, ?, ?, ?, ?)",
        (req.username, password_hash, user_type, role, approved),
    )
    db.commit()
    if approved:
        return {"message": "Registration successful"}
    return {"message": "Registration submitted. Please wait for admin approval."}

@app.post("/api/auth/login")
def login(req: LoginRequest, request: Request, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.execute(
        "SELECT id, username, password_hash, user_type, role, approved FROM users WHERE username = ?",
        (req.username,),
    )
    user = cursor.fetchone()
    if not user or not verify_password(req.password, user["password_hash"]):
        _log_audit(db, None, req.username, "login_failed", request, "failed")
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Check approval status
    if not user["approved"]:
        _log_audit(db, user["id"], user["username"], "login_pending", request, "failed")
        raise HTTPException(status_code=403, detail="Account pending admin approval")

    access_token = create_access_token(data={"sub": user["username"]})
    _log_audit(db, user["id"], user["username"], "login", request, "success")

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "user_type": user["user_type"],
            "role": user["role"] or "viewer",
        },
    }


# ─── Security Endpoints (protected) ─────────────────────────
@app.post("/api/auth/change-password")
def change_password(
    req: ChangePasswordRequest, request: Request,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    cursor = db.execute("SELECT id, password_hash FROM users WHERE username = ?", (current_user["username"],))
    user = cursor.fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(req.current_password, user["password_hash"]):
        _log_audit(db, user["id"], current_user["username"], "change_password_failed", request, "failed")
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new_hash = get_password_hash(req.new_password)
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user["id"]))
    db.commit()
    _log_audit(db, user["id"], current_user["username"], "change_password", request, "success")
    return {"message": "Password changed successfully"}

@app.get("/api/security/login-activity")
def get_login_activity(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    cursor = db.execute(
        """SELECT action, ip_address, user_agent, status, created_at
           FROM audit_logs WHERE username = ? AND action LIKE 'login%'
           ORDER BY created_at DESC LIMIT 20""",
        (current_user["username"],),
    )
    return [dict(row) for row in cursor.fetchall()]

@app.post("/api/security/logout-all")
def logout_all_sessions(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    jti = current_user.get("jti")
    if jti:
        try:
            db.execute(
                "INSERT OR IGNORE INTO token_blacklist (token_jti, user_id, revoked_at) VALUES (?, ?, ?)",
                (jti, None, datetime.now().isoformat()),
            )
            db.commit()
        except Exception:
            pass
    cursor = db.execute("SELECT id FROM users WHERE username = ?", (current_user["username"],))
    user_row = cursor.fetchone()
    user_id = user_row["id"] if user_row else None
    _log_audit(db, user_id, current_user["username"], "logout_all", request, "success")
    return {"message": "All sessions logged out. Please login again."}


# ─── Sensor Endpoints (protected) ───────────────────────────
@app.get("/api/sensors/dashboard")
def get_dashboard(current_user: dict = Depends(get_current_user)):
    """Return current sensor snapshot. Values are None if no data received yet."""
    cwsi1 = sensor_store.get("cwsi1", {})
    cwsi2 = sensor_store.get("cwsi2", {})
    cwsi1_index = cwsi1.get("index") if isinstance(cwsi1, dict) else None
    cwsi2_index = cwsi2.get("index") if isinstance(cwsi2, dict) else None
    cwsi1_value = cwsi1.get("value") if isinstance(cwsi1, dict) else None
    cwsi2_value = cwsi2.get("value") if isinstance(cwsi2, dict) else None

    def cwsi_status(idx):
        if idx is None:
            return "รอข้อมูล..."
        if idx > 0.4:
            return "ภาวะเครียดสูง"
        if idx > 0.25:
            return "ภาวะเครียดปานกลาง"
        return "ไม่มีภาวะเครียด"

    return {
        "cwsi1": {
            "value": cwsi1_value,
            "index": cwsi1_index,
            "status": cwsi_status(cwsi1_index),
            "plot": "แปลงทดลอง 1",
        },
        "cwsi2": {
            "value": cwsi2_value,
            "index": cwsi2_index,
            "status": cwsi_status(cwsi2_index),
            "plot": "แปลงทดลอง 2",
        },
        "humidity": sensor_store.get("humidity"),
        "lux": sensor_store.get("lux"),
        "location": {
            "name": "มหาวิทยาลัยวลัยลักษณ์",
            "lat": "8.6433°N",
            "lng": "99.8973°E",
        },
        "plots": [
            {
                "id": 1,
                "name": "แปลงทดลอง 1",
                "leafTemp": sensor_store.get("leaf_temp1"),
                "waterLevel": sensor_store.get("water_level1"),
            },
            {
                "id": 2,
                "name": "แปลงทดลอง 2",
                "leafTemp": sensor_store.get("leaf_temp2"),
                "waterLevel": sensor_store.get("water_level2"),
            },
        ],
        "mqtt_connected": is_mqtt_connected(),
    }


@app.get("/api/sensors/cwsi-history")
def get_cwsi_history(
    period: str = "today",
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get CWSI history data for charts, computed from real DB records."""
    if period == "today":
        since = datetime.now().replace(hour=0, minute=0, second=0)
    elif period == "week":
        since = datetime.now() - timedelta(days=7)
    else:
        since = datetime.now() - timedelta(days=30)

    cursor = db.execute(
        """SELECT sensor_type, plot_id, value, recorded_at
           FROM sensor_data
           WHERE sensor_type = 'cwsi' AND recorded_at >= ?
           ORDER BY recorded_at ASC""",
        (since.isoformat(),),
    )
    rows = cursor.fetchall()

    if not rows:
        return {"history": [], "summary": {"plot1_avg": None, "plot2_avg": None, "count": 0}}

    # Group by time bucket
    data = {}
    plot1_vals = []
    plot2_vals = []

    for row in rows:
        t = row["recorded_at"][:16]  # YYYY-MM-DDTHH:MM
        if period == "today":
            display_time = t[11:16]  # HH:MM
        elif period == "week":
            display_time = t[5:10]  # MM-DD
        else:
            display_time = t[5:10]

        if display_time not in data:
            data[display_time] = {"time": display_time}

        key = f"plot{row['plot_id']}"
        data[display_time][key] = round(row["value"], 3)

        if row["plot_id"] == 1:
            plot1_vals.append(row["value"])
        elif row["plot_id"] == 2:
            plot2_vals.append(row["value"])

    history = list(data.values())

    summary = {
        "plot1_avg": round(sum(plot1_vals) / len(plot1_vals), 3) if plot1_vals else None,
        "plot2_avg": round(sum(plot2_vals) / len(plot2_vals), 3) if plot2_vals else None,
        "plot1_status": _cwsi_label(sum(plot1_vals) / len(plot1_vals)) if plot1_vals else "ไม่มีข้อมูล",
        "plot2_status": _cwsi_label(sum(plot2_vals) / len(plot2_vals)) if plot2_vals else "ไม่มีข้อมูล",
        "count": len(rows),
        "last_recorded": rows[-1]["recorded_at"] if rows else None,
    }

    return {"history": history, "summary": summary}


def _cwsi_label(value: float) -> str:
    if value > 0.4:
        return "เครียดสูง"
    elif value > 0.25:
        return "เครียดปานกลาง"
    return "ปกติ"


@app.get("/api/sensors/history")
def get_sensor_history(
    sensor_type: str = "humidity",
    plot_id: int = 0,
    period: str = "today",
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Generic sensor history endpoint for any sensor type."""
    if period == "today":
        since = datetime.now().replace(hour=0, minute=0, second=0)
    elif period == "week":
        since = datetime.now() - timedelta(days=7)
    else:
        since = datetime.now() - timedelta(days=30)

    cursor = db.execute(
        """SELECT value, recorded_at
           FROM sensor_data
           WHERE sensor_type = ? AND plot_id = ? AND recorded_at >= ?
           ORDER BY recorded_at ASC""",
        (sensor_type, plot_id, since.isoformat()),
    )
    rows = cursor.fetchall()
    return [{"value": row["value"], "time": row["recorded_at"]} for row in rows]


# ─── Control Endpoints (protected) ──────────────────────────
@app.get("/api/controls/state")
def get_controls_state(current_user: dict = Depends(get_current_user)):
    return {
        "controls": control_store,
        "humidity": sensor_store.get("humidity"),
    }

@app.post("/api/controls/toggle")
def toggle_control(req: ControlRequest, current_user: dict = Depends(get_current_user)):
    publish_control(req.device, req.state)
    control_store[req.device] = req.state
    persist_control_state(req.device, req.state)
    return {"success": True, "device": req.device, "state": req.state}

@app.post("/api/controls/master")
def master_switch(req: MasterRequest, current_user: dict = Depends(get_current_user)):
    if not req.state:
        for key in ["whiteLight", "purpleLight", "ventilation"]:
            publish_control(key, False)
            control_store[key] = False
            persist_control_state(key, False)
    control_store["masterSwitch"] = req.state
    persist_control_state("masterSwitch", req.state)
    persist_all_control_states()
    return {"success": True, "state": req.state}


# ─── Automation Endpoints (protected) ───────────────────────
@app.get("/api/automation/rules")
def get_automation_rules(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    cursor = db.execute("SELECT * FROM automation_rules ORDER BY created_at DESC")
    return [dict(row) for row in cursor.fetchall()]

@app.post("/api/automation/rules")
def create_automation_rule(
    rule: AutomationRuleCreate,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    db.execute(
        """INSERT INTO automation_rules
           (name, rule_type, sensor_type, condition, threshold, action_device, action_state,
            schedule_start, schedule_end, enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (rule.name, rule.rule_type, rule.sensor_type, rule.condition,
         rule.threshold, rule.action_device, int(rule.action_state),
         rule.schedule_start, rule.schedule_end, int(rule.enabled)),
    )
    db.commit()
    _reload_automation_jobs()
    return {"success": True, "message": "Automation rule created"}

@app.put("/api/automation/rules/{rule_id}")
def update_automation_rule(
    rule_id: int, rule: AutomationRuleUpdate,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    updates, params = [], []
    for field in ["name", "rule_type", "sensor_type", "condition", "threshold",
                   "action_device", "schedule_start", "schedule_end"]:
        val = getattr(rule, field, None)
        if val is not None:
            updates.append(f"{field} = ?")
            params.append(val)
    if rule.action_state is not None:
        updates.append("action_state = ?")
        params.append(int(rule.action_state))
    if rule.enabled is not None:
        updates.append("enabled = ?")
        params.append(int(rule.enabled))
    if not updates:
        return {"success": False, "message": "No fields to update"}
    params.append(rule_id)
    db.execute(f"UPDATE automation_rules SET {', '.join(updates)} WHERE id = ?", params)
    db.commit()
    _reload_automation_jobs()
    return {"success": True, "message": "Rule updated"}

@app.delete("/api/automation/rules/{rule_id}")
def delete_automation_rule(
    rule_id: int,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    db.execute("DELETE FROM automation_rules WHERE id = ?", (rule_id,))
    db.commit()
    _reload_automation_jobs()
    return {"success": True, "message": "Rule deleted"}

@app.post("/api/automation/rules/{rule_id}/toggle")
def toggle_automation_rule(
    rule_id: int,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    cursor = db.execute("SELECT enabled FROM automation_rules WHERE id = ?", (rule_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")
    new_val = 0 if row["enabled"] else 1
    db.execute("UPDATE automation_rules SET enabled = ? WHERE id = ?", (new_val, rule_id))
    db.commit()
    _reload_automation_jobs()
    return {"success": True, "enabled": bool(new_val)}


# ─── Schedule Shortcut (ControlPage) ────────────────────────
class ScheduleSave(BaseModel):
    enabled: bool
    schedule_start: str
    schedule_end: str

@app.get("/api/controls/schedule")
def get_control_schedule(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get the master schedule rule used by ControlPage."""
    cursor = db.execute(
        "SELECT * FROM automation_rules WHERE name = 'master_schedule' LIMIT 1"
    )
    row = cursor.fetchone()
    if row:
        return {
            "id": row["id"],
            "enabled": bool(row["enabled"]),
            "schedule_start": row["schedule_start"] or "06:00",
            "schedule_end": row["schedule_end"] or "18:00",
        }
    return {"id": None, "enabled": False, "schedule_start": "06:00", "schedule_end": "18:00"}

@app.put("/api/controls/schedule")
def save_control_schedule(
    req: ScheduleSave,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Create or update the master schedule rule from ControlPage."""
    cursor = db.execute(
        "SELECT id FROM automation_rules WHERE name = 'master_schedule' LIMIT 1"
    )
    row = cursor.fetchone()
    if row:
        db.execute(
            """UPDATE automation_rules
               SET enabled = ?, schedule_start = ?, schedule_end = ?, rule_type = 'schedule',
                   action_device = 'all', action_state = 1
               WHERE id = ?""",
            (int(req.enabled), req.schedule_start, req.schedule_end, row["id"]),
        )
    else:
        db.execute(
            """INSERT INTO automation_rules
               (name, rule_type, action_device, action_state, schedule_start, schedule_end, enabled)
               VALUES (?, 'schedule', 'all', 1, ?, ?, ?)""",
            ("master_schedule", req.schedule_start, req.schedule_end, int(req.enabled)),
        )
    db.commit()
    _reload_automation_jobs()
    return {"success": True, "message": "Schedule saved"}


# ─── User Management Endpoints (admin only) ─────────────────
@app.get("/api/users")
def list_users(
    current_user: dict = Depends(get_admin_user),
    db: sqlite3.Connection = Depends(get_db),
):
    cursor = db.execute("SELECT id, username, user_type, role, permissions, approved, created_at FROM users ORDER BY id")
    users = []
    for row in cursor.fetchall():
        u = dict(row)
        try:
            u["permissions"] = json.loads(u["permissions"]) if u["permissions"] else {}
        except Exception:
            u["permissions"] = {}
        users.append(u)
    return users

@app.put("/api/users/{user_id}")
def update_user(
    user_id: int, update: UserUpdate,
    current_user: dict = Depends(get_admin_user),
    db: sqlite3.Connection = Depends(get_db),
):
    updates, params = [], []
    if update.user_type is not None:
        updates.append("user_type = ?")
        params.append(update.user_type)
    if update.role is not None:
        updates.append("role = ?")
        params.append(update.role)
    if update.permissions is not None:
        updates.append("permissions = ?")
        params.append(json.dumps(update.permissions))
    if not updates:
        return {"success": False, "message": "No fields to update"}
    params.append(user_id)
    db.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
    db.commit()
    return {"success": True, "message": "User updated"}

@app.delete("/api/users/{user_id}")
def delete_user(
    user_id: int,
    current_user: dict = Depends(get_admin_user),
    db: sqlite3.Connection = Depends(get_db),
):
    cursor = db.execute("SELECT username FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if row and row["username"] == current_user["username"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()
    return {"success": True, "message": "User deleted"}


# ─── System Health Endpoint ─────────────────────────────────
@app.get("/api/system/health")
def get_system_health(current_user: dict = Depends(get_current_user)):
    health = {
        "cpu_percent": None, "cpu_temp": None,
        "memory_total": None, "memory_used": None, "memory_percent": None,
        "disk_total": None, "disk_used": None, "disk_percent": None,
        "uptime": None,
    }
    try:
        import psutil, time as _time
        health["cpu_percent"] = psutil.cpu_percent(interval=1)
        mem = psutil.virtual_memory()
        health["memory_total"] = round(mem.total / (1024**3), 2)
        health["memory_used"] = round(mem.used / (1024**3), 2)
        health["memory_percent"] = mem.percent
        disk = psutil.disk_usage("/")
        health["disk_total"] = round(disk.total / (1024**3), 2)
        health["disk_used"] = round(disk.used / (1024**3), 2)
        health["disk_percent"] = disk.percent
        uptime_s = _time.time() - psutil.boot_time()
        health["uptime"] = f"{int(uptime_s//86400)}d {int((uptime_s%86400)//3600)}h {int((uptime_s%3600)//60)}m"
        try:
            temps = psutil.sensors_temperatures()
            if temps:
                for _, entries in temps.items():
                    if entries:
                        health["cpu_temp"] = entries[0].current
                        break
        except Exception:
            pass
    except ImportError:
        pass
    return health


# ─── Advanced Export Endpoint ────────────────────────────────
@app.post("/api/export/csv")
def export_csv(
    req: ExportRequest,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    start = req.start_date or (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    end = req.end_date or datetime.now().strftime("%Y-%m-%d")
    placeholders = ",".join("?" for _ in req.sensor_types)
    cursor = db.execute(
        f"""SELECT sensor_type, plot_id, value, recorded_at
            FROM sensor_data
            WHERE sensor_type IN ({placeholders})
            AND recorded_at >= ? AND recorded_at <= ?
            ORDER BY recorded_at ASC""",
        (*req.sensor_types, f"{start}T00:00:00", f"{end}T23:59:59"),
    )
    rows = cursor.fetchall()
    output = io.StringIO()
    output.write("sensor_type,plot_id,value,recorded_at\n")
    for row in rows:
        output.write(f"{row['sensor_type']},{row['plot_id']},{row['value']},{row['recorded_at']}\n")
    output.seek(0)
    filename = f"smartfarm_export_{start}_to_{end}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ─── Config Endpoints (protected) ───────────────────────────
@app.get("/api/config")
def get_config(current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    cursor = db.execute("SELECT key, value FROM config WHERE key LIKE 'mqtt_%'")
    mqtt_config = {}
    for row in cursor:
        k = row["key"].replace("mqtt_", "")
        mqtt_config[k] = row["value"]

    cursor = db.execute("SELECT id, name, topic, device_type as type, category FROM devices ORDER BY category, id")
    all_devices = [dict(row) for row in cursor]

    # Split into dashboard (sensor) and control categories
    dashboard_devices = [d for d in all_devices if d.get("category") == "dashboard"]
    control_devices = [d for d in all_devices if d.get("category") != "dashboard"]

    return {
        "mqtt": mqtt_config if mqtt_config else {
            "broker": "localhost",
            "port": "1883",
            "username": "",
            "password": "",
        },
        "devices": all_devices,
        "dashboard_devices": dashboard_devices,
        "control_devices": control_devices,
        "mqtt_connected": is_mqtt_connected(),
    }

@app.put("/api/config")
def update_config(req: ConfigUpdate, current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    if req.mqtt:
        for k, v in req.mqtt.items():
            db.execute(
                "INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                (f"mqtt_{k}", str(v)),
            )

    if req.devices is not None:
        db.execute("DELETE FROM devices")
        for dev in req.devices:
            db.execute(
                "INSERT INTO devices (name, topic, device_type, category) VALUES (?, ?, ?, ?)",
                (dev.get("name", ""), dev.get("topic", ""), dev.get("type", "switch"), dev.get("category", "control")),
            )

    db.commit()

    # Reconnect MQTT with new settings
    if req.mqtt:
        reconnect_mqtt(
            broker=req.mqtt.get("broker", "localhost"),
            port=int(req.mqtt.get("port", 1883)),
            username=req.mqtt.get("username", ""),
            password=req.mqtt.get("password", ""),
        )

    return {"success": True, "mqtt_connected": is_mqtt_connected()}


# ─── WebSocket for real-time sensor updates ──────────────────
@app.websocket("/ws/sensors")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    # Store the event loop on the websocket for cross-thread access
    websocket._loop = asyncio.get_event_loop()
    ws_connections.add(websocket)
    print(f"🔌 WebSocket client connected (total: {len(ws_connections)})")

    try:
        # Send initial snapshot immediately
        await websocket.send_json({
            "type": "initial",
            "data": {
                "humidity": sensor_store.get("humidity"),
                "lux": sensor_store.get("lux"),
                "cwsi1": sensor_store.get("cwsi1"),
                "cwsi2": sensor_store.get("cwsi2"),
                "leaf_temp1": sensor_store.get("leaf_temp1"),
                "leaf_temp2": sensor_store.get("leaf_temp2"),
                "water_level1": sensor_store.get("water_level1"),
                "water_level2": sensor_store.get("water_level2"),
            },
            "controls": control_store,
            "mqtt_connected": is_mqtt_connected(),
        })

        # Keep connection alive, waiting for client messages
        while True:
            data = await websocket.receive_text()
            # Client can send ping or commands
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"⚠️ WebSocket error: {e}")
    finally:
        ws_connections.discard(websocket)
        print(f"🔌 WebSocket client disconnected (total: {len(ws_connections)})")


# ─── System Status ───────────────────────────────────────────
@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "Andrographis Smart Farm API",
        "version": "3.0.0",
        "mqtt_connected": is_mqtt_connected(),
        "architecture": "Raspberry Pi (Server/Cloud) + ESP32 (Sensor/Actuator)",
    }


# ─── Farm Stats Endpoint ────────────────────────────────────
@app.get("/api/farm/stats")
def get_farm_stats(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Return farm overview stats: days active, plots count, health %. Respects admin overrides."""
    # Check for admin overrides
    cursor = db.execute("SELECT key, value FROM config WHERE key IN ('farm_days', 'farm_plots', 'farm_health')")
    overrides = {}
    for row in cursor:
        overrides[row["key"]] = row["value"]

    # Days since first sensor reading (or override)
    if "farm_days" in overrides:
        days = int(overrides["farm_days"])
    else:
        cursor = db.execute("SELECT MIN(recorded_at) FROM sensor_data")
        row = cursor.fetchone()
        first = row[0] if row else None
        if first:
            try:
                delta = datetime.now() - datetime.fromisoformat(first)
                days = max(delta.days, 1)
            except Exception:
                days = 0
        else:
            days = 0

    # Distinct plot count (or override)
    if "farm_plots" in overrides:
        plots = int(overrides["farm_plots"])
    else:
        cursor = db.execute("SELECT COUNT(DISTINCT plot_id) FROM sensor_data")
        plots = cursor.fetchone()[0] or 2

    # Health from latest CWSI (or override)
    if "farm_health" in overrides:
        health = int(overrides["farm_health"])
    else:
        cursor = db.execute(
            "SELECT AVG(value) FROM sensor_data WHERE sensor_type='cwsi' AND recorded_at >= ?",
            ((datetime.now() - timedelta(days=1)).isoformat(),),
        )
        avg_cwsi = cursor.fetchone()[0]
        if avg_cwsi is not None:
            health = max(0, min(100, int((1 - avg_cwsi) * 100)))
        else:
            health = 85

    return {"days": days, "plots": plots, "health": health}


# ─── Notification Settings Endpoint ─────────────────────────
@app.get("/api/notifications/settings")
def get_notification_settings(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    cursor = db.execute("SELECT key, value FROM config WHERE key LIKE 'notif_%'")
    settings = {}
    for row in cursor:
        k = row["key"].replace("notif_", "")
        settings[k] = row["value"] == "true"
    # Defaults
    defaults = {"cwsi_alert": True, "water_alert": True, "temp_alert": False, "daily_report": True}
    for k, v in defaults.items():
        if k not in settings:
            settings[k] = v
    return settings


@app.put("/api/notifications/settings")
async def update_notification_settings(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    body = await request.json()
    db = sqlite3.connect("smartfarm.db", check_same_thread=False)
    db.row_factory = sqlite3.Row
    for k, v in body.items():
        db.execute(
            "INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
            (f"notif_{k}", "true" if v else "false"),
        )
    db.commit()
    db.close()
    return {"success": True}


async def _read_body(request: Request) -> bytes:
    return await request.body()


# ─── Domain Config Endpoint ─────────────────────────────────
@app.get("/api/config/domain")
def get_domain_config(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    cursor = db.execute("SELECT key, value FROM config WHERE key LIKE 'domain_%'")
    cfg = {}
    for row in cursor:
        k = row["key"].replace("domain_", "")
        cfg[k] = row["value"]
    return cfg if cfg else {"domain": "", "api_url": ""}


@app.put("/api/config/domain")
async def update_domain_config(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    body = await request.json()
    db = sqlite3.connect("smartfarm.db", check_same_thread=False)
    db.row_factory = sqlite3.Row
    for k, v in body.items():
        db.execute(
            "INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
            (f"domain_{k}", str(v)),
        )
    db.commit()
    db.close()
    return {"success": True}


# ─── Reports Summary Endpoint ───────────────────────────────
@app.get("/api/reports/summary")
def get_reports_summary(
    period: str = "week",
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    days = 7 if period == "week" else 30
    since = (datetime.now() - timedelta(days=days)).isoformat()

    cursor = db.execute("SELECT COUNT(*) FROM sensor_data WHERE recorded_at >= ?", (since,))
    total_readings = cursor.fetchone()[0]

    cursor = db.execute(
        "SELECT AVG(value) FROM sensor_data WHERE sensor_type='cwsi' AND recorded_at >= ?", (since,)
    )
    avg_cwsi = cursor.fetchone()[0]

    cursor = db.execute(
        "SELECT AVG(value) FROM sensor_data WHERE sensor_type='humidity' AND recorded_at >= ?", (since,)
    )
    avg_humidity = cursor.fetchone()[0]

    cursor = db.execute(
        "SELECT AVG(value) FROM sensor_data WHERE sensor_type='lux' AND recorded_at >= ?", (since,)
    )
    avg_lux = cursor.fetchone()[0]

    # Daily chart data
    chart = []
    for d in range(days):
        day = datetime.now() - timedelta(days=days - 1 - d)
        day_start = day.replace(hour=0, minute=0, second=0).isoformat()
        day_end = day.replace(hour=23, minute=59, second=59).isoformat()
        cursor = db.execute(
            "SELECT AVG(value) FROM sensor_data WHERE sensor_type='cwsi' AND recorded_at >= ? AND recorded_at <= ?",
            (day_start, day_end),
        )
        cwsi_val = cursor.fetchone()[0]
        cursor = db.execute(
            "SELECT AVG(value) FROM sensor_data WHERE sensor_type='humidity' AND recorded_at >= ? AND recorded_at <= ?",
            (day_start, day_end),
        )
        hum_val = cursor.fetchone()[0]
        chart.append({
            "date": day.strftime("%m/%d"),
            "cwsi": round(cwsi_val, 3) if cwsi_val else 0,
            "humidity": round(hum_val, 1) if hum_val else 0,
        })

    return {
        "total_readings": total_readings,
        "avg_cwsi": round(avg_cwsi, 3) if avg_cwsi else None,
        "avg_humidity": round(avg_humidity, 1) if avg_humidity else None,
        "avg_lux": round(avg_lux, 0) if avg_lux else None,
        "chart": chart,
    }


# ─── All Activity Log (Admin) ───────────────────────────────
@app.get("/api/security/all-activity")
def get_all_activity(
    current_user: dict = Depends(get_admin_user),
    db: sqlite3.Connection = Depends(get_db),
):
    cursor = db.execute(
        """SELECT username, action, ip_address, user_agent, status, created_at
           FROM audit_logs ORDER BY created_at DESC LIMIT 100"""
    )
    return [dict(row) for row in cursor.fetchall()]


# ─── Notification CRUD Endpoints ─────────────────────────────
@app.get("/api/notifications")
def get_notifications(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get all notifications, newest first."""
    cursor = db.execute(
        "SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100"
    )
    return [dict(row) for row in cursor.fetchall()]


@app.get("/api/notifications/unread-count")
def get_unread_count(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get count of unread notifications."""
    cursor = db.execute("SELECT COUNT(*) FROM notifications WHERE is_read = 0")
    return {"count": cursor.fetchone()[0]}


@app.post("/api/notifications/{notif_id}/read")
def mark_notification_read(
    notif_id: int,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    db.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", (notif_id,))
    db.commit()
    return {"success": True}


@app.post("/api/notifications/read-all")
def mark_all_notifications_read(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    db.execute("UPDATE notifications SET is_read = 1 WHERE is_read = 0")
    db.commit()
    return {"success": True}


@app.delete("/api/notifications/{notif_id}")
def delete_notification(
    notif_id: int,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    db.execute("DELETE FROM notifications WHERE id = ?", (notif_id,))
    db.commit()
    return {"success": True}


@app.delete("/api/notifications/clear")
def clear_all_notifications(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    db.execute("DELETE FROM notifications")
    db.commit()
    return {"success": True}


# ─── Sensor Data Table (Excel-like CRUD) ────────────────────
@app.get("/api/sensor-data/table")
def get_sensor_data_table(
    page: int = 1,
    per_page: int = 50,
    sensor_type: str = "",
    sort_by: str = "recorded_at",
    sort_dir: str = "desc",
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Paginated sensor data for Excel-like table view."""
    allowed_sort = {"id", "sensor_type", "plot_id", "value", "recorded_at"}
    if sort_by not in allowed_sort:
        sort_by = "recorded_at"
    sort_dir = "ASC" if sort_dir.lower() == "asc" else "DESC"

    where = ""
    params = []
    if sensor_type:
        where = "WHERE sensor_type = ?"
        params.append(sensor_type)

    # Total count
    cursor = db.execute(f"SELECT COUNT(*) FROM sensor_data {where}", params)
    total = cursor.fetchone()[0]

    # Paginate
    offset = (page - 1) * per_page
    cursor = db.execute(
        f"SELECT id, sensor_type, plot_id, value, recorded_at FROM sensor_data {where} ORDER BY {sort_by} {sort_dir} LIMIT ? OFFSET ?",
        (*params, per_page, offset),
    )
    rows = [dict(r) for r in cursor.fetchall()]

    return {
        "data": rows,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page if per_page > 0 else 0,
    }


@app.put("/api/sensor-data/{row_id}")
def update_sensor_data(
    row_id: int,
    update: SensorDataUpdate,
    current_user: dict = Depends(get_admin_user),
    db: sqlite3.Connection = Depends(get_db),
):
    db.execute("UPDATE sensor_data SET value = ? WHERE id = ?", (update.value, row_id))
    db.commit()
    return {"success": True}


@app.delete("/api/sensor-data/{row_id}")
def delete_sensor_data_row(
    row_id: int,
    current_user: dict = Depends(get_admin_user),
    db: sqlite3.Connection = Depends(get_db),
):
    db.execute("DELETE FROM sensor_data WHERE id = ?", (row_id,))
    db.commit()
    return {"success": True}


@app.post("/api/sensor-data")
def create_sensor_data(
    row: SensorDataCreate,
    current_user: dict = Depends(get_admin_user),
    db: sqlite3.Connection = Depends(get_db),
):
    recorded = row.recorded_at or datetime.now().isoformat()
    db.execute(
        "INSERT INTO sensor_data (sensor_type, plot_id, value, recorded_at) VALUES (?, ?, ?, ?)",
        (row.sensor_type, row.plot_id, row.value, recorded),
    )
    db.commit()
    return {"success": True}


@app.post("/api/sensor-data/upload-csv")
async def upload_sensor_csv(
    request: Request,
    current_user: dict = Depends(get_admin_user),
):
    """Upload CSV with columns: sensor_type,plot_id,value,recorded_at"""
    import csv as csv_module
    body = await request.body()
    text = body.decode("utf-8-sig")
    reader = csv_module.DictReader(io.StringIO(text))
    db = sqlite3.connect("smartfarm.db", check_same_thread=False)
    count = 0
    for row in reader:
        try:
            db.execute(
                "INSERT INTO sensor_data (sensor_type, plot_id, value, recorded_at) VALUES (?, ?, ?, ?)",
                (
                    row.get("sensor_type", "unknown"),
                    int(row.get("plot_id", 0)),
                    float(row.get("value", 0)),
                    row.get("recorded_at", datetime.now().isoformat()),
                ),
            )
            count += 1
        except Exception:
            continue
    db.commit()
    db.close()
    return {"success": True, "imported": count}


@app.get("/api/sensor-data/download-csv")
def download_sensor_csv(
    sensor_type: str = "",
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Download all sensor data as CSV."""
    where = ""
    params = []
    if sensor_type:
        where = "WHERE sensor_type = ?"
        params.append(sensor_type)
    cursor = db.execute(
        f"SELECT sensor_type, plot_id, value, recorded_at FROM sensor_data {where} ORDER BY recorded_at DESC",
        params,
    )
    rows = cursor.fetchall()
    output = io.StringIO()
    output.write("sensor_type,plot_id,value,recorded_at\n")
    for r in rows:
        output.write(f"{r['sensor_type']},{r['plot_id']},{r['value']},{r['recorded_at']}\n")
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sensor_data_export.csv"},
    )


# ─── Editable Farm Stats ────────────────────────────────────
@app.put("/api/farm/stats")
def update_farm_stats(
    update: FarmStatsUpdate,
    current_user: dict = Depends(get_admin_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Admin can override farm stats (days, plots, health)."""
    if update.days is not None:
        db.execute("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('farm_days', ?, CURRENT_TIMESTAMP)", (str(update.days),))
    if update.plots is not None:
        db.execute("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('farm_plots', ?, CURRENT_TIMESTAMP)", (str(update.plots),))
    if update.health is not None:
        db.execute("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('farm_health', ?, CURRENT_TIMESTAMP)", (str(update.health),))
    db.commit()
    return {"success": True}


# ─── User Approval Endpoints (admin) ────────────────────────
@app.get("/api/users/pending")
def get_pending_users(
    current_user: dict = Depends(get_admin_user),
    db: sqlite3.Connection = Depends(get_db),
):
    cursor = db.execute(
        "SELECT id, username, user_type, role, created_at FROM users WHERE approved = 0 ORDER BY created_at DESC"
    )
    return [dict(r) for r in cursor.fetchall()]


@app.post("/api/users/{user_id}/approve")
def approve_user(
    user_id: int,
    current_user: dict = Depends(get_admin_user),
    db: sqlite3.Connection = Depends(get_db),
):
    db.execute("UPDATE users SET approved = 1 WHERE id = ?", (user_id,))
    db.commit()
    return {"success": True, "message": "User approved"}


@app.post("/api/users/{user_id}/reject")
def reject_user(
    user_id: int,
    current_user: dict = Depends(get_admin_user),
    db: sqlite3.Connection = Depends(get_db),
):
    db.execute("DELETE FROM users WHERE id = ? AND approved = 0", (user_id,))
    db.commit()
    return {"success": True, "message": "User rejected and deleted"}


# ─── Mock-up Mode ────────────────────────────────────────────
_mock_mode = False
_mock_thread = None


@app.get("/api/mock/status")
def get_mock_status(current_user: dict = Depends(get_current_user)):
    return {"enabled": _mock_mode}


@app.post("/api/mock/toggle")
def toggle_mock_mode(current_user: dict = Depends(get_admin_user)):
    global _mock_mode, _mock_thread
    _mock_mode = not _mock_mode

    if _mock_mode and (_mock_thread is None or not _mock_thread.is_alive()):
        _mock_thread = threading.Thread(target=_mock_data_loop, daemon=True)
        _mock_thread.start()
        print("🎭 Mock-up mode ENABLED — generating realistic sensor data")
        # Create notification for mock mode enabled
        from mqtt_service import _create_notification
        _create_notification("mock_mode", "🎭 โหมดจำลองเปิดใช้งาน", "ระบบกำลังสร้างข้อมูลเซ็นเซอร์จำลองทุก 10 วินาที เพื่อทดสอบระบบ", "info")
    elif not _mock_mode:
        # Delete all mock-generated sensor data to avoid mixing with real data
        try:
            db = sqlite3.connect("smartfarm.db", check_same_thread=False)
            db.execute("PRAGMA journal_mode=WAL")
            deleted = db.execute("DELETE FROM sensor_data").rowcount
            db.commit()
            db.close()
            print(f"🎭 Mock-up mode DISABLED — deleted {deleted} mock sensor rows")
        except Exception as e:
            print(f"⚠️ Mock cleanup error: {e}")
        # Create notification for mock mode disabled
        from mqtt_service import _create_notification
        _create_notification("mock_mode", "🎭 โหมดจำลองปิดแล้ว", f"ล้างข้อมูลจำลองเรียบร้อย เพื่อไม่ให้ปนกับข้อมูลจริง", "info")

    return {"enabled": _mock_mode}


def _mock_data_loop():
    """Generate realistic random sensor data every 10s while mock mode is on."""
    import random
    import time as _time

    # Smooth starting values
    humidity = 65.0
    lux = 12000.0
    cwsi1_idx = 0.18
    cwsi2_idx = 0.22
    leaf_temp1 = 32.0
    leaf_temp2 = 33.0
    water_lvl1 = 75.0
    water_lvl2 = 80.0

    while _mock_mode:
        try:
            # Gradual random walk (realistic, no jumps)
            humidity = max(30, min(95, humidity + random.uniform(-1.5, 1.5)))
            lux = max(500, min(60000, lux + random.uniform(-500, 500)))
            cwsi1_idx = max(0.01, min(0.9, cwsi1_idx + random.uniform(-0.02, 0.02)))
            cwsi2_idx = max(0.01, min(0.9, cwsi2_idx + random.uniform(-0.02, 0.02)))
            leaf_temp1 = max(20, min(50, leaf_temp1 + random.uniform(-0.5, 0.5)))
            leaf_temp2 = max(20, min(50, leaf_temp2 + random.uniform(-0.5, 0.5)))
            water_lvl1 = max(5, min(100, water_lvl1 + random.uniform(-1, 1)))
            water_lvl2 = max(5, min(100, water_lvl2 + random.uniform(-1, 1)))

            now = datetime.now().isoformat()

            # Update in-memory stores
            sensor_store["humidity"] = round(humidity, 1)
            sensor_store["lux"] = round(lux, 0)
            sensor_store["cwsi1"] = {"value": round(cwsi1_idx, 3), "index": round(cwsi1_idx, 3)}
            sensor_store["cwsi2"] = {"value": round(cwsi2_idx, 3), "index": round(cwsi2_idx, 3)}
            sensor_store["leaf_temp1"] = round(leaf_temp1, 1)
            sensor_store["leaf_temp2"] = round(leaf_temp2, 1)
            sensor_store["water_level1"] = round(water_lvl1, 1)
            sensor_store["water_level2"] = round(water_lvl2, 1)

            # Persist to DB
            db = sqlite3.connect("smartfarm.db", check_same_thread=False)
            for st, pid, val in [
                ("humidity", 0, humidity), ("lux", 0, lux),
                ("cwsi", 1, cwsi1_idx), ("cwsi", 2, cwsi2_idx),
                ("leaf_temp", 1, leaf_temp1), ("leaf_temp", 2, leaf_temp2),
                ("water_level", 1, water_lvl1), ("water_level", 2, water_lvl2),
            ]:
                db.execute(
                    "INSERT INTO sensor_data (sensor_type, plot_id, value, recorded_at) VALUES (?, ?, ?, ?)",
                    (st, pid, round(val, 3), now),
                )
            db.commit()
            db.close()

            # Broadcast via WebSocket
            from mqtt_service import _broadcast_ws, _get_dashboard_snapshot, check_sensor_alerts
            _broadcast_ws({"type": "sensor_update", "data": _get_dashboard_snapshot(), "ts": now})

            # Check alerts (triggers notifications if thresholds exceeded)
            check_sensor_alerts("cwsi", cwsi1_idx, 1)
            check_sensor_alerts("cwsi", cwsi2_idx, 2)
            check_sensor_alerts("leaf_temp", leaf_temp1, 1)
            check_sensor_alerts("leaf_temp", leaf_temp2, 2)
            check_sensor_alerts("water_level", water_lvl1, 1)
            check_sensor_alerts("water_level", water_lvl2, 2)

        except Exception as e:
            print(f"⚠️ Mock data error: {e}")

        _time.sleep(10)
