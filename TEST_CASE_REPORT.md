# 📋 Andrographis Smart Farm — Test Case Report
## Comprehensive API Test Suite v3.0.0

---

| **รายการ (Item)** | **รายละเอียด (Detail)** |
|---|---|
| **โครงการ (Project)** | Andrographis Smart Farm IoT System |
| **เวอร์ชัน (Version)** | 3.0.0 |
| **วันที่ทดสอบ (Test Date)** | 2026-03-11 |
| **ผู้ทดสอบ (Tester)** | Automated (pytest + httpx) |
| **สภาพแวดล้อม (Environment)** | Python 3.12.3 / FastAPI 0.104.1 / SQLite3 / Linux 6.17.0 |
| **เครื่องมือ (Tools)** | pytest 9.0.2, httpx 0.27.0, pytest-html 4.2.0 |
| **จำนวน Test Cases ทั้งหมด** | **99** |
| **ผ่าน (Passed)** | **99 ✅** |
| **ไม่ผ่าน (Failed)** | **0 ❌** |
| **อัตราการผ่าน (Pass Rate)** | **100%** |
| **เวลาทั้งหมด (Duration)** | **8.01 วินาที** |

---

## 📊 สรุปผลรายหมวด (Summary by Category)

| หมวด (Category) | จำนวน (Count) | ผ่าน (Pass) | ไม่ผ่าน (Fail) | อัตราผ่าน |
|---|:---:|:---:|:---:|:---:|
| TC-AUTH: Authentication | 12 | 12 ✅ | 0 | 100% |
| TC-SENSOR: Sensor Data | 8 | 8 ✅ | 0 | 100% |
| TC-CTRL: Device Controls | 10 | 10 ✅ | 0 | 100% |
| TC-AUTO: Automation Rules | 8 | 8 ✅ | 0 | 100% |
| TC-USER: User Management | 8 | 8 ✅ | 0 | 100% |
| TC-NOTIF: Notifications | 8 | 8 ✅ | 0 | 100% |
| TC-CONFIG: Configuration | 7 | 7 ✅ | 0 | 100% |
| TC-DATA: Sensor Data Table | 10 | 10 ✅ | 0 | 100% |
| TC-SYS: System & Utility | 7 | 7 ✅ | 0 | 100% |
| TC-SEC: Security | 5 | 5 ✅ | 0 | 100% |
| TC-WS: WebSocket | 3 | 3 ✅ | 0 | 100% |
| TC-EDGE: Edge Cases | 10 | 10 ✅ | 0 | 100% |
| TC-INTEG: Integration | 3 | 3 ✅ | 0 | 100% |
| **รวมทั้งหมด (Total)** | **99** | **99** | **0** | **100%** |

---

## 📝 รายละเอียด Test Cases (Detailed Test Cases)

---

### 🔐 TC-AUTH: การยืนยันตัวตน (Authentication)

