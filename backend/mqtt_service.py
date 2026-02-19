import json
import sqlite3
import threading
import time
from datetime import datetime, timedelta
from config import MQTT_BROKER, MQTT_PORT, MQTT_USERNAME, MQTT_PASSWORD, MQTT_TOPICS, DATABASE_URL

# ─── Global sensor data store (in-memory, updated by MQTT) ──────
sensor_store = {
    "humidity": None,
    "lux": None,
    "cwsi1": {"value": None, "index": None},
    "cwsi2": {"value": None, "index": None},
    "leaf_temp1": None,
    "leaf_temp2": None,
    "water_level1": None,
    "water_level2": None,
}

# ─── Global control state store ─────────────────────────────────
control_store = {
    "whiteLight": False,
    "purpleLight": False,
    "ventilation": False,
    "masterSwitch": False,
}

# ─── WebSocket connections for real-time push ────────────────────
ws_connections = set()

mqtt_client = None
_mqtt_connected = False


# ─── Control state persistence ──────────────────────────────────
def load_control_states():
    """Load persisted control states from database on startup."""
    try:
        db = sqlite3.connect(DATABASE_URL, check_same_thread=False)
        db.row_factory = sqlite3.Row
        cursor = db.execute("SELECT key, value FROM config WHERE key LIKE 'ctrl_%'")
        for row in cursor:
            key = row["key"].replace("ctrl_", "")
            if key in control_store:
                control_store[key] = row["value"] == "true"
        db.close()
        print(f"✅ Loaded control states from DB: {control_store}")
    except Exception as e:
        print(f"⚠️ Could not load control states: {e}")


def persist_control_state(device: str, state: bool):
    """Save a single control state to database."""
    try:
        db = sqlite3.connect(DATABASE_URL, check_same_thread=False)
        db.execute(
            "INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
            (f"ctrl_{device}", "true" if state else "false"),
        )
        db.commit()
        db.close()
    except Exception as e:
        print(f"⚠️ DB persist control error ({device}): {e}")


def persist_all_control_states():
    """Save all current control states to database."""
    try:
        db = sqlite3.connect(DATABASE_URL, check_same_thread=False)
        for device, state in control_store.items():
            db.execute(
                "INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                (f"ctrl_{device}", "true" if state else "false"),
            )
        db.commit()
        db.close()
    except Exception as e:
        print(f"⚠️ DB persist all controls error: {e}")


def _persist_sensor(sensor_type: str, plot_id: int, value: float):
    """Write a sensor reading to SQLite for historical storage."""
    try:
        db = sqlite3.connect(DATABASE_URL, check_same_thread=False)
        db.execute(
            "INSERT INTO sensor_data (sensor_type, plot_id, value, recorded_at) VALUES (?, ?, ?, ?)",
            (sensor_type, plot_id, value, datetime.now().isoformat()),
        )
        db.commit()
        db.close()
    except Exception as e:
        print(f"⚠️ DB persist error ({sensor_type}): {e}")


# ─── Notification Engine ─────────────────────────────────────────
# Cooldown tracking: prevent duplicate notifications within 30 minutes
_notif_cooldown = {}
_NOTIF_COOLDOWN_MINUTES = 30

# Thresholds for alerts
_ALERT_THRESHOLDS = {
    "cwsi_alert": {"sensor": "cwsi", "condition": "above", "value": 0.4, "severity": "warning"},
    "water_alert": {"sensor": "water_level", "condition": "below", "value": 20.0, "severity": "warning"},
    "temp_alert": {"sensor": "leaf_temp", "condition": "above", "value": 40.0, "severity": "danger"},
}


def _get_notif_settings():
    """Load notification settings from database."""
    try:
        db = sqlite3.connect(DATABASE_URL, check_same_thread=False)
        db.row_factory = sqlite3.Row
        cursor = db.execute("SELECT key, value FROM config WHERE key LIKE 'notif_%'")
        settings = {}
        for row in cursor:
            k = row["key"].replace("notif_", "")
            settings[k] = row["value"] == "true"
        db.close()
        # Defaults
        defaults = {"cwsi_alert": True, "water_alert": True, "temp_alert": False, "daily_report": True}
        for k, v in defaults.items():
            if k not in settings:
                settings[k] = v
        return settings
    except Exception:
        return {"cwsi_alert": True, "water_alert": True, "temp_alert": False, "daily_report": True}


