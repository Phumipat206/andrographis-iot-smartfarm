#!/usr/bin/env bash
# ============================================================
#  Andrographis Smart Farm — Deploy Script v3.1.0
#  Target : Raspberry Pi OS / Ubuntu / Debian (64-bit)
#  Role   : Server + Cloud (ESP32 handles GPIO via MQTT)
# ============================================================
set -euo pipefail

APP_NAME="smartfarm"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
WRAPPER_SCRIPT="/usr/local/bin/smartfarm-start.sh"
NGINX_CONF="/etc/nginx/sites-available/${APP_NAME}"
NGINX_LINK="/etc/nginx/sites-enabled/${APP_NAME}"
API_PORT=8001
HTTP_PORT=80

# Detect real user (works with sudo)
REAL_USER="${SUDO_USER:-$(whoami)}"
REAL_GROUP="$(id -gn "$REAL_USER")"

# Colours
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── 0. Pre-flight checks ────────────────────────────────────
[[ $EUID -eq 0 ]] || err "Run with sudo:  sudo bash deploy.sh"
command -v python3 >/dev/null || err "python3 not found"

info "=== Andrographis Smart Farm — Deployment ==="
info "App directory : $APP_DIR"
info "Running as    : $REAL_USER"
info "Backend port  : $API_PORT"

# ── 1. System packages ──────────────────────────────────────
info "Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq \
  python3-venv python3-pip python3-dev \
  nginx curl mosquitto mosquitto-clients \
  build-essential libffi-dev libssl-dev 2>/dev/null || true

# Ensure Node.js >= 20 (Vite 7 requires it)
NODE_VER=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [[ -z "$NODE_VER" || "$NODE_VER" -lt 20 ]]; then
  warn "Node.js >= 20 required. Installing via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
info "Node.js $(node -v) ✓"

# ── 2. Python virtual environment ───────────────────────────
info "Setting up Python virtual env..."
python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
pip install --upgrade pip -q
pip install -r "$BACKEND_DIR/requirements.txt" -q
info "Python packages installed ✓"

# ── 3. Initialize database ──────────────────────────────────
info "Initializing database..."
cd "$BACKEND_DIR"
python3 -c "from database import init_db; init_db()"
info "Database ready ✓"

# ── 4. Build frontend ───────────────────────────────────────
info "Building frontend (npm install + build)..."
cd "$FRONTEND_DIR"
# Run npm as the real user (not root)
sudo -u "$REAL_USER" npm install --silent 2>/dev/null || npm install --silent
sudo -u "$REAL_USER" npm run build || npm run build
DIST_DIR="$FRONTEND_DIR/dist"
[[ -d "$DIST_DIR" ]] || err "Frontend build failed — dist/ not found"
info "Frontend built ✓  →  $DIST_DIR"

# ── 5. Fix permissions for Nginx ─────────────────────────────
info "Setting file permissions..."
# Make every directory in the path executable for www-data
CURRENT="$APP_DIR"
while [[ "$CURRENT" != "/" ]]; do
  chmod o+x "$CURRENT" 2>/dev/null || true
  CURRENT="$(dirname "$CURRENT")"
done
chmod -R o+rX "$DIST_DIR"
chown -R "$REAL_USER:$REAL_GROUP" "$APP_DIR"
info "Permissions set ✓"

# ── 6. Create wrapper script (handles spaces in path) ────────
info "Creating wrapper script..."
cat > "$WRAPPER_SCRIPT" <<WRAPPER
#!/usr/bin/env bash
cd "$BACKEND_DIR"
exec "$VENV_DIR/bin/uvicorn" main:app --host 0.0.0.0 --port $API_PORT --workers 1
WRAPPER
chmod +x "$WRAPPER_SCRIPT"
info "Wrapper script ✓  →  $WRAPPER_SCRIPT"

# ── 7. Systemd service ──────────────────────────────────────
info "Creating systemd service..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Andrographis Smart Farm API Server
After=network.target mosquitto.service
Wants=mosquitto.service

[Service]
Type=simple
User=$REAL_USER
Group=$REAL_GROUP
WorkingDirectory=$BACKEND_DIR
Environment="PATH=$VENV_DIR/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=$WRAPPER_SCRIPT
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$APP_NAME"
systemctl restart "$APP_NAME"
info "Systemd service enabled and started ✓"

# ── 8. Nginx reverse proxy ──────────────────────────────────
info "Configuring Nginx..."
cat > "$NGINX_CONF" <<EOF
server {
    listen $HTTP_PORT default_server;
    listen [::]:$HTTP_PORT default_server;
    server_name _;

    # Frontend static files (path quoted for spaces)
    root "$DIST_DIR";
    index index.html;

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass         http://127.0.0.1:$API_PORT;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }

    # WebSocket proxy
    location /ws {
        proxy_pass         http://127.0.0.1:$API_PORT;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       \$host;
        proxy_read_timeout 86400s;
    }

    # Security headers
    add_header X-Frame-Options        "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff"    always;
    add_header X-XSS-Protection       "1; mode=block" always;
}
EOF