| Test ID | ชื่อ Test Case | คำอธิบาย | เงื่อนไขเบื้องต้น | ขั้นตอน | ผลที่คาดหวัง | ผลจริง | สถานะ |
|---|---|---|---|---|---|---|:---:|
| TC-AUTH-001 | Admin Login Success | ล็อกอินด้วย admin/admin ค่าเริ่มต้น | ฐานข้อมูลเริ่มต้นมีผู้ใช้ admin | POST `/api/auth/login` body: `{"username":"admin","password":"admin"}` | Status 200, ได้ access_token, user_type=admin | Status 200, access_token ถูกต้อง, user_type=admin | ✅ |
| TC-AUTH-002 | Login Wrong Password | ล็อกอินด้วยรหัสผ่านผิด | มีผู้ใช้ admin ในระบบ | POST `/api/auth/login` body: `{"username":"admin","password":"wrongpassword"}` | Status 401, detail: Invalid username or password | Status 401, ข้อความ error ถูกต้อง | ✅ |
| TC-AUTH-003 | Login Non-existent User | ล็อกอินด้วยผู้ใช้ที่ไม่มี | – | POST `/api/auth/login` body: `{"username":"nonexistent","password":"any"}` | Status 401 | Status 401 | ✅ |
| TC-AUTH-004 | Register New User | ลงทะเบียนผู้ใช้ใหม่ | – | POST `/api/auth/register` body: `{"username":"testuser1","password":"testpass123"}` | Status 200, ข้อความเกี่ยวกับ approval | Status 200, message มีคำว่า approval/submitted | ✅ |
| TC-AUTH-005 | Register Duplicate | ลงทะเบียนชื่อที่มีแล้ว | มีผู้ใช้ admin อยู่แล้ว | POST `/api/auth/register` body: `{"username":"admin","password":"any"}` | Status 400, detail: already exists | Status 400, detail มีคำว่า already exists | ✅ |
| TC-AUTH-006 | Login Unapproved User | ล็อกอินผู้ใช้ที่ยังไม่ได้รับอนุมัติ | testuser1 ลงทะเบียนแต่ยังไม่ approve | POST `/api/auth/login` body: `{"username":"testuser1","password":"testpass123"}` | Status 403, detail: pending/approval | Status 403, detail มีคำว่า pending | ✅ |
| TC-AUTH-007 | No Token | เข้าถึง endpoint ที่ต้อง auth โดยไม่ส่ง token | – | GET `/api/sensors/dashboard` (no headers) | Status 401 | Status 401 | ✅ |
| TC-AUTH-008 | Invalid Token | ส่ง JWT token ที่ไม่ถูกต้อง | – | GET `/api/sensors/dashboard` + `Authorization: Bearer invalid.jwt.token` | Status 401 | Status 401 | ✅ |
| TC-AUTH-009 | Malformed Authorization | ส่ง header Authorization แบบผิดรูปแบบ | – | GET `/api/sensors/dashboard` + `Authorization: NotBearer sometoken` | Status 401 | Status 401 | ✅ |
| TC-AUTH-010 | Change Password | เปลี่ยนรหัสผ่านด้วยรหัสเดิมที่ถูกต้อง | เข้าสู่ระบบเป็น admin | POST `/api/auth/change-password` body: `{"current_password":"admin","new_password":"newadmin123"}` | Status 200, message: changed | Status 200, เปลี่ยนสำเร็จ + เปลี่ยนกลับ | ✅ |
| TC-AUTH-011 | Change Password Wrong | เปลี่ยนรหัสผ่านด้วยรหัสเดิมที่ผิด | เข้าสู่ระบบเป็น admin | POST `/api/auth/change-password` body: `{"current_password":"wrong","new_password":"new"}` | Status 400 | Status 400 | ✅ |
| TC-AUTH-012 | Login Empty Body | ส่ง JSON body ว่าง | – | POST `/api/auth/login` body: `{}` | Status 422 (validation error) | Status 422 | ✅ |

---

### 📡 TC-SENSOR: ข้อมูลเซ็นเซอร์ (Sensor Data)

| Test ID | ชื่อ Test Case | คำอธิบาย | เงื่อนไขเบื้องต้น | ขั้นตอน | ผลที่คาดหวัง | ผลจริง | สถานะ |
|---|---|---|---|---|---|---|:---:|
| TC-SENSOR-001 | Dashboard Structure | ตรวจสอบโครงสร้าง response ของ dashboard | เข้าสู่ระบบเป็น admin | GET `/api/sensors/dashboard` | มี cwsi1, cwsi2, humidity, lux, location, plots, mqtt_connected | โครงสร้างครบถ้วน, plots=2, cwsi มี plot name | ✅ |
| TC-SENSOR-002 | Dashboard Location | ตรวจสอบข้อมูลตำแหน่ง | เข้าสู่ระบบ | GET `/api/sensors/dashboard` | location.name = มหาวิทยาลัยวลัยลักษณ์, lat/lng ถูกต้อง | ชื่อ, ค่าพิกัดถูกต้อง | ✅ |
| TC-SENSOR-003 | CWSI History (Empty) | ดูประวัติ CWSI วันนี้ (ไม่มีข้อมูล) | ฐานข้อมูลเปล่า | GET `/api/sensors/cwsi-history?period=today` | Status 200, history=[], summary.count=0 | ข้อมูลว่าง, count=0 | ✅ |
| TC-SENSOR-004 | CWSI History (Week) | ดูประวัติ CWSI รายสัปดาห์ | เข้าสู่ระบบ | GET `/api/sensors/cwsi-history?period=week` | Status 200 | Status 200 | ✅ |
| TC-SENSOR-005 | CWSI History (Month) | ดูประวัติ CWSI รายเดือน | เข้าสู่ระบบ | GET `/api/sensors/cwsi-history?period=month` | Status 200 | Status 200 | ✅ |
| TC-SENSOR-006 | Generic History | ดูประวัติเซ็นเซอร์ทั่วไป | เข้าสู่ระบบ | GET `/api/sensors/history?sensor_type=humidity&period=today` | Status 200, array | Status 200, ได้ array | ✅ |
| TC-SENSOR-007 | MQTT Status | ตรวจสอบสถานะ MQTT ใน dashboard | เข้าสู่ระบบ | GET `/api/sensors/dashboard` | มี mqtt_connected เป็น boolean | mqtt_connected = boolean | ✅ |
| TC-SENSOR-008 | Initial Null Values | ค่าเซ็นเซอร์เริ่มต้นเป็น null | ฐานข้อมูลเปล่า, ไม่มี MQTT data | GET `/api/sensors/dashboard` | humidity, lux เป็น null หรือ number | ค่าเป็น None/float/int | ✅ |

---

