import os

# JWT Config
SECRET_KEY = os.getenv("SECRET_KEY", "andrographis-smartfarm-secret-key-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "smartfarm.db")

# MQTT Config
MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")

# MQTT Topics
MQTT_TOPICS = {
    "whiteLight": "farm/light/white",
    "purpleLight": "farm/light/purple",
    "ventilation": "farm/fan/ventilation",
    "master": "farm/master",
    "sensor_humidity": "farm/sensor/humidity",
    "sensor_lux": "farm/sensor/lux",
    "sensor_cwsi1": "farm/sensor/cwsi/1",
    "sensor_cwsi2": "farm/sensor/cwsi/2",
    "sensor_leaf_temp1": "farm/sensor/leaf_temp/1",
    "sensor_leaf_temp2": "farm/sensor/leaf_temp/2",
    "sensor_water_level1": "farm/sensor/water_level/1",
    "sensor_water_level2": "farm/sensor/water_level/2",
}