def _create_notification(notif_type: str, title: str, message: str, severity: str = "info"):
    """Create a notification in the database and push via WebSocket."""
    now = datetime.now()
    cooldown_key = f"{notif_type}_{severity}"

    # Check cooldown to prevent spam
    if cooldown_key in _notif_cooldown:
        last_time = _notif_cooldown[cooldown_key]
        if (now - last_time) < timedelta(minutes=_NOTIF_COOLDOWN_MINUTES):
            return  # Still in cooldown

    _notif_cooldown[cooldown_key] = now

    try:
        db = sqlite3.connect(DATABASE_URL, check_same_thread=False)
        db.execute(
            "INSERT INTO notifications (type, title, message, severity, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)",
            (notif_type, title, message, severity, now.isoformat()),
        )
        db.commit()

        # Get the newly created notification for WebSocket push
        cursor = db.execute("SELECT * FROM notifications ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        db.close()

        if row:
            notif_data = {
                "id": row[0], "type": row[1], "title": row[2],
                "message": row[3], "severity": row[4], "is_read": row[5],
                "created_at": row[6],
            }
            _broadcast_ws({"type": "notification", "data": notif_data})
            print(f"🔔 Notification created: [{severity}] {title}")
    except Exception as e:
        print(f"⚠️ Create notification error: {e}")


def check_sensor_alerts(sensor_type: str, value: float, plot_id: int = 0):
    """Check if a sensor value triggers any notification alerts."""
    settings = _get_notif_settings()

    for alert_key, config in _ALERT_THRESHOLDS.items():
        # Skip if notification type is disabled
        if not settings.get(alert_key, False):
            continue

        if config["sensor"] != sensor_type:
            continue

        threshold = config["value"]
        condition = config["condition"]
        severity = config["severity"]
        triggered = False

        if condition == "above" and value > threshold:
            triggered = True
        elif condition == "below" and value < threshold:
            triggered = True

        if triggered:
            plot_label = f" (แปลง {plot_id})" if plot_id > 0 else ""

            if sensor_type == "cwsi":
                title = f"⚠️ ค่า CWSI สูงผิดปกติ{plot_label}"
                message = f"ค่า CWSI วัดได้ {value:.3f} เกินเกณฑ์ {threshold} — พืชอาจมีภาวะเครียดน้ำ กรุณาตรวจสอบระบบน้ำ"
            elif sensor_type == "water_level":
                title = f"💧 ระดับน้ำต่ำ{plot_label}"
                message = f"ระดับน้ำวัดได้ {value:.1f}% ต่ำกว่าเกณฑ์ {threshold}% — กรุณาเติมน้ำในระบบ"
            elif sensor_type == "leaf_temp":
                title = f"🌡️ อุณหภูมิใบสูง{plot_label}"
                message = f"อุณหภูมิใบวัดได้ {value:.1f}°C เกินเกณฑ์ {threshold}°C — กรุณาตรวจสอบระบบระบายอากาศ"
            else:
                title = f"แจ้งเตือน {sensor_type}{plot_label}"
                message = f"ค่า {sensor_type} = {value} {'เกิน' if condition == 'above' else 'ต่ำกว่า'}เกณฑ์ {threshold}"

            _create_notification(alert_key, title, message, severity)


def _broadcast_ws(data: dict):
    """Send an update to all connected WebSocket clients."""
    import asyncio
    dead = set()
    msg = json.dumps(data)
    for ws in ws_connections.copy():
        try:
            asyncio.run_coroutine_threadsafe(ws.send_text(msg), ws._loop)
        except Exception:
            dead.add(ws)
    ws_connections -= dead


def on_connect(client, userdata, flags, rc):
    global _mqtt_connected
    rc_codes = {
        0: "Success",
        1: "Incorrect protocol version",
        2: "Invalid client identifier",
        3: "Server unavailable",
        4: "Bad username or password",
        5: "Not authorized",
    }
    status = rc_codes.get(rc, f"Unknown ({rc})")
    print(f"🔗 MQTT broker connection: {status}")

    if rc == 0:
        _mqtt_connected = True
        # Subscribe to ALL sensor topics
        for key, topic in MQTT_TOPICS.items():
            if key.startswith("sensor_"):
                client.subscribe(topic, qos=1)
                print(f"  📡 Subscribed to {topic}")
    else:
        _mqtt_connected = False


def on_disconnect(client, userdata, rc):
    global _mqtt_connected
    _mqtt_connected = False
    if rc != 0:
        print(f"⚠️ Unexpected MQTT disconnect (rc={rc}). Will auto-reconnect.")


def on_message(client, userdata, msg):
    """Handle incoming sensor data from MQTT, update store & persist to DB."""
    topic = msg.topic
    try:
        payload = msg.payload.decode()
        now = datetime.now().isoformat()

        if topic == MQTT_TOPICS["sensor_humidity"]:
            val = float(payload)
            sensor_store["humidity"] = val
            _persist_sensor("humidity", 0, val)
            check_sensor_alerts("humidity", val)

        elif topic == MQTT_TOPICS["sensor_lux"]:
            val = float(payload)
            sensor_store["lux"] = val
            _persist_sensor("lux", 0, val)
            check_sensor_alerts("lux", val)

        elif topic == MQTT_TOPICS["sensor_cwsi1"]:
            if payload.strip().startswith("{"):
                data = json.loads(payload)
            else:
                data = {"value": float(payload), "index": float(payload)}
            sensor_store["cwsi1"] = data
            idx = data.get("index", data.get("value", 0))
            _persist_sensor("cwsi", 1, idx)
            check_sensor_alerts("cwsi", idx, 1)

        elif topic == MQTT_TOPICS["sensor_cwsi2"]:
            if payload.strip().startswith("{"):
                data = json.loads(payload)
            else:
                data = {"value": float(payload), "index": float(payload)}
            sensor_store["cwsi2"] = data
            idx = data.get("index", data.get("value", 0))
            _persist_sensor("cwsi", 2, idx)
            check_sensor_alerts("cwsi", idx, 2)

        elif topic == MQTT_TOPICS["sensor_leaf_temp1"]:
            val = float(payload)
            sensor_store["leaf_temp1"] = val
            _persist_sensor("leaf_temp", 1, val)
            check_sensor_alerts("leaf_temp", val, 1)

        elif topic == MQTT_TOPICS["sensor_leaf_temp2"]:
            val = float(payload)
            sensor_store["leaf_temp2"] = val
            _persist_sensor("leaf_temp", 2, val)
            check_sensor_alerts("leaf_temp", val, 2)

        elif topic == MQTT_TOPICS["sensor_water_level1"]:
            val = float(payload)
            sensor_store["water_level1"] = val
            _persist_sensor("water_level", 1, val)
            check_sensor_alerts("water_level", val, 1)

        elif topic == MQTT_TOPICS["sensor_water_level2"]:
            val = float(payload)
            sensor_store["water_level2"] = val
            _persist_sensor("water_level", 2, val)
            check_sensor_alerts("water_level", val, 2)

        # Push real-time update to WebSocket clients
        _broadcast_ws({"type": "sensor_update", "data": _get_dashboard_snapshot(), "ts": now})

    except Exception as e:
        print(f"⚠️ Error processing MQTT message on {topic}: {e}")


def _get_dashboard_snapshot():
    """Build a compact dashboard snapshot for WS broadcast."""
    return {
        "humidity": sensor_store.get("humidity"),
        "lux": sensor_store.get("lux"),
        "cwsi1": sensor_store.get("cwsi1"),
        "cwsi2": sensor_store.get("cwsi2"),
        "leaf_temp1": sensor_store.get("leaf_temp1"),
        "leaf_temp2": sensor_store.get("leaf_temp2"),
        "water_level1": sensor_store.get("water_level1"),
        "water_level2": sensor_store.get("water_level2"),
    }


def publish_control(device: str, state: bool):
    """Publish control command to MQTT — ESP32 handles GPIO."""
    global mqtt_client

    # Publish to MQTT so ESP32 and other subscribers know
    topic = MQTT_TOPICS.get(device)
    if topic and mqtt_client and _mqtt_connected:
        try:
            mqtt_client.publish(topic, "ON" if state else "OFF", qos=1, retain=True)
            print(f"📤 Published {device} = {'ON' if state else 'OFF'} → {topic}")
        except Exception as e:
            print(f"⚠️ Failed to publish: {e}")

    # Update local state
    if device in control_store:
        control_store[device] = state


def init_mqtt(broker=None, port=None, username=None, password=None):
    """Initialize MQTT client connection."""
    global mqtt_client, _mqtt_connected
    _broker = broker or MQTT_BROKER
    _port = port or MQTT_PORT
    _username = username or MQTT_USERNAME
    _password = password or MQTT_PASSWORD

    try:
        import paho.mqtt.client as mqtt_module

        # If an old client exists, stop it first
        if mqtt_client is not None:
            try:
                mqtt_client.loop_stop()
                mqtt_client.disconnect()
            except Exception:
                pass

        mqtt_client = mqtt_module.Client()
        mqtt_client.on_connect = on_connect
        mqtt_client.on_disconnect = on_disconnect
        mqtt_client.on_message = on_message

        # Enable automatic reconnection
        mqtt_client.reconnect_delay_set(min_delay=1, max_delay=30)

        if _username:
            mqtt_client.username_pw_set(_username, _password)

        mqtt_client.connect_async(_broker, int(_port), 60)
        mqtt_client.loop_start()
        print(f"🚀 MQTT client connecting to {_broker}:{_port}")
    except Exception as e:
        print(f"⚠️ MQTT connection failed (running without MQTT): {e}")
        mqtt_client = None
        _mqtt_connected = False


def reconnect_mqtt(broker: str, port: int, username: str = "", password: str = ""):
    """Disconnect existing MQTT and reconnect with new settings."""
    print(f"🔄 Reconnecting MQTT to {broker}:{port}...")
    init_mqtt(broker=broker, port=port, username=username, password=password)


def is_mqtt_connected() -> bool:
    """Check if MQTT is currently connected."""
    return _mqtt_connected