### 🎛️ TC-CTRL: ควบคุมอุปกรณ์ (Device Controls)

| Test ID | ชื่อ Test Case | คำอธิบาย | เงื่อนไขเบื้องต้น | ขั้นตอน | ผลที่คาดหวัง | ผลจริง | สถานะ |
|---|---|---|---|---|---|---|:---:|
| TC-CTRL-001 | Get Control State | ดูสถานะอุปกรณ์ทั้งหมด | เข้าสู่ระบบ | GET `/api/controls/state` | มี controls{whiteLight, purpleLight, ventilation, masterSwitch}, humidity | โครงสร้างครบถ้วน | ✅ |
| TC-CTRL-002 | Toggle White Light ON | เปิดไฟขาว | เข้าสู่ระบบ | POST `/api/controls/toggle` body: `{"device":"whiteLight","state":true}` | success=true, device=whiteLight, state=true | เปิดสำเร็จ | ✅ |
| TC-CTRL-003 | Toggle White Light OFF | ปิดไฟขาว | เข้าสู่ระบบ | POST `/api/controls/toggle` body: `{"device":"whiteLight","state":false}` | state=false | ปิดสำเร็จ | ✅ |
| TC-CTRL-004 | Toggle Purple Light | เปิดไฟม่วง | เข้าสู่ระบบ | POST `/api/controls/toggle` body: `{"device":"purpleLight","state":true}` | device=purpleLight | เปิดสำเร็จ | ✅ |
| TC-CTRL-005 | Toggle Ventilation | เปิดพัดลม | เข้าสู่ระบบ | POST `/api/controls/toggle` body: `{"device":"ventilation","state":true}` | device=ventilation | เปิดสำเร็จ | ✅ |
| TC-CTRL-006 | Master Switch ON | เปิดสวิตช์หลัก | เข้าสู่ระบบ | POST `/api/controls/master` body: `{"state":true}` | success=true | เปิดสำเร็จ | ✅ |
| TC-CTRL-007 | Master Switch OFF | ปิดสวิตช์หลัก (ปิดทุกอุปกรณ์) | เข้าสู่ระบบ, อุปกรณ์เปิดอยู่ | POST `/api/controls/master` body: `{"state":false}` → GET state | อุปกรณ์ทุกตัว=false | ทุกตัวปิด | ✅ |
| TC-CTRL-008 | Get Schedule (Default) | ดูกำหนดการเริ่มต้น | เข้าสู่ระบบ | GET `/api/controls/schedule` | มี enabled, schedule_start, schedule_end | ค่าเริ่มต้นถูกต้อง | ✅ |
| TC-CTRL-009 | Save Schedule | บันทึกกำหนดการ | เข้าสู่ระบบ | PUT `/api/controls/schedule` body: `{"enabled":true,"schedule_start":"07:00","schedule_end":"19:00"}` → GET verify | success=true, ค่าบันทึกถูกต้อง | บันทึกและยืนยันสำเร็จ | ✅ |
| TC-CTRL-010 | State Persistence | สถานะคงอยู่หลัง toggle | เข้าสู่ระบบ | Toggle ON → GET verify → Toggle OFF → GET verify | สถานะตรงกับที่ตั้ง | สถานะคงอยู่ถูกต้อง | ✅ |

---

### 🤖 TC-AUTO: กฎอัตโนมัติ (Automation Rules)

| Test ID | ชื่อ Test Case | คำอธิบาย | เงื่อนไขเบื้องต้น | ขั้นตอน | ผลที่คาดหวัง | ผลจริง | สถานะ |
|---|---|---|---|---|---|---|:---:|
| TC-AUTO-001 | List Rules (Empty) | ดูรายการกฎ (ว่าง) | ฐานข้อมูลเริ่มต้น | GET `/api/automation/rules` | Status 200, array | ได้ array ว่าง | ✅ |
| TC-AUTO-002 | Create Schedule Rule | สร้างกฎตามเวลา | เข้าสู่ระบบ | POST `/api/automation/rules` body: schedule rule | success=true | สร้างสำเร็จ | ✅ |
| TC-AUTO-003 | Create Threshold Rule | สร้างกฎตามค่าเซ็นเซอร์ | เข้าสู่ระบบ | POST `/api/automation/rules` body: threshold rule | success=true | สร้างสำเร็จ | ✅ |
| TC-AUTO-004 | List Rules (After) | ดูรายการกฎหลังสร้าง | มีกฎ 2 รายการ | GET `/api/automation/rules` | มีชื่อกฎที่สร้างทั้ง 2 | พบกฎครบ 2 รายการ | ✅ |
| TC-AUTO-005 | Update Rule | แก้ไขกฎ | มีกฎอยู่ | PUT `/api/automation/rules/{id}` body: update schedule | success=true | แก้ไขสำเร็จ | ✅ |
| TC-AUTO-006 | Toggle Rule | เปิด/ปิดกฎ | มีกฎอยู่ | POST `/api/automation/rules/{id}/toggle` | response มี enabled | toggle สำเร็จ | ✅ |
| TC-AUTO-007 | Delete Rule | ลบกฎ | มีกฎอยู่ | DELETE `/api/automation/rules/{id}` | success=true | ลบสำเร็จ | ✅ |
| TC-AUTO-008 | Toggle Non-existent | toggle กฎที่ไม่มี | – | POST `/api/automation/rules/99999/toggle` | Status 404 | Status 404 | ✅ |