# Enable site, remove default
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
ln -sf "$NGINX_CONF" "$NGINX_LINK"
nginx -t && systemctl restart nginx
systemctl enable nginx
info "Nginx configured and running ✓"

# ── 9. Mosquitto (MQTT broker) ──────────────────────────────
info "Ensuring Mosquitto is running..."
systemctl enable mosquitto
systemctl restart mosquitto
info "Mosquitto MQTT broker ✓"

# ── 10. Firewall (optional — ufw) ───────────────────────────
if command -v ufw >/dev/null 2>&1; then
  info "Configuring UFW firewall..."
  ufw allow ssh
  ufw allow "$HTTP_PORT/tcp"
  ufw allow 1883/tcp   # MQTT
  ufw --force enable
  info "Firewall rules applied ✓"
fi

# ── 11. Verify auto-start on reboot ─────────────────────────
info "Verifying auto-start configuration..."
systemctl is-enabled "$APP_NAME" >/dev/null 2>&1 && info "✓ $APP_NAME auto-start on boot: enabled" || warn "$APP_NAME auto-start NOT enabled"
systemctl is-enabled nginx >/dev/null 2>&1 && info "✓ nginx auto-start on boot: enabled" || warn "nginx auto-start NOT enabled"
systemctl is-enabled mosquitto >/dev/null 2>&1 && info "✓ mosquitto auto-start on boot: enabled" || warn "mosquitto auto-start NOT enabled"

# ── 12. System Readiness Check (Raspberry Pi) ───────────────
info "Running system readiness checks..."
echo ""
echo -e "  ${GREEN}System Readiness Report${NC}"
echo -e "  ─────────────────────────────────"

# Check Python
PYVER=$(python3 --version 2>&1)
echo -e "  Python      : ${GREEN}${PYVER}${NC}"

# Check Node
NODEVER=$(node --version 2>&1)
echo -e "  Node.js     : ${GREEN}${NODEVER}${NC}"

# Check services
for svc in "$APP_NAME" nginx mosquitto; do
  if systemctl is-active --quiet "$svc"; then
    echo -e "  ${svc} : ${GREEN}Running ✓${NC}"
  else
    echo -e "  ${svc} : ${RED}Not Running ✗${NC}"
  fi
done

# Check SQLite DB
if [[ -f "$BACKEND_DIR/smartfarm.db" ]]; then
  DB_SIZE=$(du -h "$BACKEND_DIR/smartfarm.db" | cut -f1)
  echo -e "  Database    : ${GREEN}OK (${DB_SIZE})${NC}"
else
  echo -e "  Database    : ${RED}Not Found${NC}"
fi

# Check dist folder
if [[ -d "$DIST_DIR" ]]; then
  DIST_FILES=$(find "$DIST_DIR" -type f | wc -l)
  echo -e "  Frontend    : ${GREEN}Built (${DIST_FILES} files)${NC}"
else
  echo -e "  Frontend    : ${RED}Not Built${NC}"
fi

# Check Raspberry Pi specific
if [[ -f /proc/device-tree/model ]]; then
  PI_MODEL=$(cat /proc/device-tree/model 2>/dev/null)
  echo -e "  Hardware    : ${GREEN}${PI_MODEL}${NC}"
  # Check CPU temp
  if [[ -f /sys/class/thermal/thermal_zone0/temp ]]; then
    TEMP=$(cat /sys/class/thermal/thermal_zone0/temp)
    TEMP_C=$((TEMP / 1000))
    echo -e "  CPU Temp    : ${GREEN}${TEMP_C}°C${NC}"
  fi
else
  echo -e "  Hardware    : $(uname -m) ($(uname -s))"
fi

# Check disk space
DISK_AVAIL=$(df -h / | tail -1 | awk '{print $4}')
echo -e "  Disk Free   : ${GREEN}${DISK_AVAIL}${NC}"

# Check RAM
MEM_AVAIL=$(free -h | awk '/^Mem:/{print $7}')
echo -e "  RAM Free    : ${GREEN}${MEM_AVAIL}${NC}"

echo -e "  ─────────────────────────────────"
echo ""

# ── 13. Summary ─────────────────────────────────────────────
PI_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo -e "  Web UI   : http://${PI_IP}"
echo -e "  API      : http://${PI_IP}:${API_PORT}/docs"
echo -e "  MQTT     : ${PI_IP}:1883"
echo ""
echo -e "  Service  : sudo systemctl status ${APP_NAME}"
echo -e "  Logs     : sudo journalctl -u ${APP_NAME} -f"
echo -e "  Restart  : sudo systemctl restart ${APP_NAME}"
echo ""
echo -e "${YELLOW}  First user registered will become admin.${NC}"
echo ""
