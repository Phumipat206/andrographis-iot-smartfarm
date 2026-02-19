import { useState, useEffect, useRef } from 'react';
import { Lightbulb, Droplets, SunDim, MapPin, Thermometer, Waves, Leaf, Navigation, WifiOff, Wifi, TrendingUp } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function DashboardPage() {
  const { isDark } = useTheme();
  const { authHeaders } = useAuth();
  const { t } = useLanguage();
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [sensorData, setSensorData] = useState({
    cwsi1: { value: null, index: null, status: null, plot: 1 },
    cwsi2: { value: null, index: null, status: null, plot: 2 },
    humidity: null,
    lux: null,
    location: { name: null, lat: '8.6433°N', lng: '99.8973°E' },
    plots: [
      { id: 1, name: null, leafTemp: null, waterLevel: null },
      { id: 2, name: null, leafTemp: null, waterLevel: null },
    ],
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    let ws;
    let reconnectTimer;

    const connectWs = () => {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/sensors`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        console.log('🔌 WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'initial' || msg.type === 'sensor_update') {
            const d = msg.data;
            setSensorData(prev => ({
              ...prev,
              humidity: d.humidity ?? prev.humidity,
              lux: d.lux ?? prev.lux,
              cwsi1: d.cwsi1 ? { ...prev.cwsi1, ...d.cwsi1 } : prev.cwsi1,
              cwsi2: d.cwsi2 ? { ...prev.cwsi2, ...d.cwsi2 } : prev.cwsi2,
              plots: [
                { ...prev.plots[0], leafTemp: d.leaf_temp1 ?? prev.plots[0].leafTemp, waterLevel: d.water_level1 ?? prev.plots[0].waterLevel },
                { ...prev.plots[1], leafTemp: d.leaf_temp2 ?? prev.plots[1].leafTemp, waterLevel: d.water_level2 ?? prev.plots[1].waterLevel },
              ],
            }));
          }
          if (msg.mqtt_connected !== undefined) {
            setMqttConnected(msg.mqtt_connected);
          }
        } catch (e) {
          console.warn('WS parse error:', e);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();

    const pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 25000);

    return () => {
      clearInterval(pingInterval);
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  // Fallback HTTP polling
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/sensors/dashboard', {
          headers: authHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setSensorData(data);
          setMqttConnected(data.mqtt_connected || false);
        }
      } catch (e) {}
    };
    fetchData();
    const interval = setInterval(fetchData, connected ? 30000 : 5000);
    return () => clearInterval(interval);
  }, [connected]);

  // CWSI stress level helper
  const getStressInfo = (index) => {
    if (index === null || index === undefined) return { label: t.dashboard.waiting, color: 'gray', bg: isDark ? 'bg-gray-800' : 'bg-gray-100' };
    if (index < 0.2) return { label: t.dashboard.stressNone || 'ไม่มีภาวะเครียด', color: 'green', bg: isDark ? 'bg-green-900/40' : 'bg-green-100', text: 'text-green-400', icon: '✓' };
    if (index < 0.4) return { label: t.dashboard.stressLow || 'ภาวะเครียดต่ำ', color: 'yellow', bg: isDark ? 'bg-yellow-900/40' : 'bg-yellow-100', text: 'text-yellow-400', icon: '!' };
    if (index < 0.6) return { label: t.dashboard.stressMedium || 'ภาวะเครียดปานกลาง', color: 'orange', bg: isDark ? 'bg-orange-900/40' : 'bg-orange-100', text: 'text-orange-400', icon: '⚠' };
    return { label: t.dashboard.stressHigh || 'ภาวะเครียดสูง', color: 'red', bg: isDark ? 'bg-red-900/40' : 'bg-red-100', text: 'text-red-400', icon: '✗' };
  };

  const stress1 = getStressInfo(sensorData.cwsi1.index);
  const stress2 = getStressInfo(sensorData.cwsi2.index);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('/andrographis-bg.jpg')` }} />
        <div className={`absolute inset-0 ${isDark ? 'bg-bg-dark/70' : 'bg-white/60'}`} />
        <div className="relative p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-secondary-green/20 text-secondary-green' : 'bg-green-100 text-green-700'}`}>
                <Leaf className="w-3 h-3" />
                {t.dashboard.badge}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                mqttConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
                {mqttConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {mqttConnected ? 'MQTT' : 'Offline'}
              </span>
            </div>
          </div>
          <h1 className={`text-3xl lg:text-4xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.dashboard.title}</h1>
          <p className={`text-sm font-light tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{t.dashboard.subtitle}</p>
        </div>
      </div>

      {/* ═══ CWSI Prediction ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className={`w-5 h-5 ${isDark ? 'text-active' : 'text-amber-500'}`} />
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.dashboard.predictionTitle || 'คาดการณ์ความเครียดล่วงหน้า'}</h2>
        </div>
        <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.dashboard.predictionDesc || 'พยากรณ์ค่า CWSI ล่วงหน้า 3 วัน'}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Plot 1 Prediction */}
          <div className={`p-4 rounded-2xl ${isDark ? 'bg-gradient-to-br from-amber-900/40 to-orange-900/30 card-shadow-dark' : 'bg-gradient-to-br from-amber-50 to-orange-50 card-shadow'}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-active/20 text-active' : 'bg-amber-100 text-amber-700'}`}>
                {t.dashboard.predict3d || 'พยากรณ์ 3 วัน'}
              </span>
            </div>
            <p className={`text-sm font-semibold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{stress1.label}</p>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.dashboard.plot1} CWSI: {sensorData.cwsi1.index ?? '—'}</p>
          </div>

          {/* Plot 2 Prediction */}
          <div className={`p-4 rounded-2xl ${isDark ? 'bg-gradient-to-br from-green-900/40 to-emerald-900/30 card-shadow-dark' : 'bg-gradient-to-br from-green-50 to-emerald-50 card-shadow'}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-secondary-green/20 text-secondary-green' : 'bg-green-100 text-green-700'}`}>
                {t.dashboard.predict3d || 'พยากรณ์ 3 วัน'}
              </span>
            </div>
            <p className={`text-sm font-semibold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{stress2.label}</p>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.dashboard.plot2} CWSI: {sensorData.cwsi2.index ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* ═══ Environment Overview ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Droplets className={`w-5 h-5 ${isDark ? 'text-secondary-green' : 'text-primary-green'}`} />
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.dashboard.envTitle}</h2>
        </div>
        <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.dashboard.envDesc}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Humidity */}
          <div className={`p-5 rounded-2xl ${isDark ? 'bg-gradient-to-br from-green-900/60 to-green-800/40 card-shadow-dark' : 'bg-gradient-to-br from-green-50 to-green-100 card-shadow'}`}>
            <p className={`text-xs font-medium mb-2 ${isDark ? 'text-green-300' : 'text-green-700'}`}>{t.dashboard.humidity}</p>
            <div className="flex items-center gap-3">
              <Droplets className={`w-8 h-8 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
              <div>
                <span className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{sensorData.humidity !== null ? sensorData.humidity : '—'}</span>
                <span className={`text-sm ml-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{sensorData.humidity !== null ? '%' : ''}</span>
              </div>
            </div>
          </div>

          {/* Light Intensity */}
          <div className={`p-5 rounded-2xl ${isDark ? 'bg-gradient-to-br from-amber-900/60 to-orange-800/40 card-shadow-dark' : 'bg-gradient-to-br from-amber-50 to-orange-100 card-shadow'}`}>
            <p className={`text-xs font-medium mb-2 ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{t.dashboard.lightIntensity}</p>
            <div className="flex items-center gap-3">
              <SunDim className={`w-8 h-8 ${isDark ? 'text-yellow-400' : 'text-yellow-500'}`} />
              <div>
                <span className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{sensorData.lux !== null ? sensorData.lux : '—'}</span>
                <span className={`text-sm ml-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{sensorData.lux !== null ? 'Lux' : ''}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Location Map ═══ */}
      <div className={`p-4 rounded-2xl overflow-hidden ${isDark ? 'bg-bg-dark-card card-shadow-dark' : 'bg-white card-shadow'}`}>
        <div className="relative w-full h-40 rounded-xl overflow-hidden mb-3">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d986.131263375516!2d99.89745090927582!3d8.641509289765589!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3053a1796fcd307f%3A0x7aadb40e612ebad!2z4Lih4Lir4Liy4Lin4Li04LiX4Lii4Liy4Lil4Lix4Lii4Lin4Lil4Lix4Lii4Lil4Lix4LiB4Lip4LiT4LmM!5e0!3m2!1sth!2stw!4v1771169003055!5m2!1sth!2stw"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Farm Location Map"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDark ? 'bg-secondary-green/20' : 'bg-green-100'}`}>
              <MapPin className={`w-5 h-5 ${isDark ? 'text-secondary-green' : 'text-green-600'}`} />
            </div>
            <div>
              <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{sensorData.location.name || t.dashboard.locationName}</p>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{sensorData.location.lat}, {sensorData.location.lng}</p>
            </div>
          </div>
          <button className={`w-10 h-10 rounded-full flex items-center justify-center ${isDark ? 'bg-secondary-green text-white' : 'bg-green-500 text-white'}`}>
            <Navigation className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ═══ Greenhouse 1 ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Leaf className={`w-5 h-5 ${isDark ? 'text-secondary-green' : 'text-primary-green'}`} />
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{sensorData.plots[0].name || t.dashboard.greenhouse1 || 'โรงเรือน 1'}</h2>
        </div>
        <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.dashboard.plotDetailDesc}</p>

        <div className={`p-5 rounded-2xl ${isDark ? 'bg-gradient-to-br from-green-900/50 to-teal-900/40 card-shadow-dark' : 'bg-gradient-to-br from-green-50 to-teal-50 card-shadow'}`}>
          <div className="grid grid-cols-3 gap-3">
            {/* Leaf Temp */}
            <div className="flex flex-col items-center text-center">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${isDark ? 'bg-orange-500/20' : 'bg-orange-100'}`}>
                <Thermometer className={`w-6 h-6 ${isDark ? 'text-orange-400' : 'text-orange-500'}`} />
              </div>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.dashboard.leafTemp || 'อุณหภูมิ'}</p>
              <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {sensorData.plots[0].leafTemp ?? '—'}
              </p>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>°C</p>
            </div>

            {/* Water Level */}
            <div className="flex flex-col items-center text-center">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${isDark ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                <Waves className={`w-6 h-6 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
              </div>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.dashboard.waterLevel || 'ระดับน้ำ'}</p>
              <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {sensorData.plots[0].waterLevel ?? '—'}
              </p>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>cm</p>
            </div>

            {/* CWSI */}
            <div className="flex flex-col items-center text-center">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${isDark ? 'bg-red-500/20' : 'bg-red-100'}`}>
                <Leaf className={`w-6 h-6 ${isDark ? 'text-red-400' : 'text-red-500'}`} />
              </div>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>CWSI</p>
              <p className={`text-xl font-bold ${sensorData.cwsi1.index !== null && sensorData.cwsi1.index >= 0.3 ? 'text-red-400' : isDark ? 'text-secondary-green' : 'text-green-600'}`}>
                {sensorData.cwsi1.index ?? '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Greenhouse 2 ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Leaf className={`w-5 h-5 ${isDark ? 'text-secondary-green' : 'text-primary-green'}`} />
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{sensorData.plots[1].name || t.dashboard.greenhouse2 || 'โรงเรือน 2'}</h2>
        </div>
        <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.dashboard.plotDetailDesc}</p>

        <div className={`p-5 rounded-2xl ${isDark ? 'bg-gradient-to-br from-blue-900/50 to-indigo-900/40 card-shadow-dark' : 'bg-gradient-to-br from-blue-50 to-indigo-50 card-shadow'}`}>
          <div className="grid grid-cols-3 gap-3">
            {/* Leaf Temp */}
            <div className="flex flex-col items-center text-center">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${isDark ? 'bg-orange-500/20' : 'bg-orange-100'}`}>
                <Thermometer className={`w-6 h-6 ${isDark ? 'text-orange-400' : 'text-orange-500'}`} />
              </div>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.dashboard.leafTemp || 'อุณหภูมิ'}</p>
              <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {sensorData.plots[1].leafTemp ?? '—'}
              </p>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>°C</p>
            </div>

            {/* Water Level */}
            <div className="flex flex-col items-center text-center">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${isDark ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                <Waves className={`w-6 h-6 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
              </div>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.dashboard.waterLevel || 'ระดับน้ำ'}</p>
              <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {sensorData.plots[1].waterLevel ?? '—'}
              </p>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>cm</p>
            </div>

            {/* CWSI */}
            <div className="flex flex-col items-center text-center">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${isDark ? 'bg-red-500/20' : 'bg-red-100'}`}>
                <Leaf className={`w-6 h-6 ${isDark ? 'text-red-400' : 'text-red-500'}`} />
              </div>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>CWSI</p>
              <p className={`text-xl font-bold ${sensorData.cwsi2.index !== null && sensorData.cwsi2.index >= 0.3 ? 'text-red-400' : isDark ? 'text-secondary-green' : 'text-green-600'}`}>
                {sensorData.cwsi2.index ?? '—'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