---

### 👥 TC-USER: จัดการผู้ใช้ (User Management)

| Test ID | ชื่อ Test Case | คำอธิบาย | เงื่อนไขเบื้องต้น | ขั้นตอน | ผลที่คาดหวัง | ผลจริง | สถานะ |
|---|---|---|---|---|---|---|:---:|
| TC-USER-001 | List Users (Admin) | Admin ดูรายการผู้ใช้ | เข้าสู่ระบบเป็น admin | GET `/api/users` | Status 200, มีผู้ใช้ admin | ได้รายการผู้ใช้ | ✅ |
| TC-USER-002 | Pending Users | ดูผู้ใช้รออนุมัติ | เข้าสู่ระบบเป็น admin | GET `/api/users/pending` | Status 200, array | ได้ array | ✅ |
| TC-USER-003 | Approve User | อนุมัติผู้ใช้ | มีผู้ใช้ pending | Register → Approve → Login | ล็อกอินได้หลัง approve | ล็อกอินสำเร็จ | ✅ |
| TC-USER-004 | Reject User | ปฏิเสธผู้ใช้ | มีผู้ใช้ pending | Register → Reject | success=true | ปฏิเสธสำเร็จ | ✅ |
| TC-USER-005 | Update User Role | แก้ไข role ผู้ใช้ | มีผู้ใช้ approved | PUT `/api/users/{id}` body: `{"role":"editor"}` | success=true | แก้ไขสำเร็จ | ✅ |
| TC-USER-006 | Delete User | ลบผู้ใช้ | มีผู้ใช้อยู่ | DELETE `/api/users/{id}` | success=true | ลบสำเร็จ | ✅ |
| TC-USER-007 | Cannot Delete Self | Admin ลบตัวเองไม่ได้ | เข้าสู่ระบบเป็น admin | DELETE `/api/users/{admin_id}` | Status 400 | Status 400 | ✅ |
| TC-USER-008 | Non-Admin Forbidden | ผู้ใช้ทั่วไปเข้าถึง admin API ไม่ได้ | มีผู้ใช้ทั่วไป | Login as regular user → GET `/api/users` | Status 403 | Status 403 | ✅ |

---

### 🔔 TC-NOTIF: การแจ้งเตือน (Notifications)

| Test ID | ชื่อ Test Case | คำอธิบาย | เงื่อนไขเบื้องต้น | ขั้นตอน | ผลที่คาดหวัง | ผลจริง | สถานะ |
|---|---|---|---|---|---|---|:---:|
| TC-NOTIF-001 | Get Notifications | ดูรายการแจ้งเตือน (ว่าง) | ฐานข้อมูลเริ่มต้น | GET `/api/notifications` | Status 200, array | ได้ array ว่าง | ✅ |
| TC-NOTIF-002 | Unread Count | จำนวนแจ้งเตือนที่ยังไม่ได้อ่าน | เข้าสู่ระบบ | GET `/api/notifications/unread-count` | count เป็น integer | count = integer | ✅ |
| TC-NOTIF-003 | Mark All Read | อ่านทั้งหมด | เข้าสู่ระบบ | POST `/api/notifications/read-all` | success=true | สำเร็จ | ✅ |
| TC-NOTIF-004 | Clear All | ลบทั้งหมด | เข้าสู่ระบบ | DELETE `/api/notifications/clear` | success=true | สำเร็จ | ✅ |
| TC-NOTIF-005 | Get Settings | ดูการตั้งค่าแจ้งเตือน | เข้าสู่ระบบ | GET `/api/notifications/settings` | มี cwsi_alert, water_alert, temp_alert, daily_report | โครงสร้างครบ | ✅ |
| TC-NOTIF-006 | Update Settings | แก้ไขการตั้งค่า | เข้าสู่ระบบ | PUT `/api/notifications/settings` body: `{cwsi_alert:false,...}` → GET verify | ค่าตรงกับที่ตั้ง | ค่าถูกต้อง | ✅ |
| TC-NOTIF-007 | Mark Single Read | อ่านแจ้งเตือนเดียว | เข้าสู่ระบบ | POST `/api/notifications/999/read` | Status 200 | Status 200 | ✅ |
| TC-NOTIF-008 | Delete Single | ลบแจ้งเตือนเดียว | เข้าสู่ระบบ | DELETE `/api/notifications/999` | Status 200 | Status 200 | ✅ |

