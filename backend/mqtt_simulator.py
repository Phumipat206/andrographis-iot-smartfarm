"""
MQTT Sensor Simulator
=====================
จำลองการส่งข้อมูลเซ็นเซอร์ผ่าน MQTT เพื่อทดสอบระบบ
ใช้เมื่อยังไม่มีอุปกรณ์จริง

การใช้งาน:
    python mqtt_simulator.py [--broker localhost] [--port 1883]

ข้อมูลที่จำลอง:
    - ความชื้น (humidity)
    - ความเข้มแสง (lux)
    - CWSI แปลง 1 และ 2
    - อุณหภูมิผิวใบ แปลง 1 และ 2
    - ระดับน้ำ แปลง 1 และ 2
"""

import json
import time
import random
import math
import argparse
from datetime import datetime

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("❌ ต้องติดตั้ง paho-mqtt ก่อน: pip install paho-mqtt")
    exit(1)


# ─── Topic Configuration (ต้องตรงกับ config.py) ────────────────
TOPICS = {
    "humidity": "farm/sensor/humidity",
    "lux": "farm/sensor/lux",
    "cwsi1": "farm/sensor/cwsi/1",
    "cwsi2": "farm/sensor/cwsi/2",
    "leaf_temp1": "farm/sensor/leaf_temp/1",
    "leaf_temp2": "farm/sensor/leaf_temp/2",
    "water_level1": "farm/sensor/water_level/1",
    "water_level2": "farm/sensor/water_level/2",
}


def simulate_sensors(hour: float) -> dict:
    """
    Generate realistic sensor values based on time of day.
    
    Args:
        hour: Current hour (0-24, float)
    
    Returns:
        Dictionary of sensor readings
    """
    # ─── ความชื้น: สูงตอนเช้า ต่ำตอนบ่าย ────────────
    base_humidity = 65 + 20 * math.cos((hour - 6) * math.pi / 12)
    humidity = round(max(30, min(95, base_humidity + random.gauss(0, 3))), 1)

    # ─── ความเข้มแสง: peak ตอนเที่ยง ──────────────────
    if 6 <= hour <= 18:
        sun_factor = math.sin((hour - 6) * math.pi / 12)
        lux = round(max(100, 80000 * sun_factor + random.gauss(0, 2000)))
    else:
        lux = round(max(0, random.gauss(10, 5)))

    # ─── CWSI: ปกติ 0.1-0.3, เครียดเมื่อแดดจัด ─────────
    base_cwsi1 = 0.15 + 0.15 * math.sin((hour - 8) * math.pi / 8)
    cwsi1_index = round(max(0, min(1.0, base_cwsi1 + random.gauss(0, 0.03))), 3)
    cwsi1_value = round(24 + 6 * cwsi1_index + random.gauss(0, 0.5), 1)

    base_cwsi2 = 0.10 + 0.10 * math.sin((hour - 8) * math.pi / 8)
    cwsi2_index = round(max(0, min(1.0, base_cwsi2 + random.gauss(0, 0.02))), 3)
    cwsi2_value = round(23 + 5 * cwsi2_index + random.gauss(0, 0.4), 1)

    # ─── อุณหภูมิผิวใบ: 22-35°C ──────────────────────
    leaf_temp1 = round(25 + 5 * math.sin((hour - 6) * math.pi / 12) + random.gauss(0, 0.5), 1)
    leaf_temp2 = round(24.5 + 4.5 * math.sin((hour - 6) * math.pi / 12) + random.gauss(0, 0.4), 1)

    # ─── ระดับน้ำ: ค่อยๆ ลดในระหว่างวัน ─────────────────
    water_level1 = round(18 - 0.3 * hour + random.gauss(0, 0.2), 1)
    water_level2 = round(17 - 0.25 * hour + random.gauss(0, 0.2), 1)

    return {
        "humidity": humidity,
        "lux": lux,
        "cwsi1": json.dumps({"value": cwsi1_value, "index": cwsi1_index}),
        "cwsi2": json.dumps({"value": cwsi2_value, "index": cwsi2_index}),
        "leaf_temp1": leaf_temp1,
        "leaf_temp2": leaf_temp2,
        "water_level1": max(5, water_level1),
        "water_level2": max(5, water_level2),
    }


def main():
    parser = argparse.ArgumentParser(description="Andrographis Smart Farm - MQTT Sensor Simulator")
    parser.add_argument("--broker", default="localhost", help="MQTT broker host (default: localhost)")
    parser.add_argument("--port", type=int, default=1883, help="MQTT broker port (default: 1883)")
    parser.add_argument("--username", default="", help="MQTT username")
    parser.add_argument("--password", default="", help="MQTT password")
    parser.add_argument("--interval", type=int, default=10, help="Seconds between readings (default: 10)")
    args = parser.parse_args()

    # ─── Connect to MQTT ──────────────────────────────────
    client = mqtt.Client()
    if args.username:
        client.username_pw_set(args.username, args.password)

    print(f"🔌 Connecting to MQTT broker at {args.broker}:{args.port}...")
    try:
        client.connect(args.broker, args.port, 60)
        client.loop_start()
    except Exception as e:
        print(f"❌ Cannot connect to MQTT broker: {e}")
        print(f"   ⚡ ตรวจสอบว่า MQTT Broker (เช่น Mosquitto) กำลังทำงานอยู่")
        exit(1)

    print(f"✅ Connected! Sending sensor data every {args.interval} seconds...")
    print(f"   Press Ctrl+C to stop\n")
    print(f"{'─'*60}")

    try:
        count = 0
        while True:
            now = datetime.now()
            hour = now.hour + now.minute / 60.0
            readings = simulate_sensors(hour)
            count += 1

            print(f"\n📊 [{now.strftime('%H:%M:%S')}] Reading #{count}")

            for key, topic in TOPICS.items():
                value = readings[key]
                payload = str(value)
                client.publish(topic, payload, qos=1)
                
                # Pretty print
                if key.startswith("cwsi"):
                    data = json.loads(value)
                    print(f"   {key:15s} → {topic:35s} = {data['value']}°C (CWSI: {data['index']})")
                else:
                    unit = {"humidity": "%", "lux": "Lux", "leaf_temp1": "°C", "leaf_temp2": "°C", "water_level1": "cm", "water_level2": "cm"}
                    print(f"   {key:15s} → {topic:35s} = {value} {unit.get(key, '')}")

            time.sleep(args.interval)

    except KeyboardInterrupt:
        print(f"\n\n{'─'*60}")
        print(f"🛑 Simulator stopped. Total readings sent: {count}")
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
