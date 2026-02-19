import sqlite3
import os
from config import DATABASE_URL
from auth import get_password_hash

def get_db():
    """Get database connection."""
    db = sqlite3.connect(DATABASE_URL, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize database tables."""
    db = sqlite3.connect(DATABASE_URL, check_same_thread=False)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")

    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            user_type TEXT DEFAULT 'user',
            role TEXT DEFAULT 'viewer',
            permissions TEXT DEFAULT '{}',
            approved INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            topic TEXT NOT NULL,
            device_type TEXT DEFAULT 'switch',
            category TEXT DEFAULT 'control',
            state INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sensor_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sensor_type TEXT NOT NULL,
            plot_id INTEGER DEFAULT 1,
            value REAL NOT NULL,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS automation_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            rule_type TEXT DEFAULT 'schedule',
            sensor_type TEXT,
            condition TEXT,
            threshold REAL,
            action_device TEXT NOT NULL,
            action_state INTEGER DEFAULT 1,
            schedule_start TEXT,
            schedule_end TEXT,
            enabled INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            action TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            status TEXT DEFAULT 'success',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS token_blacklist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_jti TEXT,
            user_id INTEGER,
            revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            severity TEXT DEFAULT 'info',
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Indexes for fast sensor queries
        CREATE INDEX IF NOT EXISTS idx_sensor_type_time
            ON sensor_data (sensor_type, recorded_at);
        CREATE INDEX IF NOT EXISTS idx_sensor_plot_time
            ON sensor_data (sensor_type, plot_id, recorded_at);
        CREATE INDEX IF NOT EXISTS idx_audit_username
            ON audit_logs (username, created_at);
        CREATE INDEX IF NOT EXISTS idx_notifications_read_time
            ON notifications (is_read, created_at);
    """)

    # Insert default devices if empty
    cursor = db.execute("SELECT COUNT(*) FROM devices")
    if cursor.fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO devices (name, topic, device_type, category) VALUES (?, ?, ?, ?)",
            [
                # Control devices (shown on Control page)
                ("ไฟแสงสีขาว", "farm/light/white", "switch", "control"),
                ("ไฟแสงสีม่วง", "farm/light/purple", "switch", "control"),
                ("พัดลมระบายอากาศ", "farm/fan/ventilation", "switch", "control"),
                # Sensor topics (shown on Dashboard)
                ("Humidity", "farm/sensor/humidity", "sensor", "dashboard"),
                ("Light (Lux)", "farm/sensor/lux", "sensor", "dashboard"),
                ("CWSI Plot 1", "farm/sensor/cwsi/1", "sensor", "dashboard"),
                ("CWSI Plot 2", "farm/sensor/cwsi/2", "sensor", "dashboard"),
                ("Leaf Temp Plot 1", "farm/sensor/leaf_temp/1", "sensor", "dashboard"),
                ("Leaf Temp Plot 2", "farm/sensor/leaf_temp/2", "sensor", "dashboard"),
                ("Water Level Plot 1", "farm/sensor/water_level/1", "sensor", "dashboard"),
                ("Water Level Plot 2", "farm/sensor/water_level/2", "sensor", "dashboard"),
            ]
        )

    # Create default admin user if no users exist
    cursor = db.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        admin_hash = get_password_hash("admin")
        db.execute(
            "INSERT INTO users (username, password_hash, user_type, role, permissions) VALUES (?, ?, ?, ?, ?)",
            ("admin", admin_hash, "admin", "admin", '{"all": true}')
        )
        print("👤 Default admin user created (username: admin, password: admin)")

    db.commit()

    # Migrations: add columns that may not exist in older databases
    try:
        db.execute("ALTER TABLE users ADD COLUMN approved INTEGER DEFAULT 1")
        db.commit()
        print("🔄 Migration: added 'approved' column to users table")
    except Exception:
        pass  # Column already exists

    try:
        db.execute("ALTER TABLE devices ADD COLUMN category TEXT DEFAULT 'control'")
        db.commit()
        print("🔄 Migration: added 'category' column to devices table")
    except Exception:
        pass  # Column already exists

    # Migration: ensure dashboard sensor devices exist
    try:
        cursor = db.execute("SELECT COUNT(*) FROM devices WHERE category = 'dashboard'")
        if cursor.fetchone()[0] == 0:
            default_sensors = [
                ("Humidity", "farm/sensor/humidity", "sensor", "dashboard"),
                ("Light (Lux)", "farm/sensor/lux", "sensor", "dashboard"),
                ("CWSI Plot 1", "farm/sensor/cwsi/1", "sensor", "dashboard"),
                ("CWSI Plot 2", "farm/sensor/cwsi/2", "sensor", "dashboard"),
                ("Leaf Temp Plot 1", "farm/sensor/leaf_temp/1", "sensor", "dashboard"),
                ("Leaf Temp Plot 2", "farm/sensor/leaf_temp/2", "sensor", "dashboard"),
                ("Water Level Plot 1", "farm/sensor/water_level/1", "sensor", "dashboard"),
                ("Water Level Plot 2", "farm/sensor/water_level/2", "sensor", "dashboard"),
            ]
            db.executemany(
                "INSERT INTO devices (name, topic, device_type, category) VALUES (?, ?, ?, ?)",
                default_sensors,
            )
            db.commit()
            print("🔄 Migration: inserted default dashboard sensor devices")
    except Exception as e:
        print(f"⚠️ Migration (dashboard sensors): {e}")

    db.close()
    print("✅ Database initialized successfully")
