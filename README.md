# 🌿 Andrographis Smart Farm

> ระบบจัดการฟาร์มอัจฉริยะสำหรับปลูกฟ้าทะลายโจรแบบ Hydroponic  
> Smart farm management system for Hydroponic Andrographis cultivation  
> **Built by COE AI WU — Walailak University**

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Development Setup](#development-setup)
- [Production Deployment](#production-deployment)
- [API Reference](#api-reference)
- [MQTT Topics](#mqtt-topics)
- [Database Schema](#database-schema)
- [Frontend Pages](#frontend-pages)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Overview

Andrographis Smart Farm is a full-stack IoT smart farming system designed for monitoring and controlling Hydroponic greenhouses growing Andrographis paniculata (ฟ้าทะลายโจร). The system uses Raspberry Pi as the central server and ESP32 microcontrollers for sensor data collection and actuator control via MQTT.

### Key Capabilities
- **Real-time sensor monitoring** — CWSI, humidity, light, leaf temperature, water level
- **Device control** — White/purple lights, fans, sprinklers with master switch
- **Automation** — Schedule-based and threshold-based rules
- **CWSI prediction** — 3-day crop water stress forecasting
- **Notifications** — Real-time alerts via WebSocket with customizable thresholds
- **Data analytics** — Charts, reports, CSV export/import, Excel-like data table
- **Mock-up mode** — Generate realistic test data without hardware
- **User management** — Registration with admin approval, role-based access
- **Bilingual** — Thai (🇹🇭) and English (🇺🇸) support
- **Dark/Light mode** — Full theme support
- **Mobile responsive** — Optimized for phones, tablets, and desktops

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Andrographis Smart Farm                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │  ESP32    │◄───►│  Mosquitto   │◄───►│   FastAPI    │   │
│  │ Sensors & │     │  MQTT Broker │     │   Backend    │   │
│  │ Actuators │     │  (port 1883) │     │  (port 8001) │   │
│  └──────────┘     └──────────────┘     └──────┬───────┘   │
│                                               │             │
│  ┌──────────┐     ┌──────────────┐     ┌──────┴───────┐   │
│  │  SQLite   │◄───│   Database   │     │    Nginx     │   │
│  │   .db     │    │   Layer      │     │  (port 80)   │   │
│  └──────────┘     └──────────────┘     └──────┬───────┘   │
│                                               │             │
│                                        ┌──────┴───────┐   │
│                                        │  React SPA   │   │
│                                        │  Frontend    │   │
│                                        └──────────────┘   │
│                                                             │
│                    Raspberry Pi / Server                     │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow
1. **ESP32 sensors** publish readings to Mosquitto MQTT broker on Raspberry Pi
2. **FastAPI backend** subscribes to MQTT topics, stores data in SQLite
3. **WebSocket** pushes real-time updates to connected frontend clients
4. **Frontend** displays data and sends control commands back through REST API
5. **Backend** publishes MQTT control commands → Mosquitto → ESP32 receives and operates actuators
6. **ESP32** publishes ON/OFF status back via MQTT → Backend updates state

### Control Flow (Raspberry Pi → ESP32)
```
User clicks "Turn On Light" in Web UI
  → Frontend POST /api/controls/toggle {device: "white_light", state: true}
  → Backend publishes MQTT: farm/light/white → "ON"
  → ESP32 subscribes to farm/light/white, receives "ON"
  → ESP32 activates GPIO relay → Light turns on
  → ESP32 publishes status: farm/status/light/white → "ON"
  → Backend receives status, confirms state
  → WebSocket pushes update to Frontend
```

> **Note:** The Raspberry Pi does NOT connect to GPIO directly. All hardware control goes through MQTT to ESP32 microcontrollers.

---

## Features

### 🌡️ Dashboard (Hydroponic Monitor)
- CWSI stress status with color-coded indicators (Normal / Moderate / Critical)
- 3-day stress prediction with trend arrows
- Real-time humidity and light intensity
- Per-greenhouse leaf temperature and water level
- Environment overview with university location map

### 🎛️ Device Control
- White light / Purple light / Ventilation toggle switches
- Master switch (all devices on/off)
- Current humidity display
- Auto schedule with configurable time range (persisted to DB)

### 📊 CWSI Data Analytics
- Live API data or CSV file import
- Interactive Recharts-based time series
- Plot 1 vs Plot 2 comparison
- Period filtering (today / week / month)

### ⚙️ Settings
- Profile management with avatar
- Notification preferences (CWSI, water, temp, daily report)
- Privacy and security overview
- Language selection (Thai/English)
- MQTT broker configuration (live reconnect without restart)
- Domain/API URL configuration
- System health monitor (CPU, RAM, disk, temperature)
- Data & statistics with summary reports
- **Sensor Data Table** — Excel-like view with inline edit, delete, pagination, CSV download/upload
- **Mock-up Mode** — Toggle realistic random sensor data generation for testing
- **Editable farm stats** — Override Days/Plots/Health display values
- FAQ, Contact, About sections

### 🔐 Security
- Password change with validation rules
- Login activity log with timestamps
- Session management (logout all devices / revoke tokens)
- **User management** — Admin can view, change roles, delete users
- **Registration approval** — New users require admin approval before login
- Comprehensive activity audit log (admin)

### 🔔 Notifications
- Real-time WebSocket push notifications
- Bell icon with unread count (desktop header + mobile)
- Mark read / Mark all read / Delete / Clear all
- Configurable alert thresholds with 30-minute cooldown
- Alert types: CWSI high, water level low, leaf temperature high

### 🤖 Automation Engine
- Schedule-based rules (e.g., lights on 06:00–18:00)
- Threshold-based rules (e.g., turn on fan when temp > 35°C)
- Background thread evaluates rules every 30 seconds
- Supports individual device or "all devices" target
- Enable/disable toggle per rule

---

## Tech Stack

### Backend
| Component | Technology |
|-----------|-----------|
| Framework | FastAPI 0.104.1 |
| Server | Uvicorn (ASGI) |
| Database | SQLite 3 (WAL mode) |
| MQTT | paho-mqtt 1.6.1 |
| Auth | JWT (python-jose), bcrypt (passlib) |
| System | psutil (CPU/RAM/disk monitoring) |

### Frontend
| Component | Technology |
|-----------|-----------|
| Framework | React 19.2 |
| Build | Vite 7.3.1 |
| Styling | Tailwind CSS 4.1.18 |
| Charts | Recharts 3.7 |
| Routing | React Router 7.6 |
| Icons | Lucide React |

### Infrastructure
| Component | Technology |
|-----------|-----------|
| Reverse Proxy | Nginx |
| MQTT Broker | Mosquitto |
| Process Manager | systemd |
| Firewall | UFW |
| Target | Raspberry Pi OS / Ubuntu / Debian (64-bit) |

---

## Prerequisites

- **Raspberry Pi 4/5** (or any Linux server — Ubuntu/Debian)
- **Python 3.10+**
- **Node.js 20+** (required for Vite 7)
- **Git**
- Network access (for initial package installation)

---

## Quick Start

### One-Command Production Deployment

```bash
git clone <repo-url> "Andrographis Smartfarm"
cd "Andrographis Smartfarm"
sudo bash deploy.sh
```

The deploy script will automatically:
1. Install system dependencies (Python, Node.js 20, Nginx, Mosquitto)
2. Create Python virtual environment and install packages
3. Initialize the SQLite database with default admin account
4. Build the React frontend for production
5. Configure systemd service (auto-start on boot)
6. Set up Nginx reverse proxy (port 80 → backend + static files)
7. Configure Mosquitto MQTT broker (port 1883)
8. Set up UFW firewall rules (80, 1883, 22)
9. Verify all services are running and enabled
10. Run comprehensive system readiness checks

After deployment:
- **Web UI**: `http://<PI_IP>`
- **API Docs**: `http://<PI_IP>:8001/docs`
- **MQTT Broker**: `<PI_IP>:1883`
- **Default Admin**: username `admin` / password `admin` ⚠️ **Change immediately!**

---

## Development Setup

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

The API docs are available at `http://localhost:8001/docs` (Swagger UI).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs at `http://localhost:5173` and proxies `/api` and `/ws` to `http://localhost:8001` (configured in `vite.config.js`).

### Testing Without Hardware

Enable **Mock-up Mode** in Settings → Mock-up Mode, or use the standalone simulator:

```bash
cd backend
python mqtt_simulator.py --broker localhost --port 1883 --interval 10
```

---

## Production Deployment

### Service Management

```bash
# Check status
sudo systemctl status smartfarm

# View logs (tail)
sudo journalctl -u smartfarm -f

# Restart backend
sudo systemctl restart smartfarm

# Restart Nginx
sudo systemctl restart nginx

# Restart MQTT broker
sudo systemctl restart mosquitto

# Full redeploy
sudo bash deploy.sh
```

### Auto-Start on Boot
All services (`smartfarm`, `nginx`, `mosquitto`) are enabled via `systemctl enable` and will auto-start on reboot. The deploy script verifies this automatically.

### System Health Check
The deploy script includes a comprehensive system readiness check that verifies:
- Python & Node.js versions
- Service status (smartfarm, nginx, mosquitto)
- Database existence
- Frontend build
- Raspberry Pi hardware detection
- CPU temperature, disk space, RAM usage

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user (requires admin approval) |
| POST | `/api/auth/login` | Login (returns JWT token) |
| POST | `/api/auth/change-password` | Change password |

### Sensors
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sensors/dashboard` | Current sensor snapshot |
| GET | `/api/sensors/cwsi-history?period=today` | CWSI history (today/week/month) |
| GET | `/api/sensors/history?sensor_type=humidity` | Generic sensor history |

### Controls
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/controls/state` | Current control states |
| POST | `/api/controls/toggle` | Toggle device `{device, state}` |
| POST | `/api/controls/master` | Master switch `{state}` |
| GET | `/api/controls/schedule` | Get auto schedule |
| PUT | `/api/controls/schedule` | Save auto schedule |

### Automation
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/automation/rules` | List all rules |
| POST | `/api/automation/rules` | Create rule |
| PUT | `/api/automation/rules/{id}` | Update rule |
| DELETE | `/api/automation/rules/{id}` | Delete rule |
| POST | `/api/automation/rules/{id}/toggle` | Toggle rule enabled/disabled |

### Sensor Data (Excel-like Table)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sensor-data/table?page=1&sensor_type=` | Paginated data table |
| PUT | `/api/sensor-data/{id}` | Update value (admin) |
| DELETE | `/api/sensor-data/{id}` | Delete row (admin) |
| POST | `/api/sensor-data` | Create row (admin) |
| POST | `/api/sensor-data/upload-csv` | Upload CSV data (admin) |
| GET | `/api/sensor-data/download-csv` | Download all data as CSV |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | List notifications |
| GET | `/api/notifications/unread-count` | Unread count |
| POST | `/api/notifications/{id}/read` | Mark as read |
| POST | `/api/notifications/read-all` | Mark all read |
| DELETE | `/api/notifications/{id}` | Delete one |
| DELETE | `/api/notifications/clear` | Clear all |
| GET | `/api/notifications/settings` | Get notification settings |
| PUT | `/api/notifications/settings` | Update notification settings |

### User Management (Admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all users |
| PUT | `/api/users/{id}` | Update role/type |
| DELETE | `/api/users/{id}` | Delete user |
| GET | `/api/users/pending` | List pending approvals |
| POST | `/api/users/{id}/approve` | Approve user registration |
| POST | `/api/users/{id}/reject` | Reject user registration |

### Configuration
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | MQTT config + devices |
| PUT | `/api/config` | Save MQTT config + reconnect |
| GET | `/api/config/domain` | Domain config |
| PUT | `/api/config/domain` | Save domain config |

### Farm Stats
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/farm/stats` | Get stats (days, plots, health %) |
| PUT | `/api/farm/stats` | Override stats (admin) |

### Mock Mode
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/mock/status` | Mock mode status |
| POST | `/api/mock/toggle` | Toggle mock data generation (admin) |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | API health check |
| GET | `/api/system/health` | CPU / RAM / Disk / Temperature |
| GET | `/api/reports/summary?period=week` | Report summary |
| POST | `/api/export/csv` | Export sensor data |

### WebSocket
| Endpoint | Description |
|----------|-------------|
| `/ws/sensors` | Real-time sensor updates + notification push |

---

## MQTT Topics

### Sensor Topics (Subscribed by Backend)
| Topic | Payload Format | Description |
|-------|---------------|-------------|
| `farm/sensor/humidity` | `float` | Relative humidity (%) |
| `farm/sensor/lux` | `float` | Light intensity (lux) |
| `farm/sensor/cwsi/1` | `{"value": float, "index": float}` or `float` | CWSI Plot 1 |
| `farm/sensor/cwsi/2` | `{"value": float, "index": float}` or `float` | CWSI Plot 2 |
| `farm/sensor/leaf_temp/1` | `float` | Leaf temperature Plot 1 (°C) |
| `farm/sensor/leaf_temp/2` | `float` | Leaf temperature Plot 2 (°C) |
| `farm/sensor/water_level/1` | `float` | Water level Plot 1 (%) |
| `farm/sensor/water_level/2` | `float` | Water level Plot 2 (%) |

### Control Topics (Published by Backend)
| Topic | Payload | Description |
|-------|---------|-------------|
| `farm/light/white` | `ON` / `OFF` | White light control |
| `farm/light/purple` | `ON` / `OFF` | Purple light control |
| `farm/fan/ventilation` | `ON` / `OFF` | Ventilation fan control |

---

## Database Schema

### Tables
| Table | Description |
|-------|-------------|
| `users` | User accounts with roles, permissions, and approval status |
| `devices` | MQTT device registry (name, topic, category: dashboard/control) |
| `sensor_data` | Time-series sensor readings (type, value, plot, timestamp) |
| `config` | Key-value configuration store (MQTT, domain, notifications, controls, stats) |
| `automation_rules` | Schedule and threshold automation rules |
| `audit_logs` | Login and security audit trail |
| `token_blacklist` | Revoked JWT tokens |
| `notifications` | In-app notification messages |

### Default Data
On first initialization:
- **Admin user**: `admin` / `admin` (auto-created, pre-approved)
- **Default devices**: White Light, Purple Light, Ventilation Fan
- **MQTT default**: `localhost:1883`

---

## Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Welcome | Landing page with login/register links |
| `/login` | Login | JWT authentication |
| `/register` | Register | User registration (pending admin approval) |
| `/dashboard` | Dashboard | Real-time sensor monitoring & CWSI status |
| `/control` | Control | Device management, master switch, scheduling |
| `/cwsi` | CWSI Data | Data analytics, charts, CSV import |
| `/setup` | Settings | All configuration, mock mode, sensor table |
| `/security` | Security | Password, users, sessions, approvals |

---

## Configuration

### MQTT Broker
Configure via **Settings → MQTT Configuration** in the web UI (supports live reconnect), or directly in the database:
```sql
INSERT OR REPLACE INTO config (key, value) VALUES ('mqtt_broker', 'your-broker-ip');
INSERT OR REPLACE INTO config (key, value) VALUES ('mqtt_port', '1883');
INSERT OR REPLACE INTO config (key, value) VALUES ('mqtt_username', 'user');
INSERT OR REPLACE INTO config (key, value) VALUES ('mqtt_password', 'pass');
```

### MQTT Topics — Dashboard vs Control
The MQTT Configuration screen is split into two sections. Each section supports **add** and **delete** operations:

#### 📊 Dashboard — Sensor Topics
Topics for sensors that display readings on the Dashboard page. Data flows: **ESP32 → MQTT topic → Backend → Dashboard**

| Default Name | Default Topic | Description |
|-------------|--------------|-------------|
| Humidity | `farm/sensor/humidity` | Relative humidity (%) |
| Light (Lux) | `farm/sensor/lux` | Light intensity |
| CWSI Plot 1 | `farm/sensor/cwsi/1` | Crop water stress index |
| CWSI Plot 2 | `farm/sensor/cwsi/2` | Crop water stress index |
| Leaf Temp Plot 1 | `farm/sensor/leaf_temp/1` | Leaf surface temperature (°C) |
| Leaf Temp Plot 2 | `farm/sensor/leaf_temp/2` | Leaf surface temperature (°C) |
| Water Level Plot 1 | `farm/sensor/water_level/1` | Water level (%) |
| Water Level Plot 2 | `farm/sensor/water_level/2` | Water level (%) |

#### 🎛️ Control — Device Topics
Topics for actuators controlled from the Control page. Data flows: **Frontend → Backend → MQTT topic → ESP32 activates GPIO**

| Default Name | Default Topic | Description |
|-------------|--------------|-------------|
| ไฟแสงสีขาว | `farm/light/white` | White light relay |
| ไฟแสงสีม่วง | `farm/light/purple` | Purple light relay |
| พัดลมระบายอากาศ | `farm/fan/ventilation` | Ventilation fan relay |

You can add custom topics for both sections to support additional sensors or actuators.

### Domain / API URL
Configure via **Settings → Domain Configuration** in the web UI. Changes take effect on next frontend API call.

### Notification Thresholds
Default alert thresholds (configurable via Settings → Notifications):
- **CWSI > 0.4** → Warning alert
- **Water Level < 20%** → Warning alert
- **Leaf Temperature > 40°C** → Danger alert
- 30-minute cooldown between repeated alerts of the same type

### Mock-up Mode
Enable via **Settings → Mock-up Mode** in the web UI. Generates realistic random-walk sensor data every 10 seconds, stored in the database and broadcast via WebSocket. The system also triggers alert notifications when mock data exceeds configured thresholds (CWSI, water level, leaf temperature). When mock mode is disabled, all mock sensor data is automatically deleted to prevent mixing with real data. Useful for demos and testing without ESP32 hardware.

---

## Project Structure

```
Andrographis Smartfarm/
├── deploy.sh                    # One-command production deployment
├── README.md                    # This file
├── backend/
│   ├── main.py                  # FastAPI app — all API endpoints, WebSocket, automation
│   ├── database.py              # SQLite schema initialization & migrations
│   ├── auth.py                  # JWT token creation & password hashing
│   ├── config.py                # MQTT config & topic mapping constants
│   ├── mqtt_service.py          # MQTT client, sensor store, alert engine
│   ├── mqtt_simulator.py        # Standalone MQTT data simulator
│   └── requirements.txt         # Python dependencies
└── frontend/
    ├── package.json             # Node dependencies
    ├── vite.config.js           # Vite build config with proxy
    ├── index.html               # Entry HTML
    └── src/
        ├── App.jsx              # React Router setup
        ├── main.jsx             # React entry point
        ├── index.css            # Tailwind imports + custom styles
        ├── context/
        │   ├── AuthContext.jsx   # JWT auth state management
        │   ├── LanguageContext.jsx # Thai/English i18n
        │   └── ThemeContext.jsx  # Dark/Light mode
        ├── i18n/
        │   ├── en.js            # English translations
        │   └── th.js            # Thai translations
        ├── layouts/
        │   └── MainLayout.jsx   # Sidebar, nav, notifications, branding
        └── pages/
            ├── WelcomePage.jsx    # Landing page
            ├── LoginPage.jsx      # Login form
            ├── RegisterPage.jsx   # Registration form
            ├── DashboardPage.jsx  # Sensor dashboard
            ├── ControlPage.jsx    # Device controls
            ├── CWSIDataPage.jsx   # CWSI data analytics
            ├── SetupPage.jsx      # Settings & configuration
            └── SecurityPage.jsx   # Security & user management
```

---

## Troubleshooting

### Backend won't start
```bash
sudo journalctl -u smartfarm -n 50 --no-pager
# Common causes: port conflict, missing dependencies, DB lock
```

### Nginx 502 Bad Gateway
```bash
# Check if backend is running
curl http://localhost:8001/api/health

# Restart backend
sudo systemctl restart smartfarm
```

### MQTT not connecting
```bash
# Check Mosquitto status
sudo systemctl status mosquitto

# Test MQTT subscription
mosquitto_sub -h localhost -t "farm/#" -v

# Test MQTT publish
mosquitto_pub -h localhost -t "farm/sensor/humidity" -m "65.5"
```

### Database reset
```bash
cd backend
rm smartfarm.db
source venv/bin/activate
python3 -c "from database import init_db; init_db()"
sudo systemctl restart smartfarm
```

### Frontend build fails
```bash
cd frontend
rm -rf node_modules
npm install
npm run build
```

### Port conflicts
```bash
sudo lsof -i :8001  # Backend port
sudo lsof -i :80    # Nginx port
sudo lsof -i :1883  # MQTT port
```

### Check Raspberry Pi temperature
```bash
vcgencmd measure_temp
# Or via API: curl http://localhost:8001/api/system/health
```

---

## License

This project is developed for academic purposes by the **College of Engineering (COE), AI Lab, Walailak University**.

---

<div align="center">
  <strong>Andrographis Smart Farm v3.0.0</strong><br>
  Built with  by COE AI WU — Walailak University
</div>

อิอิ