---

### ⚙️ TC-CONFIG: การตั้งค่า (Configuration)

| Test ID | ชื่อ Test Case | คำอธิบาย | เงื่อนไขเบื้องต้น | ขั้นตอน | ผลที่คาดหวัง | ผลจริง | สถานะ |
|---|---|---|---|---|---|---|:---:|
| TC-CONFIG-001 | Get MQTT Config | ดูการตั้งค่า MQTT | เข้าสู่ระบบ | GET `/api/config` | มี mqtt, devices, dashboard_devices, control_devices, mqtt_connected | โครงสร้างครบ | ✅ |
| TC-CONFIG-002 | Default Devices | อุปกรณ์เริ่มต้นมีครบ | ฐานข้อมูลเริ่มต้น | GET `/api/config` | control_devices ≥ 3 ตัว | มี 3+ อุปกรณ์ | ✅ |
| TC-CONFIG-003 | Get Domain Config | ดูการตั้งค่า Domain | เข้าสู่ระบบ | GET `/api/config/domain` | Status 200, dict | ได้ dict | ✅ |
| TC-CONFIG-004 | Update Domain | แก้ไขการตั้งค่า Domain | เข้าสู่ระบบ | PUT `/api/config/domain` → GET verify | domain ตรงกับที่ตั้ง | ค่าถูกต้อง | ✅ |
| TC-CONFIG-005 | Get Farm Stats | ดูสถิติฟาร์ม | เข้าสู่ระบบ | GET `/api/farm/stats` | มี days, plots, health | โครงสร้างครบ | ✅ |
| TC-CONFIG-006 | Update Farm Stats | แก้ไขสถิติฟาร์ม (admin override) | เข้าสู่ระบบเป็น admin | PUT `/api/farm/stats` body: `{days:45,plots:4,health:92}` → GET verify | ค่าตรงกับที่ตั้ง | ค่าถูกต้อง | ✅ |
| TC-CONFIG-007 | Update MQTT Config | แก้ไขการตั้งค่า MQTT | เข้าสู่ระบบเป็น admin | PUT `/api/config` body: mqtt settings | success=true | แก้ไขสำเร็จ | ✅ |

---

### 📊 TC-DATA: ตารางข้อมูลเซ็นเซอร์ (Sensor Data Table)

| Test ID | ชื่อ Test Case | คำอธิบาย | เงื่อนไขเบื้องต้น | ขั้นตอน | ผลที่คาดหวัง | ผลจริง | สถานะ |
|---|---|---|---|---|---|---|:---:|
| TC-DATA-001 | Get Empty Table | ตารางว่าง | ฐานข้อมูลเริ่มต้น | GET `/api/sensor-data/table?page=1&per_page=10` | มี data, total, page, per_page, total_pages | โครงสร้างครบ | ✅ |
| TC-DATA-002 | Create Row | เพิ่มข้อมูล 1 แถว | เข้าสู่ระบบ | POST `/api/sensor-data` body: humidity data | success=true | เพิ่มสำเร็จ | ✅ |
| TC-DATA-003 | Create Multiple | เพิ่มข้อมูล 25 แถว (สำหรับทดสอบ pagination) | เข้าสู่ระบบ | POST `/api/sensor-data` × 25 | ข้อมูลเพิ่มขึ้น 25 แถว | เพิ่มสำเร็จทั้ง 25 | ✅ |
| TC-DATA-004 | Pagination | ทดสอบ pagination | มีข้อมูล ≥ 26 แถว | GET `/api/sensor-data/table?page=1&per_page=10` | page=1, per_page=10, total≥26, data≤10 | pagination ถูกต้อง | ✅ |
| TC-DATA-005 | Filter by Type | กรองตาม sensor_type | มีข้อมูล cwsi 25 แถว | GET `/api/sensor-data/table?sensor_type=cwsi` | total≥25, ทุกแถว type=cwsi | กรองถูกต้อง | ✅ |
| TC-DATA-006 | Update Value | แก้ไขค่าเซ็นเซอร์ | มีข้อมูลอยู่ | PUT `/api/sensor-data/{id}` body: `{"value":99.9}` | success=true | แก้ไขสำเร็จ | ✅ |
| TC-DATA-007 | Delete Row | ลบข้อมูล 1 แถว | มีข้อมูลอยู่ | DELETE `/api/sensor-data/{id}` → verify count -1 | จำนวนลดลง 1 | จำนวนลดลง 1 | ✅ |
| TC-DATA-008 | Download CSV | ดาวน์โหลด CSV | มีข้อมูลอยู่ | GET `/api/sensor-data/download-csv` | Content-Type: text/csv, มี header row | CSV ถูกต้อง | ✅ |
| TC-DATA-009 | Download CSV Filter | ดาวน์โหลด CSV กรองตาม type | มีข้อมูลอยู่ | GET `/api/sensor-data/download-csv?sensor_type=cwsi` | ทุกแถว type=cwsi | กรองถูกต้อง | ✅ |
| TC-DATA-010 | Upload CSV | อัปโหลด CSV | เข้าสู่ระบบ | POST `/api/sensor-data/upload-csv` body: CSV 3 rows | success=true, imported=3 | นำเข้า 3 แถวสำเร็จ | ✅ |

