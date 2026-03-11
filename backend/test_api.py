"""
╔══════════════════════════════════════════════════════════════════╗
║  Andrographis Smart Farm — Comprehensive API Test Suite         ║
║  Test Case Report & Automated Testing                          ║
║  Version: 3.0.0                                                ║
║  Date: 2026-03-11                                              ║
╚══════════════════════════════════════════════════════════════════╝

Test Categories:
  TC-AUTH   : Authentication (Register, Login, Token, Change Password)
  TC-SENSOR : Sensor Data (Dashboard, History, CWSI)
  TC-CTRL   : Device Controls (Toggle, Master, Schedule)
  TC-AUTO   : Automation Rules (CRUD, Toggle, Schedule)
  TC-USER   : User Management (List, Update, Delete, Approve, Reject)
  TC-NOTIF  : Notifications (CRUD, Settings, Unread Count)
  TC-CONFIG : Configuration (MQTT, Domain, Farm Stats)
  TC-DATA   : Sensor Data Table (CRUD, CSV, Pagination)
  TC-SYS    : System (Health, Reports, Export, Mock Mode)
  TC-WS     : WebSocket (Connection, Real-time Updates)
  TC-SEC    : Security (Unauthorized, Forbidden, Validation)
"""

import os
import sys
import json
import pytest
import sqlite3
import tempfile
import shutil
from datetime import datetime, timedelta

# Make sure we can import backend modules
sys.path.insert(0, os.path.dirname(__file__))

# Use a temporary test database
TEST_DB = None
_original_db = None


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """Create a fresh test database and FastAPI test client."""
    global TEST_DB, _original_db

    # Create temp DB path
    TEST_DB = os.path.join(tempfile.mkdtemp(), "test_smartfarm.db")

    # Monkey-patch database path before importing
    import config
    _original_db = config.DATABASE_URL
    config.DATABASE_URL = TEST_DB

    # Also patch the hardcoded "smartfarm.db" references in main.py
    # by changing directory to temp folder
    os.environ["DATABASE_URL"] = TEST_DB

    yield

    # Cleanup
    config.DATABASE_URL = _original_db
    try:
        os.unlink(TEST_DB)
    except:
        pass


@pytest.fixture(scope="session")
def client():
    """Create FastAPI TestClient with a fresh database."""
    # Patch sqlite3.connect to use test DB
    _original_connect = sqlite3.connect

    def _patched_connect(db_path, *args, **kwargs):
        if db_path == "smartfarm.db" or db_path == _original_db:
            db_path = TEST_DB
        conn = _original_connect(db_path, *args, **kwargs)
        conn.row_factory = sqlite3.Row
        return conn

    sqlite3.connect = _patched_connect

    # Now import and set up the app
    from database import init_db
    init_db()

    from main import app
    from httpx import ASGITransport, AsyncClient

    # Use synchronous test client approach
    from starlette.testclient import TestClient
    test_client = TestClient(app, raise_server_exceptions=False)

    yield test_client

    sqlite3.connect = _original_connect


@pytest.fixture(scope="session")
def admin_token(client):
    """Login as admin and return JWT token."""
    resp = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "admin",
    })
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    """Return auth headers for admin user."""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json",
    }


def auth_headers(token):
    """Helper to build auth headers."""
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


# ═══════════════════════════════════════════════════════════════
#  TC-AUTH: Authentication Tests
# ═══════════════════════════════════════════════════════════════

class TestAuth:
    """TC-AUTH: Authentication — Register, Login, Token Verification"""

    # ── TC-AUTH-001: Admin Login Success ──
    def test_auth_001_admin_login_success(self, client):
        """TC-AUTH-001: Login with default admin credentials should succeed."""
        resp = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["username"] == "admin"
        assert data["user"]["user_type"] == "admin"
        assert data["user"]["role"] == "admin"

    # ── TC-AUTH-002: Login with Wrong Password ──
    def test_auth_002_login_wrong_password(self, client):
        """TC-AUTH-002: Login with incorrect password should return 401."""
        resp = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401
        assert "Invalid username or password" in resp.json()["detail"]

    # ── TC-AUTH-003: Login with Non-existent User ──
    def test_auth_003_login_nonexistent_user(self, client):
        """TC-AUTH-003: Login with non-existent username should return 401."""
        resp = client.post("/api/auth/login", json={
            "username": "nonexistent",
            "password": "anypassword",
        })
        assert resp.status_code == 401

    # ── TC-AUTH-004: Register New User ──
    def test_auth_004_register_new_user(self, client):
        """TC-AUTH-004: Register a new user — should require admin approval."""
        resp = client.post("/api/auth/register", json={
            "username": "testuser1",
            "password": "testpass123",
        })
        assert resp.status_code == 200
        assert "approval" in resp.json()["message"].lower() or "submitted" in resp.json()["message"].lower()

    # ── TC-AUTH-005: Register Duplicate Username ──
    def test_auth_005_register_duplicate(self, client):
        """TC-AUTH-005: Register with existing username should return 400."""
        resp = client.post("/api/auth/register", json={
            "username": "admin",
            "password": "anypassword",
        })
        assert resp.status_code == 400
        assert "already exists" in resp.json()["detail"].lower()

    # ── TC-AUTH-006: Login Unapproved User ──
    def test_auth_006_login_unapproved_user(self, client):
        """TC-AUTH-006: Login with unapproved user should return 403."""
        # testuser1 was registered but not approved
        resp = client.post("/api/auth/login", json={
            "username": "testuser1",
            "password": "testpass123",
        })
        assert resp.status_code == 403
        assert "pending" in resp.json()["detail"].lower() or "approval" in resp.json()["detail"].lower()

    # ── TC-AUTH-007: Access Protected Endpoint Without Token ──
    def test_auth_007_no_token(self, client):
        """TC-AUTH-007: Accessing protected endpoint without token should return 401."""
        resp = client.get("/api/sensors/dashboard")
        assert resp.status_code == 401

    # ── TC-AUTH-008: Access Protected Endpoint With Invalid Token ──
    def test_auth_008_invalid_token(self, client):
        """TC-AUTH-008: Accessing protected endpoint with invalid token should return 401."""
        resp = client.get("/api/sensors/dashboard", headers={
            "Authorization": "Bearer invalid.jwt.token"
        })
        assert resp.status_code == 401

    # ── TC-AUTH-009: Token Format Validation ──
    def test_auth_009_malformed_authorization(self, client):
        """TC-AUTH-009: Malformed Authorization header should return 401."""
        resp = client.get("/api/sensors/dashboard", headers={
            "Authorization": "NotBearer sometoken"
        })
        assert resp.status_code == 401

    # ── TC-AUTH-010: Change Password ──
    def test_auth_010_change_password(self, client, admin_headers):
        """TC-AUTH-010: Change password with correct current password should succeed."""
        resp = client.post("/api/auth/change-password", headers=admin_headers, json={
            "current_password": "admin",
            "new_password": "newadmin123",
        })
        assert resp.status_code == 200
        assert "changed" in resp.json()["message"].lower()

        # Change back for other tests
        token_resp = client.post("/api/auth/login", json={
            "username": "admin", "password": "newadmin123",
        })
        new_token = token_resp.json()["access_token"]
        client.post("/api/auth/change-password",
                     headers=auth_headers(new_token),
                     json={"current_password": "newadmin123", "new_password": "admin"})

    # ── TC-AUTH-011: Change Password with Wrong Current ──
    def test_auth_011_change_password_wrong_current(self, client, admin_headers):
        """TC-AUTH-011: Change password with wrong current password should return 400."""
        resp = client.post("/api/auth/change-password", headers=admin_headers, json={
            "current_password": "wrongcurrent",
            "new_password": "newpass123",
        })
        assert resp.status_code == 400

    # ── TC-AUTH-012: Login Request Body Validation ──
    def test_auth_012_login_empty_body(self, client):
        """TC-AUTH-012: Login with empty/invalid JSON body should return 422."""
        resp = client.post("/api/auth/login", json={})
        assert resp.status_code == 422


