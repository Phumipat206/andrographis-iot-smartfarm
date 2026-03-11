import { useState, useEffect } from 'react';
import {
  Lightbulb, Droplets, Power, Zap,
  Clock, Sprout
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiUrl } from '../config.js';

export default function ControlPage() {
  const { isDark } = useTheme();
  const { authHeaders } = useAuth();
  const { t } = useLanguage();
  const [controls, setControls] = useState({
    whiteLight: false, purpleLight: false, ventilation: false, masterSwitch: false,
  });
  const [humidity, setHumidity] = useState(null);

  // Simple schedule automation
  const [autoMode, setAutoMode] = useState(false);
  const [scheduleStart, setScheduleStart] = useState('06:00');
  const [scheduleEnd, setScheduleEnd] = useState('18:00');
  const [scheduleSaving, setScheduleSaving] = useState(false);

  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch(apiUrl('/api/controls/state'), { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          setControls(data.controls || controls);
          setHumidity(data.humidity);
        }
      } catch (e) {}
    };
    fetchState();
    const iv = setInterval(fetchState, 5000);
    return () => clearInterval(iv);
  }, []);

  // Load automation schedule from dedicated endpoint
  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        const res = await fetch(apiUrl('/api/controls/schedule'), { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          setAutoMode(data.enabled);
          if (data.schedule_start) setScheduleStart(data.schedule_start);
          if (data.schedule_end) setScheduleEnd(data.schedule_end);
        }
      } catch (e) {}
    };
    fetchSchedule();
  }, []);

  // Save schedule to backend whenever it changes
  const saveSchedule = async (enabled, start, end) => {
    setScheduleSaving(true);
    try {
      await fetch(apiUrl('/api/controls/schedule'), {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, schedule_start: start, schedule_end: end }),
      });
    } catch (e) {
      console.error('Failed to save schedule:', e);
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleAutoModeToggle = () => {
    const newVal = !autoMode;
    setAutoMode(newVal);
    saveSchedule(newVal, scheduleStart, scheduleEnd);
  };

  const handleScheduleStartChange = (e) => {
    const val = e.target.value;
    setScheduleStart(val);
    if (autoMode) saveSchedule(autoMode, val, scheduleEnd);
  };

  const handleScheduleEndChange = (e) => {
    const val = e.target.value;
    setScheduleEnd(val);
    if (autoMode) saveSchedule(autoMode, scheduleStart, val);
  };

  const toggleControl = async (key) => {
    const nv = !controls[key];
    setControls(p => ({ ...p, [key]: nv }));
    try {
      await fetch(apiUrl('/api/controls/toggle'), {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ device: key, state: nv }),
      });
    } catch (e) { setControls(p => ({ ...p, [key]: !nv })); }
  };

  const toggleMaster = async () => {
    const nv = !controls.masterSwitch;
    if (!nv) setControls({ whiteLight: false, purpleLight: false, ventilation: false, masterSwitch: false });
    else setControls(p => ({ ...p, masterSwitch: true }));
    try {
      await fetch(apiUrl('/api/controls/master'), {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ state: nv }),
      });
    } catch (e) {}
  };

  const lightOn = controls.whiteLight;
  const humidityValue = humidity !== null ? humidity : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('/andrographis-bg.jpg')` }} />
        <div className={`absolute inset-0 ${isDark ? 'bg-bg-dark/70' : 'bg-white/60'}`} />
        <div className="relative p-6">
          <div className="flex items-center justify-between mb-4">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-active/20 text-active' : 'bg-amber-100 text-amber-700'}`}>
              <Zap className="w-3 h-3" />{t.control.badge}
            </span>
          </div>
          <h1 className={`text-3xl lg:text-4xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.control.title}</h1>
          <p className={`text-sm font-light tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{t.control.subtitle}</p>
        </div>
      </div>

      {/* ═══ Lighting Control ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb className={`w-5 h-5 ${isDark ? 'text-active' : 'text-amber-500'}`} />
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.control.lightingTitle}</h2>
        </div>
        <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.control.lightingDesc}</p>

        <div className={`p-5 rounded-2xl transition-all duration-300 ${
          lightOn
            ? isDark ? 'bg-gradient-to-br from-amber-900/60 to-orange-800/40 card-shadow-dark' : 'bg-gradient-to-br from-amber-50 to-orange-100 card-shadow'
            : isDark ? 'bg-bg-dark-card card-shadow-dark' : 'bg-white card-shadow'
        }`}>
          <div className="flex items-center justify-between mb-5">
            <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.control.lightLabel || 'ไฟแสงสว่าง'}</h3>
            <div className={`w-3 h-3 rounded-full ${lightOn ? 'bg-active' : isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
          </div>

          <div className="flex justify-center mb-5">
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-all ${
              lightOn ? 'bg-active/20' : isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-100'
            }`}>
              <Lightbulb className={`w-10 h-10 transition-all ${lightOn ? 'text-active' : isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            </div>
          </div>

          <div className="flex justify-center gap-3">
            <button
              onClick={() => !lightOn && toggleControl('whiteLight')}
              className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                lightOn ? 'bg-active text-white shadow-lg' : isDark ? 'bg-bg-dark-card-alt text-gray-400' : 'bg-gray-100 text-gray-500'
              }`}
            >ON</button>
            <button
              onClick={() => lightOn && toggleControl('whiteLight')}
              className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                !lightOn ? isDark ? 'bg-gray-600 text-white' : 'bg-gray-800 text-white' : isDark ? 'bg-bg-dark-card-alt text-gray-400' : 'bg-gray-100 text-gray-500'
              }`}
            >OFF</button>
          </div>
        </div>

        {/* Purple Light */}
        <div className={`p-5 rounded-2xl transition-all duration-300 mt-4 ${
          controls.purpleLight
            ? isDark ? 'bg-gradient-to-br from-purple-900/60 to-violet-800/40 card-shadow-dark' : 'bg-gradient-to-br from-purple-50 to-violet-100 card-shadow'
            : isDark ? 'bg-bg-dark-card card-shadow-dark' : 'bg-white card-shadow'
        }`}>
          <div className="flex items-center justify-between mb-5">
            <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.control.purpleLight || 'ไฟแสงสีม่วง'}</h3>
            <div className={`w-3 h-3 rounded-full ${controls.purpleLight ? 'bg-purple-500' : isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
          </div>

          <div className="flex justify-center mb-5">
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-all ${
              controls.purpleLight ? 'bg-purple-500/20' : isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-100'
            }`}>
              <Lightbulb className={`w-10 h-10 transition-all ${controls.purpleLight ? 'text-purple-500' : isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            </div>
          </div>

          <div className="flex justify-center gap-3">
            <button
              onClick={() => !controls.purpleLight && toggleControl('purpleLight')}
              className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                controls.purpleLight ? 'bg-purple-500 text-white shadow-lg' : isDark ? 'bg-bg-dark-card-alt text-gray-400' : 'bg-gray-100 text-gray-500'
              }`}
            >ON</button>
            <button
              onClick={() => controls.purpleLight && toggleControl('purpleLight')}
              className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                !controls.purpleLight ? isDark ? 'bg-gray-600 text-white' : 'bg-gray-800 text-white' : isDark ? 'bg-bg-dark-card-alt text-gray-400' : 'bg-gray-100 text-gray-500'
              }`}
            >OFF</button>
          </div>
        </div>
      </div>

      {/* ═══ Humidity Control ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Droplets className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.control.humidityTitle || 'ระบบควบคุมความชื้น'}</h2>
        </div>
        <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.control.humidityDesc || 'เมื่อความชื้นต่ำ ระบบจะเปิดสปริงเกอร์อัตโนมัติ'}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Current Humidity */}
          <div className={`p-5 rounded-2xl ${isDark ? 'bg-gradient-to-br from-blue-900/60 to-cyan-800/40 card-shadow-dark' : 'bg-gradient-to-br from-blue-50 to-cyan-100 card-shadow'}`}>
            <p className={`text-xs font-medium mb-3 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>{t.control.currentHumidity}</p>
            <div className="flex items-center gap-3 mb-3">
              <Droplets className={`w-10 h-10 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
              <span className={`text-4xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {humidity !== null ? `${humidity}%` : '—'}
              </span>
            </div>
            {/* Progress bar */}
            <div className={`w-full h-1.5 rounded-full ${isDark ? 'bg-blue-900/50' : 'bg-blue-200'}`}>
              <div className="h-full rounded-full bg-blue-400 transition-all duration-500" style={{ width: `${Math.min(humidityValue, 100)}%` }} />
            </div>
          </div>

          {/* Sprinkler Control */}
          <div className={`p-5 rounded-2xl ${isDark ? 'bg-bg-dark-card card-shadow-dark' : 'bg-white card-shadow'}`}>
            <div className="flex items-center justify-between mb-3">
              <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.control.sprinkler || 'สปริงเกอร์'}</p>
              <Sprout className={`w-5 h-5 ${controls.ventilation ? 'text-secondary-green' : isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            </div>
            <div className="flex justify-center gap-3 mt-6">
              <button
                onClick={() => !controls.ventilation && toggleControl('ventilation')}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                  controls.ventilation ? 'bg-secondary-green text-white shadow-lg' : isDark ? 'bg-bg-dark-card-alt text-gray-400' : 'bg-gray-100 text-gray-500'
                }`}
              >ON</button>
              <button
                onClick={() => controls.ventilation && toggleControl('ventilation')}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                  !controls.ventilation ? isDark ? 'bg-gray-600 text-white' : 'bg-gray-800 text-white' : isDark ? 'bg-bg-dark-card-alt text-gray-400' : 'bg-gray-100 text-gray-500'
                }`}
              >OFF</button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Master Switch ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Power className={`w-5 h-5 ${isDark ? 'text-secondary-green' : 'text-primary-green'}`} />
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.control.masterTitle}</h2>
        </div>
        <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.control.masterDesc}</p>

        <div className={`p-5 rounded-2xl ${isDark ? 'bg-bg-dark-card card-shadow-dark' : 'bg-white card-shadow'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                controls.masterSwitch ? 'bg-secondary-green/20' : isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-100'
              }`}>
                <Zap className={`w-6 h-6 ${controls.masterSwitch ? 'text-secondary-green' : isDark ? 'text-gray-500' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.control.masterAll}</p>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {controls.masterSwitch ? (t.control.masterRunning || 'ระบบกำลังทำงาน') : t.control.masterOff}
                </p>
              </div>
            </div>
            <button onClick={toggleMaster} className={`relative w-14 h-7 rounded-full transition-all duration-300 ${controls.masterSwitch ? 'bg-secondary-green' : isDark ? 'bg-gray-600' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 ${controls.masterSwitch ? 'left-7' : 'left-0.5'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ═══ Auto Schedule ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Clock className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.control.scheduleTitle || 'ตารางเวลาอัตโนมัติ'}</h2>
        </div>
        <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.control.scheduleDesc || 'ตั้งให้ระบบทำงานอัตโนมัติ'}</p>

        <div className={`p-5 rounded-2xl space-y-5 ${isDark ? 'bg-bg-dark-card card-shadow-dark' : 'bg-white card-shadow'}`}>
          {/* Auto Mode Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.control.autoMode || 'โหมดอัตโนมัติ'}</p>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {autoMode ? `${t.control.activeRange || 'ทำงาน'} ${scheduleStart} - ${scheduleEnd}` : (t.control.autoDisabled || 'ปิดใช้งาน')}
              </p>
            </div>
            <button onClick={handleAutoModeToggle} className={`relative w-14 h-7 rounded-full transition-all duration-300 ${autoMode ? 'bg-secondary-green' : isDark ? 'bg-gray-600' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 ${autoMode ? 'left-7' : 'left-0.5'}`} />
            </button>
          </div>

          {/* Time Pickers (shown when auto mode is on) */}
          {autoMode && (
            <>
              <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`} />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={`text-xs font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    ☀️ {t.control.startTimeLabel || 'เริ่มต้น'}
                  </p>
                  <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
                    <Clock className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                    <input
                      type="time"
                      value={scheduleStart}
                      onChange={handleScheduleStartChange}
                      className={`bg-transparent text-lg font-bold border-none outline-none w-full ${isDark ? 'text-white' : 'text-gray-900'}`}
                    />
                  </div>
                </div>
                <div>
                  <p className={`text-xs font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    🌙 {t.control.endTimeLabel || 'สิ้นสุด'}
                  </p>
                  <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
                    <Clock className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                    <input
                      type="time"
                      value={scheduleEnd}
                      onChange={handleScheduleEndChange}
                      className={`bg-transparent text-lg font-bold border-none outline-none w-full ${isDark ? 'text-white' : 'text-gray-900'}`}
                    />
                  </div>
                </div>
              </div>

              {/* Device tags */}
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-secondary-green/20 text-secondary-green' : 'bg-green-100 text-green-700'}`}>
                  💡 {t.control.scheduleTagLight || 'ระบบไฟ'}
                </span>
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>
                  💧 {t.control.scheduleTagHumidity || 'ระบบความชื้น'}
                </span>
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700'}`}>
                  ⚡ {t.control.scheduleTagAll || 'อุปกรณ์ทั้งหมด'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