---

### 🖥️ TC-SYS: ระบบ (System & Utility)

| Test ID | ชื่อ Test Case | คำอธิบาย | เงื่อนไขเบื้องต้น | ขั้นตอน | ผลที่คาดหวัง | ผลจริง | สถานะ |
|---|---|---|---|---|---|---|:---:|
| TC-SYS-001 | Health Check (Public) | ตรวจสอบสถานะระบบ (สาธารณะ) | – | GET `/api/health` | status=ok, version=3.0.0, service มี Andrographis | ค่าถูกต้องทั้งหมด | ✅ |
| TC-SYS-002 | System Health | ข้อมูล CPU/RAM/Disk | เข้าสู่ระบบ | GET `/api/system/health` | มี cpu_percent, memory_*, disk_*, uptime | โครงสร้างครบ | ✅ |
| TC-SYS-003 | Reports (Week) | สรุปรายสัปดาห์ | เข้าสู่ระบบ | GET `/api/reports/summary?period=week` | total_readings, avg_cwsi, chart มี 7 วัน | chart = 7 entries | ✅ |
| TC-SYS-004 | Reports (Month) | สรุปรายเดือน | เข้าสู่ระบบ | GET `/api/reports/summary?period=month` | chart มี 30 วัน | chart = 30 entries | ✅ |
| TC-SYS-005 | Export CSV | ส่งออกข้อมูล CSV | เข้าสู่ระบบ | POST `/api/export/csv` body: `{"sensor_types":["cwsi","humidity"]}` | Content-Type: text/csv | ได้ CSV | ✅ |
| TC-SYS-006 | Mock Status | สถานะ Mock Mode | เข้าสู่ระบบ | GET `/api/mock/status` | enabled เป็น boolean | enabled = boolean | ✅ |
| TC-SYS-007 | Mock Toggle | เปิด/ปิด Mock Mode | เข้าสู่ระบบ | POST `/api/mock/toggle` × 2 | สถานะสลับกัน | สลับถูกต้อง | ✅ |

---

### 🛡️ TC-SEC: ความปลอดภัย (Security)

| Test ID | ชื่อ Test Case | คำอธิบาย | เงื่อนไขเบื้องต้น | ขั้นตอน | ผลที่คาดหวัง | ผลจริง | สถานะ |
|---|---|---|---|---|---|---|:---:|
| TC-SEC-001 | Login Activity | ประวัติการเข้าสู่ระบบ | มีการ login อยู่ | GET `/api/security/login-activity` | array, มี action, created_at | ได้ข้อมูลถูกต้อง | ✅ |
| TC-SEC-002 | All Activity (Admin) | ดูกิจกรรมทั้งหมด (admin only) | เข้าสู่ระบบเป็น admin | GET `/api/security/all-activity` | array | ได้ array | ✅ |
| TC-SEC-003 | Logout All | ออกจากระบบทุก session | เข้าสู่ระบบ | POST `/api/security/logout-all` | message มีคำว่า logout/logged out | ข้อความถูกต้อง | ✅ |
| TC-SEC-004 | 401 Without Auth | Endpoint ที่ต้อง auth ส่ง 401 | ไม่ส่ง token | GET 8 protected endpoints | ทั้งหมด Status 401 | ทั้ง 8 endpoints = 401 | ✅ |
| TC-SEC-005 | 403 Non-Admin | Endpoint admin-only ส่ง 403 | เข้าสู่ระบบเป็นผู้ใช้ทั่วไป | GET 3 admin endpoints | ทั้งหมด Status 403 | ทั้ง 3 endpoints = 403 | ✅ |

---

### 🌐 TC-WS: WebSocket

| Test ID | ชื่อ Test Case | คำอธิบาย | เงื่อนไขเบื้องต้น | ขั้นตอน | ผลที่คาดหวัง | ผลจริง | สถานะ |
|---|---|---|---|---|---|---|:---:|
| TC-WS-001 | Connection | เชื่อมต่อ WebSocket | – | Connect to `/ws/sensors` | ได้ข้อมูล initial, type=initial | ได้ initial data | ✅ |
| TC-WS-002 | Initial Structure | โครงสร้างข้อมูลเริ่มต้น | เชื่อมต่อ WS | รับ JSON แรก | data มี humidity, lux, cwsi1, cwsi2, leaf_temp1, leaf_temp2, water_level1, water_level2 | โครงสร้างครบ | ✅ |
| TC-WS-003 | Ping/Pong | ทดสอบ heartbeat | เชื่อมต่อ WS | Send "ping" | ได้ `{type: "pong"}` กลับ | ได้ pong | ✅ |