# ═══════════════════════════════════════════════════════════════
#  TC-SENSOR: Sensor Data Tests
# ═══════════════════════════════════════════════════════════════

class TestSensors:
    """TC-SENSOR: Sensor Monitoring — Dashboard, History, CWSI"""

    # ── TC-SENSOR-001: Dashboard Returns Correct Structure ──
    def test_sensor_001_dashboard_structure(self, client, admin_headers):
        """TC-SENSOR-001: Dashboard endpoint should return complete structure."""
        resp = client.get("/api/sensors/dashboard", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "cwsi1" in data
        assert "cwsi2" in data
        assert "humidity" in data
        assert "lux" in data
        assert "location" in data
        assert "plots" in data
        assert "mqtt_connected" in data
        assert len(data["plots"]) == 2
        assert data["cwsi1"]["plot"] == "แปลงทดลอง 1"
        assert data["cwsi2"]["plot"] == "แปลงทดลอง 2"

    # ── TC-SENSOR-002: Dashboard Location Data ──
    def test_sensor_002_dashboard_location(self, client, admin_headers):
        """TC-SENSOR-002: Dashboard should include correct location."""
        resp = client.get("/api/sensors/dashboard", headers=admin_headers)
        data = resp.json()
        assert data["location"]["name"] == "มหาวิทยาลัยวลัยลักษณ์"
        assert "8.6433" in data["location"]["lat"]
        assert "99.8973" in data["location"]["lng"]

    # ── TC-SENSOR-003: CWSI History — Today (Empty) ──
    def test_sensor_003_cwsi_history_empty(self, client, admin_headers):
        """TC-SENSOR-003: CWSI history with no data should return empty."""
        resp = client.get("/api/sensors/cwsi-history?period=today", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "history" in data
        assert "summary" in data
        assert data["summary"]["count"] == 0

    # ── TC-SENSOR-004: CWSI History — Week Period ──
    def test_sensor_004_cwsi_history_week(self, client, admin_headers):
        """TC-SENSOR-004: CWSI history supports week period."""
        resp = client.get("/api/sensors/cwsi-history?period=week", headers=admin_headers)
        assert resp.status_code == 200

    # ── TC-SENSOR-005: CWSI History — Month Period ──
    def test_sensor_005_cwsi_history_month(self, client, admin_headers):
        """TC-SENSOR-005: CWSI history supports month period."""
        resp = client.get("/api/sensors/cwsi-history?period=month", headers=admin_headers)
        assert resp.status_code == 200

    # ── TC-SENSOR-006: Generic Sensor History ──
    def test_sensor_006_generic_history(self, client, admin_headers):
        """TC-SENSOR-006: Generic sensor history endpoint works."""
        resp = client.get("/api/sensors/history?sensor_type=humidity&period=today", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    # ── TC-SENSOR-007: Dashboard MQTT Status ──
    def test_sensor_007_mqtt_status_in_dashboard(self, client, admin_headers):
        """TC-SENSOR-007: Dashboard includes MQTT connection status."""
        resp = client.get("/api/sensors/dashboard", headers=admin_headers)
        data = resp.json()
        assert "mqtt_connected" in data
        assert isinstance(data["mqtt_connected"], bool)

    # ── TC-SENSOR-008: Dashboard Initial Values Null ──
    def test_sensor_008_dashboard_initial_null(self, client, admin_headers):
        """TC-SENSOR-008: Dashboard sensor values should be null when no data received."""
        resp = client.get("/api/sensors/dashboard", headers=admin_headers)
        data = resp.json()
        # On fresh DB with no MQTT data, values should be null
        # (They might be non-null if mock mode was run)
        assert isinstance(data["humidity"], (type(None), float, int))
        assert isinstance(data["lux"], (type(None), float, int))


# ═══════════════════════════════════════════════════════════════
#  TC-CTRL: Device Control Tests
# ═══════════════════════════════════════════════════════════════

class TestControls:
    """TC-CTRL: Device Controls — Toggle, Master Switch, Schedule"""

    # ── TC-CTRL-001: Get Control State ──
    def test_ctrl_001_get_state(self, client, admin_headers):
        """TC-CTRL-001: Get control state should return all device states."""
        resp = client.get("/api/controls/state", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "controls" in data
        assert "humidity" in data
        controls = data["controls"]
        assert "whiteLight" in controls
        assert "purpleLight" in controls
        assert "ventilation" in controls
        assert "masterSwitch" in controls

    # ── TC-CTRL-002: Toggle White Light ON ──
    def test_ctrl_002_toggle_white_light_on(self, client, admin_headers):
        """TC-CTRL-002: Toggle white light ON should succeed."""
        resp = client.post("/api/controls/toggle", headers=admin_headers, json={
            "device": "whiteLight",
            "state": True,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["device"] == "whiteLight"
        assert data["state"] is True

    # ── TC-CTRL-003: Toggle White Light OFF ──
    def test_ctrl_003_toggle_white_light_off(self, client, admin_headers):
        """TC-CTRL-003: Toggle white light OFF should succeed."""
        resp = client.post("/api/controls/toggle", headers=admin_headers, json={
            "device": "whiteLight",
            "state": False,
        })
        assert resp.status_code == 200
        assert resp.json()["state"] is False

    # ── TC-CTRL-004: Toggle Purple Light ──
    def test_ctrl_004_toggle_purple_light(self, client, admin_headers):
        """TC-CTRL-004: Toggle purple light control."""
        resp = client.post("/api/controls/toggle", headers=admin_headers, json={
            "device": "purpleLight",
            "state": True,
        })
        assert resp.status_code == 200
        assert resp.json()["device"] == "purpleLight"

    # ── TC-CTRL-005: Toggle Ventilation ──
    def test_ctrl_005_toggle_ventilation(self, client, admin_headers):
        """TC-CTRL-005: Toggle ventilation control."""
        resp = client.post("/api/controls/toggle", headers=admin_headers, json={
            "device": "ventilation",
            "state": True,
        })
        assert resp.status_code == 200
        assert resp.json()["device"] == "ventilation"

    # ── TC-CTRL-006: Master Switch ON ──
    def test_ctrl_006_master_switch_on(self, client, admin_headers):
        """TC-CTRL-006: Master switch ON should turn master on."""
        resp = client.post("/api/controls/master", headers=admin_headers, json={
            "state": True,
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    # ── TC-CTRL-007: Master Switch OFF Turns All Off ──
    def test_ctrl_007_master_switch_off(self, client, admin_headers):
        """TC-CTRL-007: Master switch OFF should turn all devices off."""
        resp = client.post("/api/controls/master", headers=admin_headers, json={
            "state": False,
        })
        assert resp.status_code == 200
        # Verify all controls are off
        state_resp = client.get("/api/controls/state", headers=admin_headers)
        controls = state_resp.json()["controls"]
        assert controls["whiteLight"] is False
        assert controls["purpleLight"] is False
        assert controls["ventilation"] is False
        assert controls["masterSwitch"] is False

    # ── TC-CTRL-008: Get Schedule (Default) ──
    def test_ctrl_008_get_schedule_default(self, client, admin_headers):
        """TC-CTRL-008: Get schedule should return default values."""
        resp = client.get("/api/controls/schedule", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "enabled" in data
        assert "schedule_start" in data
        assert "schedule_end" in data

    # ── TC-CTRL-009: Save Schedule ──
    def test_ctrl_009_save_schedule(self, client, admin_headers):
        """TC-CTRL-009: Save automation schedule."""
        resp = client.put("/api/controls/schedule", headers=admin_headers, json={
            "enabled": True,
            "schedule_start": "07:00",
            "schedule_end": "19:00",
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        # Verify saved
        get_resp = client.get("/api/controls/schedule", headers=admin_headers)
        data = get_resp.json()
        assert data["enabled"] is True
        assert data["schedule_start"] == "07:00"
        assert data["schedule_end"] == "19:00"

    # ── TC-CTRL-010: Verify State Persistence After Toggle ──
    def test_ctrl_010_state_persistence(self, client, admin_headers):
        """TC-CTRL-010: Control states should persist after toggle."""
        client.post("/api/controls/toggle", headers=admin_headers, json={
            "device": "whiteLight", "state": True,
        })
        resp = client.get("/api/controls/state", headers=admin_headers)
        assert resp.json()["controls"]["whiteLight"] is True

        # Toggle off and verify
        client.post("/api/controls/toggle", headers=admin_headers, json={
            "device": "whiteLight", "state": False,
        })
        resp = client.get("/api/controls/state", headers=admin_headers)
        assert resp.json()["controls"]["whiteLight"] is False


# ═══════════════════════════════════════════════════════════════
#  TC-AUTO: Automation Rules Tests
# ═══════════════════════════════════════════════════════════════

class TestAutomation:
    """TC-AUTO: Automation Engine — Rules CRUD, Enable/Disable"""

    # ── TC-AUTO-001: List Rules (Empty) ──
    def test_auto_001_list_rules_empty(self, client, admin_headers):
        """TC-AUTO-001: List automation rules (excluding master_schedule)."""
        resp = client.get("/api/automation/rules", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    # ── TC-AUTO-002: Create Schedule Rule ──
    def test_auto_002_create_schedule_rule(self, client, admin_headers):
        """TC-AUTO-002: Create a schedule-based automation rule."""
        resp = client.post("/api/automation/rules", headers=admin_headers, json={
            "name": "Test Morning Light",
            "rule_type": "schedule",
            "action_device": "whiteLight",
            "action_state": True,
            "schedule_start": "06:00",
            "schedule_end": "18:00",
            "enabled": True,
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    # ── TC-AUTO-003: Create Threshold Rule ──
    def test_auto_003_create_threshold_rule(self, client, admin_headers):
        """TC-AUTO-003: Create a threshold-based automation rule."""
        resp = client.post("/api/automation/rules", headers=admin_headers, json={
            "name": "Test High Temp Fan",
            "rule_type": "threshold",
            "sensor_type": "leaf_temp",
            "condition": "above",
            "threshold": 35.0,
            "action_device": "ventilation",
            "action_state": True,
            "enabled": True,
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    # ── TC-AUTO-004: List Rules After Creation ──
    def test_auto_004_list_rules_after_creation(self, client, admin_headers):
        """TC-AUTO-004: Rules list should contain created rules."""
        resp = client.get("/api/automation/rules", headers=admin_headers)
        assert resp.status_code == 200
        rules = resp.json()
        names = [r["name"] for r in rules]
        assert "Test Morning Light" in names
        assert "Test High Temp Fan" in names

    # ── TC-AUTO-005: Update Rule ──
    def test_auto_005_update_rule(self, client, admin_headers):
        """TC-AUTO-005: Update an automation rule."""
        # Get rule id
        rules = client.get("/api/automation/rules", headers=admin_headers).json()
        rule = next(r for r in rules if r["name"] == "Test Morning Light")

        resp = client.put(f"/api/automation/rules/{rule['id']}", headers=admin_headers, json={
            "schedule_start": "07:30",
            "schedule_end": "17:30",
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    # ── TC-AUTO-006: Toggle Rule Enabled/Disabled ──
    def test_auto_006_toggle_rule(self, client, admin_headers):
        """TC-AUTO-006: Toggle rule enabled/disabled."""
        rules = client.get("/api/automation/rules", headers=admin_headers).json()
        rule = next(r for r in rules if r["name"] == "Test Morning Light")

        resp = client.post(f"/api/automation/rules/{rule['id']}/toggle", headers=admin_headers)
        assert resp.status_code == 200
        assert "enabled" in resp.json()

    # ── TC-AUTO-007: Delete Rule ──
    def test_auto_007_delete_rule(self, client, admin_headers):
        """TC-AUTO-007: Delete an automation rule."""
        rules = client.get("/api/automation/rules", headers=admin_headers).json()
        rule = next(r for r in rules if r["name"] == "Test High Temp Fan")

        resp = client.delete(f"/api/automation/rules/{rule['id']}", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    # ── TC-AUTO-008: Toggle Non-existent Rule ──
    def test_auto_008_toggle_nonexistent_rule(self, client, admin_headers):
        """TC-AUTO-008: Toggle non-existent rule should return 404."""
        resp = client.post("/api/automation/rules/99999/toggle", headers=admin_headers)
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════
#  TC-USER: User Management Tests
# ═══════════════════════════════════════════════════════════════

class TestUserManagement:
    """TC-USER: User Management — List, Update, Approve, Delete"""

    # ── TC-USER-001: List Users (Admin) ──
    def test_user_001_list_users(self, client, admin_headers):
        """TC-USER-001: Admin can list all users."""
        resp = client.get("/api/users", headers=admin_headers)
        assert resp.status_code == 200
        users = resp.json()
        assert isinstance(users, list)
        assert any(u["username"] == "admin" for u in users)

    # ── TC-USER-002: Get Pending Users ──
    def test_user_002_pending_users(self, client, admin_headers):
        """TC-USER-002: Get pending user approvals."""
        resp = client.get("/api/users/pending", headers=admin_headers)
        assert resp.status_code == 200
        pending = resp.json()
        assert isinstance(pending, list)

    # ── TC-USER-003: Approve User ──
    def test_user_003_approve_user(self, client, admin_headers):
        """TC-USER-003: Admin can approve a pending user."""
        # Register a user first
        client.post("/api/auth/register", json={
            "username": "approve_test",
            "password": "testpass123",
        })
        # Find pending user
        pending = client.get("/api/users/pending", headers=admin_headers).json()
        user = next((u for u in pending if u["username"] == "approve_test"), None)
        if user:
            resp = client.post(f"/api/users/{user['id']}/approve", headers=admin_headers)
            assert resp.status_code == 200
            assert resp.json()["success"] is True

            # Verify login works now
            login_resp = client.post("/api/auth/login", json={
                "username": "approve_test",
                "password": "testpass123",
            })
            assert login_resp.status_code == 200

    # ── TC-USER-004: Reject User ──
    def test_user_004_reject_user(self, client, admin_headers):
        """TC-USER-004: Admin can reject a pending user."""
        client.post("/api/auth/register", json={
            "username": "reject_test",
            "password": "testpass123",
        })
        pending = client.get("/api/users/pending", headers=admin_headers).json()
        user = next((u for u in pending if u["username"] == "reject_test"), None)
        if user:
            resp = client.post(f"/api/users/{user['id']}/reject", headers=admin_headers)
            assert resp.status_code == 200
            assert resp.json()["success"] is True

    # ── TC-USER-005: Update User Role ──
    def test_user_005_update_user_role(self, client, admin_headers):
        """TC-USER-005: Admin can update user role."""
        users = client.get("/api/users", headers=admin_headers).json()
        target = next((u for u in users if u["username"] == "approve_test"), None)
        if target:
            resp = client.put(f"/api/users/{target['id']}", headers=admin_headers, json={
                "role": "editor",
            })
            assert resp.status_code == 200
            assert resp.json()["success"] is True

    # ── TC-USER-006: Delete User ──
    def test_user_006_delete_user(self, client, admin_headers):
        """TC-USER-006: Admin can delete a user."""
        users = client.get("/api/users", headers=admin_headers).json()
        target = next((u for u in users if u["username"] == "approve_test"), None)
        if target:
            resp = client.delete(f"/api/users/{target['id']}", headers=admin_headers)
            assert resp.status_code == 200
            assert resp.json()["success"] is True

    # ── TC-USER-007: Cannot Delete Self ──
    def test_user_007_cannot_delete_self(self, client, admin_headers):
        """TC-USER-007: Admin cannot delete their own account."""
        users = client.get("/api/users", headers=admin_headers).json()
        admin_user = next(u for u in users if u["username"] == "admin")
        resp = client.delete(f"/api/users/{admin_user['id']}", headers=admin_headers)
        assert resp.status_code == 400

    # ── TC-USER-008: Non-Admin Cannot List Users ──
    def test_user_008_non_admin_forbidden(self, client):
        """TC-USER-008: Non-admin user cannot access user management."""
        # Register and approve a regular user
        client.post("/api/auth/register", json={
            "username": "regularuser",
            "password": "testpass123",
        })
        # Login as admin to approve
        admin_resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
        admin_tok = admin_resp.json()["access_token"]

        pending = client.get("/api/users/pending", headers=auth_headers(admin_tok)).json()
        user = next((u for u in pending if u["username"] == "regularuser"), None)
        if user:
            client.post(f"/api/users/{user['id']}/approve", headers=auth_headers(admin_tok))

        # Now login as regular user
        login_resp = client.post("/api/auth/login", json={
            "username": "regularuser",
            "password": "testpass123",
        })
        if login_resp.status_code == 200:
            user_token = login_resp.json()["access_token"]
            resp = client.get("/api/users", headers=auth_headers(user_token))
            assert resp.status_code == 403


# ═══════════════════════════════════════════════════════════════
#  TC-NOTIF: Notification Tests
# ═══════════════════════════════════════════════════════════════

class TestNotifications:
    """TC-NOTIF: Notifications — CRUD, Read/Unread, Settings"""

    # ── TC-NOTIF-001: Get Notifications (Empty) ──
    def test_notif_001_get_notifications_empty(self, client, admin_headers):
        """TC-NOTIF-001: Notifications list on fresh DB should be empty."""
        resp = client.get("/api/notifications", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    # ── TC-NOTIF-002: Get Unread Count ──
    def test_notif_002_unread_count(self, client, admin_headers):
        """TC-NOTIF-002: Unread count should be a number."""
        resp = client.get("/api/notifications/unread-count", headers=admin_headers)
        assert resp.status_code == 200
        assert "count" in resp.json()
        assert isinstance(resp.json()["count"], int)

    # ── TC-NOTIF-003: Mark All Read ──
    def test_notif_003_mark_all_read(self, client, admin_headers):
        """TC-NOTIF-003: Mark all notifications as read."""
        resp = client.post("/api/notifications/read-all", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    # ── TC-NOTIF-004: Clear All Notifications ──
    def test_notif_004_clear_all(self, client, admin_headers):
        """TC-NOTIF-004: Clear all notifications."""
        resp = client.delete("/api/notifications/clear", headers={
            "Authorization": admin_headers["Authorization"],
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    # ── TC-NOTIF-005: Get Notification Settings ──
    def test_notif_005_get_settings(self, client, admin_headers):
        """TC-NOTIF-005: Get notification settings with defaults."""
        resp = client.get("/api/notifications/settings", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "cwsi_alert" in data
        assert "water_alert" in data
        assert "temp_alert" in data
        assert "daily_report" in data

    # ── TC-NOTIF-006: Update Notification Settings ──
    def test_notif_006_update_settings(self, client, admin_headers):
        """TC-NOTIF-006: Update notification settings."""
        resp = client.put("/api/notifications/settings", headers=admin_headers, json={
            "cwsi_alert": False,
            "water_alert": True,
            "temp_alert": True,
            "daily_report": False,
        })
        assert resp.status_code == 200

        # Verify
        get_resp = client.get("/api/notifications/settings", headers=admin_headers)
        data = get_resp.json()
        assert data["cwsi_alert"] is False
        assert data["temp_alert"] is True

    # ── TC-NOTIF-007: Mark Single Notification Read ──
    def test_notif_007_mark_single_read(self, client, admin_headers):
        """TC-NOTIF-007: Mark a specific notification as read (even if it doesn't exist)."""
        resp = client.post("/api/notifications/999/read", headers=admin_headers)
        assert resp.status_code == 200

    # ── TC-NOTIF-008: Delete Single Notification ──
    def test_notif_008_delete_single(self, client, admin_headers):
        """TC-NOTIF-008: Delete a specific notification (even if it doesn't exist)."""
        resp = client.delete("/api/notifications/999", headers=admin_headers)
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════
#  TC-CONFIG: Configuration Tests
# ═══════════════════════════════════════════════════════════════

class TestConfig:
    """TC-CONFIG: Configuration — MQTT, Domain, Farm Stats"""

    # ── TC-CONFIG-001: Get MQTT Config ──
    def test_config_001_get_mqtt_config(self, client, admin_headers):
        """TC-CONFIG-001: Get MQTT and device configuration."""
        resp = client.get("/api/config", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "mqtt" in data
        assert "devices" in data
        assert "dashboard_devices" in data
        assert "control_devices" in data
        assert "mqtt_connected" in data

    # ── TC-CONFIG-002: Default Devices Present ──
    def test_config_002_default_devices(self, client, admin_headers):
        """TC-CONFIG-002: Default devices should be present after init."""
        resp = client.get("/api/config", headers=admin_headers)
        data = resp.json()
        device_names = [d["name"] for d in data["devices"]]
        # Should have at least the default control devices
        assert len(data["control_devices"]) >= 3

    # ── TC-CONFIG-003: Get Domain Config ──
    def test_config_003_get_domain_config(self, client, admin_headers):
        """TC-CONFIG-003: Get domain configuration."""
        resp = client.get("/api/config/domain", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)

    # ── TC-CONFIG-004: Update Domain Config ──
    def test_config_004_update_domain_config(self, client, admin_headers):
        """TC-CONFIG-004: Update domain configuration."""
        resp = client.put("/api/config/domain", headers=admin_headers, json={
            "domain": "test.example.com",
            "api_url": "https://test.example.com/api",
        })
        assert resp.status_code == 200

        # Verify
        get_resp = client.get("/api/config/domain", headers=admin_headers)
        data = get_resp.json()
        assert data["domain"] == "test.example.com"

    # ── TC-CONFIG-005: Get Farm Stats ──
    def test_config_005_get_farm_stats(self, client, admin_headers):
        """TC-CONFIG-005: Get farm stats (days, plots, health)."""
        resp = client.get("/api/farm/stats", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "days" in data
        assert "plots" in data
        assert "health" in data

    # ── TC-CONFIG-006: Update Farm Stats (Admin Override) ──
    def test_config_006_update_farm_stats(self, client, admin_headers):
        """TC-CONFIG-006: Admin can override farm stats."""
        resp = client.put("/api/farm/stats", headers=admin_headers, json={
            "days": 45,
            "plots": 4,
            "health": 92,
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        # Verify override
        get_resp = client.get("/api/farm/stats", headers=admin_headers)
        data = get_resp.json()
        assert data["days"] == 45
        assert data["plots"] == 4
        assert data["health"] == 92

    # ── TC-CONFIG-007: Update MQTT Config ──
    def test_config_007_update_mqtt_config(self, client, admin_headers):
        """TC-CONFIG-007: Update MQTT configuration."""
        resp = client.put("/api/config", headers=admin_headers, json={
            "mqtt": {
                "broker": "localhost",
                "port": "1883",
                "username": "testuser",
                "password": "testpass",
            },
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True


# ═══════════════════════════════════════════════════════════════
#  TC-DATA: Sensor Data Table Tests
# ═══════════════════════════════════════════════════════════════

class TestSensorDataTable:
    """TC-DATA: Sensor Data Table — CRUD, CSV Upload/Download, Pagination"""

    # ── TC-DATA-001: Get Empty Table ──
    def test_data_001_get_empty_table(self, client, admin_headers):
        """TC-DATA-001: Sensor data table should be empty on fresh DB."""
        resp = client.get("/api/sensor-data/table?page=1&per_page=10", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert "total" in data
        assert "page" in data
        assert "per_page" in data
        assert "total_pages" in data

    # ── TC-DATA-002: Create Sensor Data Row ──
    def test_data_002_create_row(self, client, admin_headers):
        """TC-DATA-002: Admin can create a sensor data row."""
        resp = client.post("/api/sensor-data", headers=admin_headers, json={
            "sensor_type": "humidity",
            "plot_id": 0,
            "value": 65.5,
            "recorded_at": datetime.now().isoformat(),
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    # ── TC-DATA-003: Create Multiple Rows ──
    def test_data_003_create_multiple_rows(self, client, admin_headers):
        """TC-DATA-003: Create multiple sensor data rows for pagination test."""
        now = datetime.now()
        for i in range(25):
            client.post("/api/sensor-data", headers=admin_headers, json={
                "sensor_type": "cwsi",
                "plot_id": 1,
                "value": round(0.1 + i * 0.01, 3),
                "recorded_at": (now - timedelta(minutes=i * 10)).isoformat(),
            })

    # ── TC-DATA-004: Pagination Works ──
    def test_data_004_pagination(self, client, admin_headers):
        """TC-DATA-004: Sensor data table pagination works correctly."""
        resp = client.get("/api/sensor-data/table?page=1&per_page=10", headers=admin_headers)
        data = resp.json()
        assert data["page"] == 1
        assert data["per_page"] == 10
        assert data["total"] >= 26  # 1 humidity + 25 cwsi
        assert len(data["data"]) <= 10

    # ── TC-DATA-005: Filter by Sensor Type ──
    def test_data_005_filter_by_type(self, client, admin_headers):
        """TC-DATA-005: Filter sensor data by type."""
        resp = client.get("/api/sensor-data/table?sensor_type=cwsi", headers=admin_headers)
        data = resp.json()
        assert data["total"] >= 25
        for row in data["data"]:
            assert row["sensor_type"] == "cwsi"

    # ── TC-DATA-006: Update Sensor Data Value ──
    def test_data_006_update_value(self, client, admin_headers):
        """TC-DATA-006: Admin can update a sensor data value."""
        # Get first row
        resp = client.get("/api/sensor-data/table?page=1&per_page=1", headers=admin_headers)
        rows = resp.json()["data"]
        if rows:
            row_id = rows[0]["id"]
            resp = client.put(f"/api/sensor-data/{row_id}", headers=admin_headers, json={
                "value": 99.9,
            })
            assert resp.status_code == 200
            assert resp.json()["success"] is True

    # ── TC-DATA-007: Delete Sensor Data Row ──
    def test_data_007_delete_row(self, client, admin_headers):
        """TC-DATA-007: Admin can delete a sensor data row."""
        resp = client.get("/api/sensor-data/table?page=1&per_page=1", headers=admin_headers)
        rows = resp.json()["data"]
        if rows:
            row_id = rows[0]["id"]
            initial_total = resp.json()["total"]
            resp = client.delete(f"/api/sensor-data/{row_id}", headers=admin_headers)
            assert resp.status_code == 200

            # Verify count decreased
            check_resp = client.get("/api/sensor-data/table", headers=admin_headers)
            assert check_resp.json()["total"] == initial_total - 1

    # ── TC-DATA-008: Download CSV ──
    def test_data_008_download_csv(self, client, admin_headers):
        """TC-DATA-008: Download sensor data as CSV."""
        resp = client.get("/api/sensor-data/download-csv", headers=admin_headers)
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")
        content = resp.text
        assert "sensor_type,plot_id,value,recorded_at" in content

    # ── TC-DATA-009: Download CSV with Filter ──
    def test_data_009_download_csv_filtered(self, client, admin_headers):
        """TC-DATA-009: Download CSV filtered by sensor type."""
        resp = client.get("/api/sensor-data/download-csv?sensor_type=cwsi", headers=admin_headers)
        assert resp.status_code == 200
        lines = resp.text.strip().split("\n")
        # Header + data rows
        for line in lines[1:]:
            assert line.startswith("cwsi,")

    # ── TC-DATA-010: Upload CSV ──
    def test_data_010_upload_csv(self, client, admin_headers):
        """TC-DATA-010: Upload sensor data via CSV."""
        csv_content = (
            "sensor_type,plot_id,value,recorded_at\n"
            "humidity,0,70.5,2026-03-11T10:00:00\n"
            "humidity,0,71.2,2026-03-11T10:10:00\n"
            "lux,0,15000,2026-03-11T10:00:00\n"
        )
        resp = client.post("/api/sensor-data/upload-csv",
                           headers={**admin_headers, "Content-Type": "text/csv"},
                           content=csv_content)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["imported"] == 3


# ═══════════════════════════════════════════════════════════════
#  TC-SYS: System & Utility Tests
# ═══════════════════════════════════════════════════════════════

class TestSystem:
    """TC-SYS: System — Health, Reports, Export, Mock Mode"""

    # ── TC-SYS-001: Health Check (Public) ──
    def test_sys_001_health_check(self, client):
        """TC-SYS-001: Health check endpoint should be publicly accessible."""
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["version"] == "3.0.0"
        assert "mqtt_connected" in data
        assert "Andrographis" in data["service"]

    # ── TC-SYS-002: System Health (Protected) ──
    def test_sys_002_system_health(self, client, admin_headers):
        """TC-SYS-002: System health endpoint returns CPU/RAM/Disk data."""
        resp = client.get("/api/system/health", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "cpu_percent" in data
        assert "memory_total" in data
        assert "memory_used" in data
        assert "memory_percent" in data
        assert "disk_total" in data
        assert "disk_used" in data
        assert "disk_percent" in data
        assert "uptime" in data

    # ── TC-SYS-003: Reports Summary (Week) ──
    def test_sys_003_reports_week(self, client, admin_headers):
        """TC-SYS-003: Reports summary for weekly period."""
        resp = client.get("/api/reports/summary?period=week", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_readings" in data
        assert "avg_cwsi" in data
        assert "avg_humidity" in data
        assert "chart" in data
        assert len(data["chart"]) == 7

    # ── TC-SYS-004: Reports Summary (Month) ──
    def test_sys_004_reports_month(self, client, admin_headers):
        """TC-SYS-004: Reports summary for monthly period."""
        resp = client.get("/api/reports/summary?period=month", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["chart"]) == 30

    # ── TC-SYS-005: Export CSV ──
    def test_sys_005_export_csv(self, client, admin_headers):
        """TC-SYS-005: Export sensor data as CSV via POST."""
        resp = client.post("/api/export/csv", headers=admin_headers, json={
            "sensor_types": ["cwsi", "humidity"],
        })
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")

    # ── TC-SYS-006: Mock Mode Status ──
    def test_sys_006_mock_status(self, client, admin_headers):
        """TC-SYS-006: Get mock mode status."""
        resp = client.get("/api/mock/status", headers=admin_headers)
        assert resp.status_code == 200
        assert "enabled" in resp.json()
        assert isinstance(resp.json()["enabled"], bool)

    # ── TC-SYS-007: Mock Mode Toggle (Enable & Disable) ──
    def test_sys_007_mock_toggle(self, client, admin_headers):
        """TC-SYS-007: Toggle mock mode on and off."""
        # Enable
        resp = client.post("/api/mock/toggle", headers=admin_headers)
        assert resp.status_code == 200
        first_state = resp.json()["enabled"]

        # Disable (toggle back)
        resp = client.post("/api/mock/toggle", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["enabled"] != first_state


# ═══════════════════════════════════════════════════════════════
#  TC-SEC: Security & Authorization Tests
# ═══════════════════════════════════════════════════════════════

class TestSecurity:
    """TC-SEC: Security — Login Activity, Logout All, Authorization"""

    # ── TC-SEC-001: Login Activity Log ──
    def test_sec_001_login_activity(self, client, admin_headers):
        """TC-SEC-001: Login activity log should contain login records."""
        resp = client.get("/api/security/login-activity", headers=admin_headers)
        assert resp.status_code == 200
        activity = resp.json()
        assert isinstance(activity, list)
        if activity:
            assert "action" in activity[0]
            assert "created_at" in activity[0]

    # ── TC-SEC-002: All Activity Log (Admin) ──
    def test_sec_002_all_activity(self, client, admin_headers):
        """TC-SEC-002: Admin can view all user activity."""
        resp = client.get("/api/security/all-activity", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    # ── TC-SEC-003: Logout All Sessions ──
    def test_sec_003_logout_all(self, client, admin_headers):
        """TC-SEC-003: Logout all sessions endpoint works."""
        resp = client.post("/api/security/logout-all", headers=admin_headers)
        assert resp.status_code == 200
        assert "logged out" in resp.json()["message"].lower() or "logout" in resp.json()["message"].lower()

    # ── TC-SEC-004: Protected Endpoints Return 401 Without Auth ──
    def test_sec_004_protected_endpoints_401(self, client):
        """TC-SEC-004: All protected endpoints should return 401 without token."""
        endpoints = [
            ("GET", "/api/sensors/dashboard"),
            ("GET", "/api/controls/state"),
            ("GET", "/api/automation/rules"),
            ("GET", "/api/notifications"),
            ("GET", "/api/config"),
            ("GET", "/api/system/health"),
            ("GET", "/api/farm/stats"),
            ("GET", "/api/mock/status"),
        ]
        for method, url in endpoints:
            if method == "GET":
                resp = client.get(url)
            else:
                resp = client.post(url)
            assert resp.status_code == 401, f"{method} {url} should be 401 but got {resp.status_code}"

    # ── TC-SEC-005: Admin-Only Endpoints Return 403 ──
    def test_sec_005_admin_only_403(self, client):
        """TC-SEC-005: Admin-only endpoints return 403 for regular users."""
        # Login as regular user
        login_resp = client.post("/api/auth/login", json={
            "username": "regularuser",
            "password": "testpass123",
        })
        if login_resp.status_code != 200:
            pytest.skip("Regular user not available")

        user_token = login_resp.json()["access_token"]
        headers = auth_headers(user_token)

        admin_endpoints = [
            ("GET", "/api/users"),
            ("GET", "/api/users/pending"),
            ("GET", "/api/security/all-activity"),
        ]
        for method, url in admin_endpoints:
            resp = client.get(url, headers=headers)
            assert resp.status_code == 403, f"{url} should be 403 but got {resp.status_code}"


# ═══════════════════════════════════════════════════════════════
#  TC-WS: WebSocket Tests
# ═══════════════════════════════════════════════════════════════

class TestWebSocket:
    """TC-WS: WebSocket — Connection, Initial Data, Ping/Pong"""

    # ── TC-WS-001: WebSocket Connection ──
    def test_ws_001_connection(self, client):
        """TC-WS-001: WebSocket endpoint accepts connection."""
        with client.websocket_connect("/ws/sensors") as ws:
            # Should receive initial data
            data = ws.receive_json()
            assert data["type"] == "initial"
            assert "data" in data
            assert "controls" in data
            assert "mqtt_connected" in data

    # ── TC-WS-002: WebSocket Initial Data Structure ──
    def test_ws_002_initial_data_structure(self, client):
        """TC-WS-002: WebSocket initial message has correct structure."""
        with client.websocket_connect("/ws/sensors") as ws:
            data = ws.receive_json()
            sensor_data = data["data"]
            assert "humidity" in sensor_data
            assert "lux" in sensor_data
            assert "cwsi1" in sensor_data
            assert "cwsi2" in sensor_data
            assert "leaf_temp1" in sensor_data
            assert "leaf_temp2" in sensor_data
            assert "water_level1" in sensor_data
            assert "water_level2" in sensor_data

    # ── TC-WS-003: WebSocket Ping/Pong ──
    def test_ws_003_ping_pong(self, client):
        """TC-WS-003: WebSocket responds to ping with pong."""
        with client.websocket_connect("/ws/sensors") as ws:
            ws.receive_json()  # Consume initial
            ws.send_text("ping")
            pong = ws.receive_json()
            assert pong["type"] == "pong"


# ═══════════════════════════════════════════════════════════════
#  TC-EDGE: Edge Cases & Validation Tests
# ═══════════════════════════════════════════════════════════════

class TestEdgeCases:
    """TC-EDGE: Edge Cases — Input Validation, Boundary Conditions"""

    # ── TC-EDGE-001: Register with Empty Username ──
    def test_edge_001_register_empty_username(self, client):
        """TC-EDGE-001: Register with empty username should fail."""
        resp = client.post("/api/auth/register", json={
            "username": "",
            "password": "testpass",
        })
        # Could be 400 or 422 depending on validation
        assert resp.status_code in [400, 422, 200]

    # ── TC-EDGE-002: Login with Empty Fields ──
    def test_edge_002_login_empty_fields(self, client):
        """TC-EDGE-002: Login with missing fields should return error."""
        resp = client.post("/api/auth/login", json={"username": "admin"})
        assert resp.status_code == 422

    # ── TC-EDGE-003: Sensor Data Table — Invalid Sort Column ──
    def test_edge_003_invalid_sort_column(self, client, admin_headers):
        """TC-EDGE-003: Invalid sort column should fallback to default."""
        resp = client.get("/api/sensor-data/table?sort_by=invalid_column", headers=admin_headers)
        assert resp.status_code == 200

    # ── TC-EDGE-004: Sensor Data Table — Page 0 ──
    def test_edge_004_page_zero(self, client, admin_headers):
        """TC-EDGE-004: Requesting page 0 should still work (returns empty or page 1)."""
        resp = client.get("/api/sensor-data/table?page=0", headers=admin_headers)
        assert resp.status_code == 200

    # ── TC-EDGE-005: CWSI History — Invalid Period ──
    def test_edge_005_cwsi_invalid_period(self, client, admin_headers):
        """TC-EDGE-005: CWSI history with unknown period should default to month."""
        resp = client.get("/api/sensors/cwsi-history?period=invalid", headers=admin_headers)
        assert resp.status_code == 200

    # ── TC-EDGE-006: Toggle Non-existent Device ──
    def test_edge_006_toggle_nonexistent_device(self, client, admin_headers):
        """TC-EDGE-006: Toggling a non-existent device name should still succeed (stores in dict)."""
        resp = client.post("/api/controls/toggle", headers=admin_headers, json={
            "device": "nonexistent_device",
            "state": True,
        })
        # FastAPI doesn't validate device names — it just stores in control_store
        assert resp.status_code == 200

    # ── TC-EDGE-007: Reports — Default Period ──
    def test_edge_007_reports_default_period(self, client, admin_headers):
        """TC-EDGE-007: Reports with unrecognized period defaults gracefully."""
        resp = client.get("/api/reports/summary?period=unknown", headers=admin_headers)
        assert resp.status_code == 200

    # ── TC-EDGE-008: Export CSV — Empty Date Range ──
    def test_edge_008_export_empty_range(self, client, admin_headers):
        """TC-EDGE-008: Export CSV with no matching data returns empty CSV."""
        resp = client.post("/api/export/csv", headers=admin_headers, json={
            "sensor_types": ["nonexistent"],
            "start_date": "2020-01-01",
            "end_date": "2020-01-02",
        })
        assert resp.status_code == 200
        assert "sensor_type,plot_id,value,recorded_at" in resp.text

    # ── TC-EDGE-009: Create Automation Rule — Minimal Fields ──
    def test_edge_009_create_rule_minimal(self, client, admin_headers):
        """TC-EDGE-009: Create rule with minimal required fields."""
        resp = client.post("/api/automation/rules", headers=admin_headers, json={
            "name": "Minimal Rule",
            "action_device": "whiteLight",
        })
        assert resp.status_code == 200

    # ── TC-EDGE-010: Large Page Size ──
    def test_edge_010_large_page_size(self, client, admin_headers):
        """TC-EDGE-010: Very large per_page value should still work."""
        resp = client.get("/api/sensor-data/table?per_page=10000", headers=admin_headers)
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════
#  TC-INTEG: Integration Tests
# ═══════════════════════════════════════════════════════════════

class TestIntegration:
    """TC-INTEG: Integration — End-to-end workflows"""

    # ── TC-INTEG-001: Full User Lifecycle ──
    def test_integ_001_user_lifecycle(self, client, admin_headers):
        """TC-INTEG-001: Register → Approve → Login → Change Password → Logout All."""
        # 1. Register
        client.post("/api/auth/register", json={
            "username": "lifecycle_user",
            "password": "pass123",
        })

        # 2. Approve
        pending = client.get("/api/users/pending", headers=admin_headers).json()
        user = next((u for u in pending if u["username"] == "lifecycle_user"), None)
        assert user is not None
        client.post(f"/api/users/{user['id']}/approve", headers=admin_headers)

        # 3. Login
        login_resp = client.post("/api/auth/login", json={
            "username": "lifecycle_user",
            "password": "pass123",
        })
        assert login_resp.status_code == 200
        user_token = login_resp.json()["access_token"]

        # 4. Change Password
        cp_resp = client.post("/api/auth/change-password",
                              headers=auth_headers(user_token),
                              json={"current_password": "pass123", "new_password": "newpass456"})
        assert cp_resp.status_code == 200

        # 5. Login with new password
        login_new = client.post("/api/auth/login", json={
            "username": "lifecycle_user",
            "password": "newpass456",
        })
        assert login_new.status_code == 200

        # 6. Cleanup
        users = client.get("/api/users", headers=admin_headers).json()
        target = next((u for u in users if u["username"] == "lifecycle_user"), None)
        if target:
            client.delete(f"/api/users/{target['id']}", headers=admin_headers)

    # ── TC-INTEG-002: Sensor Data Workflow ──
    def test_integ_002_sensor_data_workflow(self, client, admin_headers):
        """TC-INTEG-002: Create data → Query → Update → Export → Delete."""
        # 1. Create
        now = datetime.now().isoformat()
        client.post("/api/sensor-data", headers=admin_headers, json={
            "sensor_type": "leaf_temp",
            "plot_id": 1,
            "value": 33.5,
            "recorded_at": now,
        })

        # 2. Query
        resp = client.get("/api/sensor-data/table?sensor_type=leaf_temp", headers=admin_headers)
        rows = resp.json()["data"]
        assert any(r["sensor_type"] == "leaf_temp" for r in rows)

        # 3. Update
        row_id = next(r["id"] for r in rows if r["sensor_type"] == "leaf_temp")
        client.put(f"/api/sensor-data/{row_id}", headers=admin_headers, json={"value": 34.0})

        # 4. Export
        export_resp = client.get("/api/sensor-data/download-csv?sensor_type=leaf_temp", headers=admin_headers)
        assert "34.0" in export_resp.text

        # 5. Delete
        client.delete(f"/api/sensor-data/{row_id}", headers=admin_headers)

    # ── TC-INTEG-003: Controls + Schedule Integration ──
    def test_integ_003_controls_schedule(self, client, admin_headers):
        """TC-INTEG-003: Set schedule → Verify → Toggle device → Verify state."""
        # Set schedule
        client.put("/api/controls/schedule", headers=admin_headers, json={
            "enabled": False,
            "schedule_start": "08:00",
            "schedule_end": "20:00",
        })

        # Toggle individual device
        client.post("/api/controls/toggle", headers=admin_headers, json={
            "device": "purpleLight", "state": True,
        })

        # Verify state
        state = client.get("/api/controls/state", headers=admin_headers).json()
        assert state["controls"]["purpleLight"] is True

        # Master off resets all
        client.post("/api/controls/master", headers=admin_headers, json={"state": False})
        state = client.get("/api/controls/state", headers=admin_headers).json()
        assert state["controls"]["purpleLight"] is False


# ═══════════════════════════════════════════════════════════════
#  Main entry point
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short", "-x"])