---

### 🔧 TC-EDGE: กรณีพิเศษ (Edge Cases)

| Test ID | ชื่อ Test Case | คำอธิบาย | เงื่อนไขเบื้องต้น | ขั้นตอน | ผลที่คาดหวัง | ผลจริง | สถานะ |
|---|---|---|---|---|---|---|:---:|
| TC-EDGE-001 | Register Empty Username | ลงทะเบียนชื่อว่าง | – | POST register `{"username":"","password":"test"}` | 400 หรือ 422 | ตอบกลับถูกต้อง | ✅ |
| TC-EDGE-002 | Login Missing Fields | ล็อกอินขาด field | – | POST login `{"username":"admin"}` | Status 422 | Status 422 | ✅ |
| TC-EDGE-003 | Invalid Sort Column | sort_by ที่ไม่มีอยู่ | เข้าสู่ระบบ | GET table?sort_by=invalid_column | Status 200 (fallback to default) | Status 200 | ✅ |
| TC-EDGE-004 | Page Zero | ขอหน้าที่ 0 | เข้าสู่ระบบ | GET table?page=0 | Status 200 | Status 200 | ✅ |
| TC-EDGE-005 | Invalid CWSI Period | period ที่ไม่มี | เข้าสู่ระบบ | GET cwsi-history?period=invalid | Status 200 (default) | Status 200 | ✅ |
| TC-EDGE-006 | Toggle Unknown Device | toggle device ที่ไม่มี | เข้าสู่ระบบ | POST toggle `{"device":"nonexistent","state":true}` | Status 200 | Status 200 | ✅ |
| TC-EDGE-007 | Reports Unknown Period | period ที่ไม่รู้จัก | เข้าสู่ระบบ | GET summary?period=unknown | Status 200 (fallback) | Status 200 | ✅ |
| TC-EDGE-008 | Export Empty Range | ส่งออกช่วงที่ไม่มีข้อมูล | เข้าสู่ระบบ | POST export/csv ช่วง 2020-01-01 ถึง 2020-01-02 | ได้ CSV ว่าง (มี header) | CSV มี header | ✅ |
| TC-EDGE-009 | Create Rule Minimal | สร้างกฎด้วย field น้อยสุด | เข้าสู่ระบบ | POST rules `{"name":"Minimal","action_device":"whiteLight"}` | Status 200 | สร้างสำเร็จ | ✅ |
| TC-EDGE-010 | Large Page Size | per_page ขนาดใหญ่มาก | เข้าสู่ระบบ | GET table?per_page=10000 | Status 200 | Status 200 | ✅ |

---

### 🔄 TC-INTEG: ทดสอบบูรณาการ (Integration Tests)

| Test ID | ชื่อ Test Case | คำอธิบาย | เงื่อนไขเบื้องต้น | ขั้นตอน | ผลที่คาดหวัง | ผลจริง | สถานะ |
|---|---|---|---|---|---|---|:---:|
| TC-INTEG-001 | User Lifecycle | วงจรชีวิตผู้ใช้ครบวงจร | ฐานข้อมูลเริ่มต้น | Register → Approve → Login → Change Password → Login (new pass) → Delete | ทุกขั้นตอนสำเร็จ | ผ่านทุกขั้นตอน | ✅ |
| TC-INTEG-002 | Sensor Data Workflow | วงจร CRUD ข้อมูลเซ็นเซอร์ | เข้าสู่ระบบ | Create → Query → Update → Export → Delete | ทุกขั้นตอนสำเร็จ, ค่าถูกต้อง | ผ่านทุกขั้นตอน | ✅ |
| TC-INTEG-003 | Controls + Schedule | ควบคุม + กำหนดการ | เข้าสู่ระบบ | Save schedule → Toggle device → Verify → Master OFF → Verify all off | สถานะตรงกัน | ผ่านทุกขั้นตอน | ✅ |

---

## 🐛 บั๊กที่พบระหว่างการทดสอบ (Bugs Found During Testing)

| # | ระดับ | รายละเอียด | ตำแหน่ง | สถานะ |
|:---:|:---:|---|---|:---:|
| 1 | 🔴 Critical | Route ordering: `DELETE /api/notifications/{notif_id}` ถูกจับก่อน `DELETE /api/notifications/clear` ทำให้ "clear" ถูก parse เป็น int แล้วเกิด 422 | main.py L1282-1300 | ✅ แก้ไขแล้ว |

**วิธีแก้ไข:** สลับลำดับ route — ให้ `/api/notifications/clear` อยู่ก่อน `/api/notifications/{notif_id}`

---

## 📈 Frontend Test Scenarios (Manual)

ด้านล่างนี้เป็น test scenario สำหรับ frontend ที่ต้องทดสอบด้วยตนเองผ่าน browser:

| Scenario | หน้า | รายละเอียด | สถานะ |
|---|---|---|:---:|
| FE-001 | Login | ล็อกอินด้วย admin/admin → เข้า Dashboard | ☐ Manual |
| FE-002 | Login | ล็อกอินด้วยรหัสผิด → แสดง error | ☐ Manual |
| FE-003 | Dashboard | แสดงค่าเซ็นเซอร์ทั้งหมด (humidity, lux, CWSI, temps) | ☐ Manual |
| FE-004 | Dashboard | กราฟ Recharts แสดงข้อมูล real-time | ☐ Manual |
| FE-005 | Dashboard | WebSocket อัปเดตค่าทุก 5 วินาที (mock mode) | ☐ Manual |
| FE-006 | Control | Toggle ไฟขาว ON/OFF → สถานะเปลี่ยน | ☐ Manual |
| FE-007 | Control | Toggle ไฟม่วง ON/OFF → สถานะเปลี่ยน | ☐ Manual |
| FE-008 | Control | Toggle พัดลม ON/OFF → สถานะเปลี่ยน | ☐ Manual |
| FE-009 | Control | Master Switch OFF → ปิดทุกอุปกรณ์ | ☐ Manual |
| FE-010 | Control | บันทึก Schedule → แสดงค่าถูกต้อง | ☐ Manual |
| FE-011 | CWSI | แสดงกราฟ CWSI History | ☐ Manual |
| FE-012 | CWSI | เปลี่ยน period (today/week/month) | ☐ Manual |
| FE-013 | Security | เปลี่ยนรหัสผ่าน → ล็อกอินด้วยรหัสใหม่ | ☐ Manual |
| FE-014 | Security | ดูประวัติ Login Activity | ☐ Manual |
| FE-015 | Security | จัดการผู้ใช้ (approve/reject/delete) | ☐ Manual |
| FE-016 | Setup | แก้ไข MQTT config + บันทึก | ☐ Manual |
| FE-017 | Setup | อัปโหลด CSV → ข้อมูลเพิ่มในตาราง | ☐ Manual |
| FE-018 | Setup | ดาวน์โหลด CSV → ไฟล์ถูกต้อง | ☐ Manual |
| FE-019 | Notification | แสดงแจ้งเตือนไม่ได้อ่าน → กดอ่านทั้งหมด | ☐ Manual |
| FE-020 | Theme/Lang | สลับ Dark/Light theme | ☐ Manual |
| FE-021 | Theme/Lang | สลับภาษา TH/EN | ☐ Manual |
| FE-022 | Responsive | หน้าจอ mobile (<768px) แสดงถูกต้อง | ☐ Manual |
| FE-023 | Welcome | หน้า Welcome แสดงก่อน login | ☐ Manual |
| FE-024 | Logout | กดออกจากระบบ → กลับหน้า Login | ☐ Manual |

---

## 🏁 สรุป (Conclusion)

| รายการ | ค่า |
|---|---|
| **จำนวน Test Cases อัตโนมัติ** | 99 |
| **อัตราการผ่าน** | 100% (99/99) |
| **เวลาทดสอบ** | 8.01 วินาที |
| **บั๊กใหม่ที่พบ** | 1 (Route ordering — แก้ไขแล้ว) |
| **ครอบคลุม Endpoints** | ~50+ API endpoints ทั้งหมด |
| **ครอบคลุมหมวด** | 13 หมวด (Auth, Sensor, Control, Automation, User, Notification, Config, Data, System, Security, WebSocket, Edge Cases, Integration) |
| **Frontend Scenarios** | 24 manual test scenarios |
| **HTML Report** | `backend/test_report.html` |

**ระบบพร้อมสำหรับ Production Deployment ✅**

---

## 🔧 วิธีรัน Test Cases

```bash
# เข้า virtual environment
cd backend
source venv/bin/activate

# รันทั้งหมด (verbose)
python -m pytest test_api.py -v

# รันเฉพาะหมวด
python -m pytest test_api.py -v -k "TestAuth"
python -m pytest test_api.py -v -k "TestControls"
python -m pytest test_api.py -v -k "TestWebSocket"

# สร้าง HTML report
python -m pytest test_api.py -v --html=test_report.html --self-contained-html

# รันพร้อมดู coverage (ถ้าติดตั้ง pytest-cov)
python -m pytest test_api.py -v --cov=main --cov-report=html
```

---

*รายงานนี้สร้างอัตโนมัติโดย Automated Test Suite v3.0.0*
*Generated: 2026-03-11*
