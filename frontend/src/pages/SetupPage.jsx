import { useState, useEffect, useCallback, useRef } from 'react';
import {
  User, Bell, Shield, Globe, Download, Database, BarChart3,
  HelpCircle, Phone, Info, LogOut, ChevronRight, X, MapPin,
  Mail, Leaf, Cpu, Users, Key, Trash2, Edit2,
  Wifi, Link2, Plus, Save, RefreshCw, Upload, ChevronLeft,
  Table, Pencil, Activity
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate } from 'react-router-dom';

export default function SetupPage() {
  const { isDark } = useTheme();
  const { user, logout, authHeaders } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const navigate = useNavigate();
  const [activeModal, setActiveModal] = useState(null);
  const [stats, setStats] = useState({ days: 0, plots: 0, health: 0 });
  const [systemHealth, setSystemHealth] = useState(null);

  // Notifications state (persisted to backend)
  const [notifSettings, setNotifSettings] = useState({
    cwsi_alert: true, water_alert: true, temp_alert: false, daily_report: true,
  });
  const [notifLoading, setNotifLoading] = useState(false);

  // MQTT config state
  const [mqttConfig, setMqttConfig] = useState({ broker: 'localhost', port: '1883', username: '', password: '' });
  const [dashboardDevices, setDashboardDevices] = useState([]);
  const [controlDevices, setControlDevices] = useState([]);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [mqttSaving, setMqttSaving] = useState(false);
  const [newDashboardDevice, setNewDashboardDevice] = useState({ name: '', topic: '' });
  const [newControlDevice, setNewControlDevice] = useState({ name: '', topic: '' });

  // Domain config
  const [domainConfig, setDomainConfig] = useState({ domain: '', api_url: '' });
  const [domainSaving, setDomainSaving] = useState(false);

  // Reports
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportPeriod, setReportPeriod] = useState('week');

  // Mock mode
  const [mockEnabled, setMockEnabled] = useState(false);
  const [mockLoading, setMockLoading] = useState(false);

  // Sensor data table
  const [sensorTableData, setSensorTableData] = useState([]);
  const [sensorTablePage, setSensorTablePage] = useState(1);
  const [sensorTableTotal, setSensorTableTotal] = useState(0);
  const [sensorTablePages, setSensorTablePages] = useState(0);
  const [sensorTableFilter, setSensorTableFilter] = useState('');
  const [sensorTableLoading, setSensorTableLoading] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [editValue, setEditValue] = useState('');
  const fileInputRef = useRef(null);

  // Editable stats
  const [editStats, setEditStats] = useState(false);
  const [statsForm, setStatsForm] = useState({ days: 0, plots: 0, health: 0 });

  // Fetch farm stats on mount
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/farm/stats', { headers: authHeaders() });
        if (res.ok) setStats(await res.json());
      } catch (e) {}
    };
    fetchStats();
  }, []);

  // Fetch notification settings
  const fetchNotifSettings = async () => {
    setNotifLoading(true);
    try {
      const res = await fetch('/api/notifications/settings', { headers: authHeaders() });
      if (res.ok) { const data = await res.json(); setNotifSettings(data); }
    } catch (e) {}
    setNotifLoading(false);
  };

  const toggleNotif = async (key) => {
    const updated = { ...notifSettings, [key]: !notifSettings[key] };
    setNotifSettings(updated);
    try {
      await fetch('/api/notifications/settings', {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(updated),
      });
    } catch (e) { setNotifSettings(notifSettings); }
  };

  // Fetch MQTT config
  const fetchMqttConfig = async () => {
    try {
      const res = await fetch('/api/config', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setMqttConfig(data.mqtt || { broker: 'localhost', port: '1883', username: '', password: '' });
        setDashboardDevices(data.dashboard_devices || []);
        setControlDevices(data.control_devices || []);
        setMqttConnected(data.mqtt_connected);
      }
    } catch (e) {}
  };

  const saveMqttConfig = async () => {
    setMqttSaving(true);
    try {
      const allDevices = [
        ...dashboardDevices.map(d => ({ ...d, category: 'dashboard', type: d.type || 'sensor' })),
        ...controlDevices.map(d => ({ ...d, category: 'control', type: d.type || 'switch' })),
      ];
      await fetch('/api/config', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ mqtt: mqttConfig, devices: allDevices }),
      });
      await fetchMqttConfig();
    } catch (e) {}
    setMqttSaving(false);
  };

  const addDashboardDevice = () => {
    if (!newDashboardDevice.name || !newDashboardDevice.topic) return;
    setDashboardDevices([...dashboardDevices, { ...newDashboardDevice, type: 'sensor', category: 'dashboard', id: Date.now() }]);
    setNewDashboardDevice({ name: '', topic: '' });
  };

  const addControlDevice = () => {
    if (!newControlDevice.name || !newControlDevice.topic) return;
    setControlDevices([...controlDevices, { ...newControlDevice, type: 'switch', category: 'control', id: Date.now() }]);
    setNewControlDevice({ name: '', topic: '' });
  };

  const removeDashboardDevice = (idx) => setDashboardDevices(dashboardDevices.filter((_, i) => i !== idx));
  const removeControlDevice = (idx) => setControlDevices(controlDevices.filter((_, i) => i !== idx));

  // Domain config
  const fetchDomainConfig = async () => {
    try {
      const res = await fetch('/api/config/domain', { headers: authHeaders() });
      if (res.ok) setDomainConfig(await res.json());
    } catch (e) {}
  };

  const saveDomainConfig = async () => {
    setDomainSaving(true);
    try {
      await fetch('/api/config/domain', {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(domainConfig),
      });
    } catch (e) {}
    setDomainSaving(false);
  };

  // Reports
  const fetchReports = async (period) => {
    setReportLoading(true);
    try {
      const res = await fetch(`/api/reports/summary?period=${period}`, { headers: authHeaders() });
      if (res.ok) setReportData(await res.json());
    } catch (e) {}
    setReportLoading(false);
  };

  const fetchSystemHealth = async () => {
    try {
      const res = await fetch('/api/system/health', { headers: authHeaders() });
      if (res.ok) setSystemHealth(await res.json());
    } catch (e) {}
  };

  // Mock mode
  const fetchMockStatus = async () => {
    try {
      const res = await fetch('/api/mock/status', { headers: authHeaders() });
      if (res.ok) { const d = await res.json(); setMockEnabled(d.enabled); }
    } catch (e) {}
  };

  const toggleMock = async () => {
    setMockLoading(true);
    try {
      const res = await fetch('/api/mock/toggle', { method: 'POST', headers: authHeaders() });
      if (res.ok) { const d = await res.json(); setMockEnabled(d.enabled); }
    } catch (e) {}
    setMockLoading(false);
  };

  // Sensor data table
  const fetchSensorTable = async (page = 1, filter = '') => {
    setSensorTableLoading(true);
    try {
      const url = `/api/sensor-data/table?page=${page}&per_page=50&sensor_type=${encodeURIComponent(filter)}`;
      const res = await fetch(url, { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setSensorTableData(d.data);
        setSensorTableTotal(d.total);
        setSensorTablePages(d.total_pages);
        setSensorTablePage(d.page);
      }
    } catch (e) {}
    setSensorTableLoading(false);
  };

  const handleEditSensorRow = async (id) => {
    try {
      await fetch(`/api/sensor-data/${id}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ value: parseFloat(editValue) }),
      });
      setEditingRow(null);
      fetchSensorTable(sensorTablePage, sensorTableFilter);
    } catch (e) {}
  };

  const handleDeleteSensorRow = async (id) => {
    if (!confirm('Delete this data row?')) return;
    try {
      await fetch(`/api/sensor-data/${id}`, { method: 'DELETE', headers: authHeaders() });
      fetchSensorTable(sensorTablePage, sensorTableFilter);
    } catch (e) {}
  };

  const handleDownloadCSV = () => {
    const url = `/api/sensor-data/download-csv?sensor_type=${encodeURIComponent(sensorTableFilter)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sensor_data.csv';
    document.body.appendChild(a); a.click(); a.remove();
  };

  const handleUploadCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const res = await fetch('/api/sensor-data/upload-csv', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'text/csv' },
        body: text,
      });
      if (res.ok) {
        const d = await res.json();
        alert(`Imported ${d.imported} rows`);
        fetchSensorTable(sensorTablePage, sensorTableFilter);
      }
    } catch (e) { alert('Upload failed'); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Editable stats
  const saveStats = async () => {
    try {
      await fetch('/api/farm/stats', {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(statsForm),
      });
      setStats(statsForm);
      setEditStats(false);
    } catch (e) {}
  };

  const handleDownloadData = async () => {
    try {
      const res = await fetch('/api/sensors/cwsi-history?period=month', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const rows = (data.history || []).map(r => `${r.time},${r.plot1},${r.plot2}`);
        const csv = 'time,plot1,plot2\n' + rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url;
        link.download = `cwsi_data_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      } else { alert(t.setup.downloadFail); }
    } catch (e) { alert(t.setup.connectFail); }
  };

  const closeModal = () => setActiveModal(null);

  /* ---- Reusable components ---- */
  const MenuItem = ({ icon: Icon, label, desc, color, darkColor, badge, onClick }) => (
    <button onClick={onClick} className={`w-full flex items-center gap-4 px-4 py-3.5 transition-all ${isDark ? 'hover:bg-bg-dark-card-alt' : 'hover:bg-gray-50'}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? darkColor : color}`}><Icon className="w-5 h-5" /></div>
      <div className="flex-1 text-left min-w-0">
        <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{label}</p>
        <p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{desc}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {badge != null && <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center font-semibold">{badge}</span>}
        <ChevronRight className={`w-4 h-4 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
      </div>
    </button>
  );

  const SectionTitle = ({ icon, title }) => (
    <div className="flex items-center gap-2 px-1 mb-2 mt-2">
      <span className="text-base">{icon}</span>
      <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{title}</h3>
    </div>
  );

  const Toggle = ({ enabled, onToggle }) => (
    <button onClick={onToggle} className={`w-11 h-6 rounded-full flex items-center px-1 transition-all ${enabled ? 'bg-primary-green justify-end' : isDark ? 'bg-gray-600 justify-start' : 'bg-gray-300 justify-start'}`}>
      <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
    </button>
  );

  const inputCls = `w-full mt-1 px-4 py-2.5 rounded-xl text-sm ${isDark ? 'bg-bg-dark-card-alt text-white border-gray-600' : 'bg-gray-50 text-gray-900 border-gray-200'} border focus:outline-none focus:ring-2 focus:ring-green-500`;

  /* ---- Modal content ---- */
  const modalContent = {
    profile: {
      title: t.setup.profile,
      content: (
        <div className="space-y-5">
          <div className="flex justify-center">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 ${isDark ? 'bg-green-900/40 border-green-700/40' : 'bg-green-100 border-green-200'}`}><User className={`w-12 h-12 ${isDark ? 'text-green-400' : 'text-green-600'}`} /></div>
          </div>
          {[{ label: t.setup.usernameLabel, value: user?.username || 'Smart Farmer' }, { label: t.setup.userTypeLabel, value: user?.user_type || 'admin' }, { label: t.setup.emailLabel, value: user?.email || 'farmer@smartfarm.com' }].map((item, i) => (
            <div key={i} className={`p-4 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
              <p className={`text-xs mb-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.label}</p>
              <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{item.value}</p>
            </div>
          ))}
        </div>
      ),
    },
    notifications: {
      title: t.setup.notifications,
      content: (
        <div className="space-y-4">
          {notifLoading ? <p className={`text-sm text-center py-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.loading}</p> : (
            <>
              {[{ key: 'cwsi_alert', label: t.setup.notifCwsi }, { key: 'water_alert', label: t.setup.notifWater }, { key: 'temp_alert', label: t.setup.notifTemp }, { key: 'daily_report', label: t.setup.notifDaily }].map(n => (
                <div key={n.key} className="flex items-center justify-between">
                  <p className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{n.label}</p>
                  <Toggle enabled={notifSettings[n.key]} onToggle={() => toggleNotif(n.key)} />
                </div>
              ))}
            </>
          )}
        </div>
      ),
    },
    privacy: {
      title: t.setup.privacy,
      content: (
        <div className="space-y-4">
          {[{ title: t.setup.authTitle, desc: t.setup.authDesc }, { title: t.setup.encryptTitle, desc: t.setup.encryptDesc }, { title: t.setup.accessTitle, desc: t.setup.accessDesc }].map((item, i) => (
            <div key={i} className={`p-4 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
              <p className={`text-sm font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{item.title}</p>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.desc}</p>
            </div>
          ))}
        </div>
      ),
    },
    language: {
      title: t.setup.language,
      content: (
        <div className="space-y-3">
          {[{ code: 'th', label: t.setup.langTh, flag: '🇹🇭' }, { code: 'en', label: t.setup.langEn, flag: '🇺🇸' }].map(item => (
            <button key={item.code} onClick={() => { setLang(item.code); closeModal(); }} className={`w-full flex items-center gap-3 p-4 rounded-xl transition-all ${lang === item.code ? isDark ? 'bg-green-900/30 ring-2 ring-secondary-green' : 'bg-green-50 ring-2 ring-primary-green' : isDark ? 'bg-bg-dark-card-alt hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'}`}>
              <span className="text-2xl">{item.flag}</span>
              <p className={`text-sm font-medium flex-1 text-left ${isDark ? 'text-white' : 'text-gray-900'}`}>{item.label}</p>
              {lang === item.code && <span className="text-primary-green text-lg">✓</span>}
            </button>
          ))}
        </div>
      ),
    },
    data: {
      title: t.setup.viewData,
      content: (
        <div className="space-y-4">
          <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{t.setup.dataInfo}</p>
          <div className={`p-4 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.database}</p>
            <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>SQLite (smartfarm.db)</p>
          </div>
          <div className={`p-4 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.sensorData}</p>
            <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>CWSI, Humidity, Lux, Leaf Temp, Water Level</p>
          </div>
          <button onClick={() => { closeModal(); setTimeout(() => { fetchSensorTable(1, ''); setActiveModal('sensorTable'); }, 100); }}
            className="w-full py-3 rounded-xl bg-primary-green text-white font-semibold hover:bg-green-600 transition-all flex items-center justify-center gap-2">
            <Table className="w-4 h-4" /> {t.setup.openSensorTable || 'Open Sensor Data Table'}
          </button>
        </div>
      ),
    },
    reports: {
      title: t.setup.reports,
      content: (
        <div className="space-y-4">
          <div className="flex gap-2">
            {['week', 'month'].map(p => (
              <button key={p} onClick={() => { setReportPeriod(p); fetchReports(p); }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${reportPeriod === p ? 'bg-primary-green text-white' : isDark ? 'bg-bg-dark-card-alt text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                {p === 'week' ? t.setup.reportWeek || '7 Days' : t.setup.reportMonth || '30 Days'}
              </button>
            ))}
          </div>
          {reportLoading ? <p className={`text-sm text-center py-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.loading}</p>
            : !reportData ? <p className={`text-sm text-center py-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.clickToLoad || 'Select a period to load report'}</p>
            : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-3 rounded-xl text-center ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
                    <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{reportData.total_readings ?? 0}</p>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.reportReadings || 'Readings'}</p>
                  </div>
                  <div className={`p-3 rounded-xl text-center ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
                    <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{reportData.avg_cwsi ?? '—'}</p>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.reportAvgCwsi || 'Avg CWSI'}</p>
                  </div>
                  <div className={`p-3 rounded-xl text-center ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
                    <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{reportData.avg_humidity ?? '—'}%</p>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.reportAvgHumidity || 'Avg Humidity'}</p>
                  </div>
                  <div className={`p-3 rounded-xl text-center ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
                    <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{reportData.avg_lux ?? '—'}</p>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.reportAvgLux || 'Avg Lux'}</p>
                  </div>
                </div>
                {reportData.chart && reportData.chart.length > 0 && (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportData.chart}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#e5e7eb'} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: isDark ? '#9ca3af' : '#6b7280' }} />
                        <YAxis tick={{ fontSize: 10, fill: isDark ? '#9ca3af' : '#6b7280' }} />
                        <Tooltip contentStyle={{ backgroundColor: isDark ? '#1f2937' : '#fff', border: 'none', borderRadius: 8 }} />
                        <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
        </div>
      ),
    },
    mqttConfig: {
      title: t.setup.mqttConfig || 'MQTT Configuration',
      content: (
        <div className="space-y-4">
          <div className={`flex items-center gap-2 p-3 rounded-xl ${mqttConnected ? isDark ? 'bg-green-900/20' : 'bg-green-50' : isDark ? 'bg-red-900/20' : 'bg-red-50'}`}>
            <Wifi className={`w-4 h-4 ${mqttConnected ? 'text-green-500' : 'text-red-500'}`} />
            <p className={`text-sm font-medium ${mqttConnected ? 'text-green-600' : 'text-red-600'}`}>{mqttConnected ? (t.setup.mqttConnected || 'Connected') : (t.setup.mqttDisconnected || 'Disconnected')}</p>
          </div>
          <div><label className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{t.setup.mqttBroker || 'Broker'}</label><input type="text" value={mqttConfig.broker} onChange={e => setMqttConfig({ ...mqttConfig, broker: e.target.value })} className={inputCls} /></div>
          <div><label className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{t.setup.mqttPort || 'Port'}</label><input type="text" value={mqttConfig.port} onChange={e => setMqttConfig({ ...mqttConfig, port: e.target.value })} className={inputCls} /></div>
          <div><label className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{t.setup.mqttUsername || 'Username'}</label><input type="text" value={mqttConfig.username} onChange={e => setMqttConfig({ ...mqttConfig, username: e.target.value })} className={inputCls} /></div>
          <div><label className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{t.setup.mqttPassword || 'Password'}</label><input type="password" value={mqttConfig.password} onChange={e => setMqttConfig({ ...mqttConfig, password: e.target.value })} className={inputCls} /></div>

          {/* ── Dashboard Sensors Section ── */}
          <div className={`border-t pt-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">📊</span>
              <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.setup.mqttDashboardSection || 'Dashboard — Sensor Topics'}</p>
            </div>
            <p className={`text-xs mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.mqttDashboardDesc || 'MQTT topics for sensors displayed on the Dashboard page'}</p>
            {dashboardDevices.map((d, i) => (
              <div key={i} className={`flex items-center gap-2 p-3 rounded-xl mb-2 ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
                <div className={`w-2 h-2 rounded-full bg-teal-500 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{d.name}</p>
                  <p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{d.topic}</p>
                </div>
                <button onClick={() => removeDashboardDevice(i)} className="p-1 text-red-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            {dashboardDevices.length === 0 && (
              <p className={`text-xs text-center py-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{t.setup.noDevices || 'No sensor topics configured'}</p>
            )}
            <div className="grid grid-cols-5 gap-2 mt-2">
              <input placeholder={t.setup.mqttDeviceName || 'Name'} value={newDashboardDevice.name} onChange={e => setNewDashboardDevice({ ...newDashboardDevice, name: e.target.value })} className={`${inputCls} col-span-2`} />
              <input placeholder={t.setup.mqttTopic || 'Topic'} value={newDashboardDevice.topic} onChange={e => setNewDashboardDevice({ ...newDashboardDevice, topic: e.target.value })} className={`${inputCls} col-span-2`} />
              <button onClick={addDashboardDevice} className="mt-1 px-3 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-medium"><Plus className="w-4 h-4 inline" /></button>
            </div>
          </div>

          {/* ── Control Devices Section ── */}
          <div className={`border-t pt-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🎛️</span>
              <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.setup.mqttControlSection || 'Control — Device Topics'}</p>
            </div>
            <p className={`text-xs mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.mqttControlDesc || 'MQTT topics for devices controlled on the Control page (ESP32 actuators)'}</p>
            {controlDevices.map((d, i) => (
              <div key={i} className={`flex items-center gap-2 p-3 rounded-xl mb-2 ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
                <div className={`w-2 h-2 rounded-full bg-amber-500 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{d.name}</p>
                  <p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{d.topic}</p>
                </div>
                <button onClick={() => removeControlDevice(i)} className="p-1 text-red-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            {controlDevices.length === 0 && (
              <p className={`text-xs text-center py-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{t.setup.noDevices || 'No control devices configured'}</p>
            )}
            <div className="grid grid-cols-5 gap-2 mt-2">
              <input placeholder={t.setup.mqttDeviceName || 'Name'} value={newControlDevice.name} onChange={e => setNewControlDevice({ ...newControlDevice, name: e.target.value })} className={`${inputCls} col-span-2`} />
              <input placeholder={t.setup.mqttTopic || 'Topic'} value={newControlDevice.topic} onChange={e => setNewControlDevice({ ...newControlDevice, topic: e.target.value })} className={`${inputCls} col-span-2`} />
              <button onClick={addControlDevice} className="mt-1 px-3 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-medium"><Plus className="w-4 h-4 inline" /></button>
            </div>
          </div>

          <button onClick={saveMqttConfig} disabled={mqttSaving} className="w-full py-3 rounded-xl bg-primary-green text-white font-semibold hover:bg-green-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {mqttSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t.setup.mqttSave || 'Save & Reconnect'}
          </button>
        </div>
      ),
    },
    domainConfig: {
      title: t.setup.domainConfig || 'Domain Configuration',
      content: (
        <div className="space-y-4">
          <div><label className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{t.setup.domainUrl || 'Domain URL'}</label><input type="text" placeholder="https://smartfarm.example.com" value={domainConfig.domain} onChange={e => setDomainConfig({ ...domainConfig, domain: e.target.value })} className={inputCls} /></div>
          <div><label className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{t.setup.apiUrl || 'API URL'}</label><input type="text" placeholder="http://localhost:8001" value={domainConfig.api_url} onChange={e => setDomainConfig({ ...domainConfig, api_url: e.target.value })} className={inputCls} /></div>
          <button onClick={saveDomainConfig} disabled={domainSaving} className="w-full py-3 rounded-xl bg-primary-green text-white font-semibold hover:bg-green-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {domainSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t.setup.domainSave || 'Save Domain Config'}
          </button>
        </div>
      ),
    },
    faq: {
      title: t.setup.faq,
      content: (
        <div className="space-y-4">
          {[{ q: t.setup.faqQ1, a: t.setup.faqA1 }, { q: t.setup.faqQ2, a: t.setup.faqA2 }, { q: t.setup.faqQ3, a: t.setup.faqA3 }, { q: t.setup.faqQ4, a: t.setup.faqA4 }].map((item, i) => (
            <div key={i} className={`p-4 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
              <p className={`text-sm font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{item.q}</p>
              <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.a}</p>
            </div>
          ))}
        </div>
      ),
    },
    contact: {
      title: t.setup.contactUs,
      content: (
        <div className="space-y-4">
          <div className={`p-4 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
            <div className="flex items-center gap-3 mb-2"><MapPin className={`w-4 h-4 ${isDark ? 'text-green-400' : 'text-green-600'}`} /><p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.setup.address}</p></div>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.addressDetail}</p>
          </div>
          <div className={`p-4 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
            <div className="flex items-center gap-3 mb-2"><Mail className={`w-4 h-4 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} /><p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.setup.email}</p></div>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>smartfarm@wu.ac.th</p>
          </div>
          <div className={`p-4 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
            <div className="flex items-center gap-3 mb-2"><Phone className={`w-4 h-4 ${isDark ? 'text-green-400' : 'text-green-600'}`} /><p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.setup.phone}</p></div>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>075-673-000</p>
          </div>
          <div className="rounded-xl overflow-hidden">
            <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d986.131263375516!2d99.89745090927582!3d8.641509289765589!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3053a1796fcd307f%3A0x7aadb40e612ebad!2z4Lih4Lir4Liy4Lin4Li04LiX4Lii4Liy4Lil4Lix4Lii4Lin4Lil4Lix4Lii4Lil4Lix4LiB4Lip4LiT4LmM!5e0!3m2!1sth!2stw!4v1771169003055!5m2!1sth!2stw" width="100%" height="200" style={{ border: 0 }} allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Map" />
          </div>
        </div>
      ),
    },
    about: {
      title: t.setup.about,
      content: (
        <div className="space-y-4">
          <div className="text-center py-2">
            <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-3 ${isDark ? 'bg-green-900/40' : 'bg-green-100'}`}><Leaf className={`w-8 h-8 ${isDark ? 'text-green-400' : 'text-green-600'}`} /></div>
            <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Andrographis Smart Farm</h3>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.version}</p>
          </div>
          <div className={`p-4 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}><p className={`text-xs leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.aboutInfo}</p></div>
          <div className={`p-4 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
            <p className={`text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{t.setup.tech}</p>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>React + Vite, FastAPI, SQLite, MQTT, Raspberry Pi + ESP32</p>
          </div>
          <div>
            <p className={`text-xs font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{t.setup.location}</p>
            <div className="rounded-xl overflow-hidden">
              <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d986.131263375516!2d99.89745090927582!3d8.641509289765589!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3053a1796fcd307f%3A0x7aadb40e612ebad!2z4Lih4Lir4Liy4Lin4Li04LiX4Lii4Liy4Lil4Lix4Lii4Lin4Lil4Lix4Lii4Lil4Lix4LiB4Lip4LiT4LmM!5e0!3m2!1sth!2stw!4v1771169003055!5m2!1sth!2stw" width="100%" height="200" style={{ border: 0 }} allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Map" />
            </div>
          </div>
        </div>
      ),
    },
    systemHealth: {
      title: t.setup.systemHealth,
      content: (
        <div className="space-y-4">
          {!systemHealth ? (<p className={`text-sm text-center py-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.loading}</p>) : (
            <>
              {[{ label: 'CPU', value: `${systemHealth.cpu_percent ?? '—'}%`, pct: systemHealth.cpu_percent ?? 0, color: 'bg-blue-500' },
                { label: 'RAM', value: `${systemHealth.memory_used ?? '—'} / ${systemHealth.memory_total ?? '—'} GB (${systemHealth.memory_percent ?? '—'}%)`, pct: systemHealth.memory_percent ?? 0, color: 'bg-green-500' },
                { label: 'Disk', value: `${systemHealth.disk_used ?? '—'} / ${systemHealth.disk_total ?? '—'} GB (${systemHealth.disk_percent ?? '—'}%)`, pct: systemHealth.disk_percent ?? 0, color: 'bg-orange-500' }
              ].map((item, i) => (
                <div key={i} className={`p-4 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.label}</p>
                    <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{item.value}</p>
                  </div>
                  <div className={`w-full h-2 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}><div className={`h-2 rounded-full ${item.color} transition-all`} style={{ width: `${item.pct}%` }} /></div>
                </div>
              ))}
              {systemHealth.cpu_temp && (
                <div className={`p-4 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.cpuTemp}</p>
                  <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{systemHealth.cpu_temp}°C</p>
                </div>
              )}
              <div className={`p-4 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Uptime</p>
                <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{systemHealth.uptime ?? '—'}</p>
              </div>
            </>
          )}
        </div>
      ),
    },
    sensorTable: {
      title: t.setup.sensorTableTitle || 'Sensor Data Table',
      content: (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <select value={sensorTableFilter} onChange={e => { setSensorTableFilter(e.target.value); fetchSensorTable(1, e.target.value); }}
              className={`px-3 py-2 rounded-xl text-xs ${isDark ? 'bg-bg-dark-card-alt text-white border-gray-600' : 'bg-gray-50 text-gray-900 border-gray-200'} border`}>
              <option value="">{t.setup.allTypes || 'All Types'}</option>
              {['cwsi','humidity','lux','leaf_temp','water_level'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={handleDownloadCSV} className="px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-medium flex items-center gap-1"><Download className="w-3 h-3" /> CSV</button>
            <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium flex items-center gap-1"><Upload className="w-3 h-3" /> {t.setup.uploadCsv || 'Upload'}</button>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleUploadCSV} className="hidden" />
          </div>
          {sensorTableLoading ? <p className={`text-sm text-center py-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.setup.loading}</p> : (
            <div className="overflow-x-auto -mx-5">
              <table className={`w-full text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                <thead><tr className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                  <th className="py-2 px-2 text-left font-semibold">ID</th>
                  <th className="py-2 px-2 text-left font-semibold">Type</th>
                  <th className="py-2 px-2 text-left font-semibold">Plot</th>
                  <th className="py-2 px-2 text-left font-semibold">Value</th>
                  <th className="py-2 px-2 text-left font-semibold">Time</th>
                  <th className="py-2 px-2 text-right font-semibold"></th>
                </tr></thead>
                <tbody>
                  {sensorTableData.map(row => (
                    <tr key={row.id} className={`border-b ${isDark ? 'border-gray-700/50 hover:bg-bg-dark-card-alt' : 'border-gray-100 hover:bg-gray-50'}`}>
                      <td className="py-1.5 px-2">{row.id}</td>
                      <td className="py-1.5 px-2">{row.sensor_type}</td>
                      <td className="py-1.5 px-2">{row.plot_id}</td>
                      <td className="py-1.5 px-2">
                        {editingRow === row.id ? (
                          <input type="number" step="any" value={editValue} onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleEditSensorRow(row.id); if (e.key === 'Escape') setEditingRow(null); }}
                            className={`w-20 px-1 py-0.5 rounded text-xs ${isDark ? 'bg-gray-700 text-white' : 'bg-white border border-gray-300'}`} autoFocus />
                        ) : (
                          <span className="cursor-pointer hover:underline" onClick={() => { setEditingRow(row.id); setEditValue(String(row.value)); }}>{row.value}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap">{row.recorded_at?.slice(0, 16)?.replace('T', ' ')}</td>
                      <td className="py-1.5 px-2 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          {editingRow === row.id ? (
                            <button onClick={() => handleEditSensorRow(row.id)} className="p-1 text-green-500"><Save className="w-3 h-3" /></button>
                          ) : (
                            <button onClick={() => { setEditingRow(row.id); setEditValue(String(row.value)); }} className={`p-1 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}><Edit2 className="w-3 h-3" /></button>
                          )}
                          <button onClick={() => handleDeleteSensorRow(row.id)} className="p-1 text-red-400"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sensorTableData.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-gray-500">{t.setup.noData || 'No data'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {sensorTablePages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{sensorTableTotal} rows · page {sensorTablePage}/{sensorTablePages}</p>
              <div className="flex gap-1">
                <button disabled={sensorTablePage <= 1} onClick={() => fetchSensorTable(sensorTablePage - 1, sensorTableFilter)}
                  className={`p-1.5 rounded-lg ${isDark ? 'bg-bg-dark-card-alt text-gray-400' : 'bg-gray-100 text-gray-600'} disabled:opacity-30`}><ChevronLeft className="w-4 h-4" /></button>
                <button disabled={sensorTablePage >= sensorTablePages} onClick={() => fetchSensorTable(sensorTablePage + 1, sensorTableFilter)}
                  className={`p-1.5 rounded-lg ${isDark ? 'bg-bg-dark-card-alt text-gray-400' : 'bg-gray-100 text-gray-600'} disabled:opacity-30`}><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      ),
    },
    mockMode: {
      title: t.setup.mockModeTitle || 'Mock-up Mode',
      content: (
        <div className="space-y-4">
          <div className={`p-4 rounded-xl ${isDark ? 'bg-bg-dark-card-alt' : 'bg-gray-50'}`}>
            <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              {t.setup.mockModeDesc || 'Enable mock mode to generate realistic random sensor data for testing. Data updates every 10 seconds with gradual changes.'}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.setup.mockModeLabel || 'Mock Data Generation'}</p>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{mockEnabled ? (t.setup.mockActive || 'Generating data every 10s') : (t.setup.mockInactive || 'Disabled')}</p>
            </div>
            <button onClick={toggleMock} disabled={mockLoading}
              className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${mockEnabled ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-primary-green text-white hover:bg-green-600'} disabled:opacity-50`}>
              {mockLoading ? <RefreshCw className="w-4 h-4 animate-spin inline" /> : mockEnabled ? (t.setup.mockStop || 'Stop') : (t.setup.mockStart || 'Start')}
            </button>
          </div>
          {mockEnabled && (
            <div className={`flex items-center gap-2 p-3 rounded-xl ${isDark ? 'bg-green-900/20' : 'bg-green-50'}`}>
              <Activity className={`w-4 h-4 text-green-500 animate-pulse`} />
              <p className={`text-sm font-medium text-green-600`}>{t.setup.mockRunning || 'Mock data is running...'}</p>
            </div>
          )}
        </div>
      ),
    },
  };

  const renderModal = () => {
    if (!activeModal) return null;
    const modal = modalContent[activeModal];
    if (!modal) return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={closeModal}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div className={`relative w-full ${(activeModal === 'sensorTable' || activeModal === 'mqttConfig') ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[85vh] sm:mb-0 rounded-t-3xl sm:rounded-3xl overflow-hidden ${isDark ? 'bg-bg-dark-card' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
          <div className={`sticky top-0 z-10 flex items-center justify-between p-5 border-b ${isDark ? 'border-gray-700 bg-bg-dark-card' : 'border-gray-200 bg-white'}`}>
            <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{modal.title}</h3>
            <button onClick={closeModal} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? 'hover:bg-bg-dark-card-alt' : 'hover:bg-gray-100'}`}><X className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} /></button>
          </div>
          <div className="p-5 pb-8 overflow-y-auto max-h-[70vh]">{modal.content}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Profile Hero */}
      <div className="relative rounded-3xl overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('/andrographis-bg.jpg')` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />
        <div className="relative px-6 pt-6 pb-6">

          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-green-600/40 border-4 border-green-400/30 flex items-center justify-center"><User className="w-10 h-10 text-green-200" /></div>
            <h2 className="text-xl font-bold text-white">{user?.username || 'Smart Farmer'}</h2>
            <p className="text-green-200/70 text-sm">{user?.email || 'farmer@smartfarm.com'}</p>
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="inline-flex items-center rounded-full bg-white/15 backdrop-blur-sm overflow-hidden">
                {editStats ? (
                  <>
                    <div className="px-3 py-2 text-center border-r border-white/10">
                      <input type="number" value={statsForm.days} onChange={e => setStatsForm({ ...statsForm, days: parseInt(e.target.value) || 0 })} className="w-12 bg-transparent text-center text-lg font-bold text-white outline-none" />
                      <p className="text-[10px] text-green-200/70 mt-0.5">{t.setup.days}</p>
                    </div>
                    <div className="px-3 py-2 text-center border-r border-white/10">
                      <input type="number" value={statsForm.plots} onChange={e => setStatsForm({ ...statsForm, plots: parseInt(e.target.value) || 0 })} className="w-12 bg-transparent text-center text-lg font-bold text-white outline-none" />
                      <p className="text-[10px] text-green-200/70 mt-0.5">{t.setup.plots}</p>
                    </div>
                    <div className="px-3 py-2 text-center">
                      <input type="number" value={statsForm.health} onChange={e => setStatsForm({ ...statsForm, health: parseInt(e.target.value) || 0 })} className="w-12 bg-transparent text-center text-lg font-bold text-white outline-none" />
                      <p className="text-[10px] text-green-200/70 mt-0.5">{t.setup.health}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-5 py-2.5 text-center border-r border-white/10"><p className="text-lg font-bold text-white leading-none">{stats.days}</p><p className="text-[10px] text-green-200/70 mt-0.5">{t.setup.days}</p></div>
                    <div className="px-5 py-2.5 text-center border-r border-white/10"><p className="text-lg font-bold text-white leading-none">{stats.plots}</p><p className="text-[10px] text-green-200/70 mt-0.5">{t.setup.plots}</p></div>
                    <div className="px-5 py-2.5 text-center"><p className="text-lg font-bold text-white leading-none">{stats.health}%</p><p className="text-[10px] text-green-200/70 mt-0.5">{t.setup.health}</p></div>
                  </>
                )}
              </div>
              {editStats ? (
                <div className="flex gap-2">
                  <button onClick={saveStats} className="px-4 py-1.5 rounded-full bg-green-500 text-white text-xs font-semibold"><Save className="w-3 h-3 inline mr-1" />{t.setup.saveStats || 'Save'}</button>
                  <button onClick={() => setEditStats(false)} className="px-4 py-1.5 rounded-full bg-white/20 text-white text-xs font-semibold">{t.setup.cancelEdit || 'Cancel'}</button>
                </div>
              ) : (
                <button onClick={() => { setStatsForm({ ...stats }); setEditStats(true); }} className="px-3 py-1 rounded-full bg-white/10 text-white/60 text-[10px] hover:bg-white/20 transition-all flex items-center gap-1"><Pencil className="w-2.5 h-2.5" /> {t.setup.editStats || 'Edit Stats'}</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* My Account */}
      <div>
        <SectionTitle icon="👤" title={t.setup.myAccount} />
        <div className={`rounded-2xl overflow-hidden divide-y ${isDark ? 'bg-bg-dark-card card-shadow-dark divide-gray-700/50' : 'bg-white card-shadow divide-gray-100'}`}>
          <MenuItem icon={User} label={t.setup.profile} desc={t.setup.profileDesc} color="bg-green-100 text-green-600" darkColor="bg-green-900/40 text-green-400" onClick={() => setActiveModal('profile')} />
          <MenuItem icon={Bell} label={t.setup.notifications} desc={t.setup.notificationsDesc} color="bg-yellow-100 text-yellow-600" darkColor="bg-yellow-900/40 text-yellow-400" onClick={() => { fetchNotifSettings(); setActiveModal('notifications'); }} />
          <MenuItem icon={Shield} label={t.setup.privacy} desc={t.setup.privacyDesc} color="bg-blue-100 text-blue-600" darkColor="bg-blue-900/40 text-blue-400" onClick={() => setActiveModal('privacy')} />
          <MenuItem icon={Key} label={t.setup.securityMenu} desc={t.setup.securityMenuDesc} color="bg-red-100 text-red-600" darkColor="bg-red-900/40 text-red-400" onClick={() => navigate('/security')} />
        </div>
      </div>

      {/* Settings */}
      <div>
        <SectionTitle icon="⚙️" title={t.setup.settings} />
        <div className={`rounded-2xl overflow-hidden divide-y ${isDark ? 'bg-bg-dark-card card-shadow-dark divide-gray-700/50' : 'bg-white card-shadow divide-gray-100'}`}>
          <MenuItem icon={Globe} label={t.setup.language} desc={t.setup.languageDesc} color="bg-purple-100 text-purple-600" darkColor="bg-purple-900/40 text-purple-400" onClick={() => setActiveModal('language')} />
          <MenuItem icon={Wifi} label={t.setup.mqttConfig || 'MQTT Configuration'} desc={t.setup.mqttConfigDesc || 'Broker, topics & sensor management'} color="bg-cyan-100 text-cyan-600" darkColor="bg-cyan-900/40 text-cyan-400" onClick={() => { fetchMqttConfig(); setActiveModal('mqttConfig'); }} />
          <MenuItem icon={Link2} label={t.setup.domainConfig || 'Domain Config'} desc={t.setup.domainConfigDesc || 'Custom domain & API URL'} color="bg-violet-100 text-violet-600" darkColor="bg-violet-900/40 text-violet-400" onClick={() => { fetchDomainConfig(); setActiveModal('domainConfig'); }} />
          <MenuItem icon={Download} label={t.setup.downloadData} desc={t.setup.downloadDataDesc} color="bg-teal-100 text-teal-600" darkColor="bg-teal-900/40 text-teal-400" onClick={handleDownloadData} />
          <MenuItem icon={Cpu} label={t.setup.systemHealth} desc={t.setup.systemHealthDesc} color="bg-indigo-100 text-indigo-600" darkColor="bg-indigo-900/40 text-indigo-400" onClick={() => { fetchSystemHealth(); setActiveModal('systemHealth'); }} />
          <MenuItem icon={Activity} label={t.setup.mockModeTitle || 'Mock-up Mode'} desc={t.setup.mockModeMenuDesc || 'Generate test sensor data'} color="bg-pink-100 text-pink-600" darkColor="bg-pink-900/40 text-pink-400" onClick={() => { fetchMockStatus(); setActiveModal('mockMode'); }} />
        </div>
      </div>

      {/* Data & Statistics */}
      <div>
        <SectionTitle icon="📊" title={t.setup.dataStats} />
        <div className={`rounded-2xl overflow-hidden divide-y ${isDark ? 'bg-bg-dark-card card-shadow-dark divide-gray-700/50' : 'bg-white card-shadow divide-gray-100'}`}>
          <MenuItem icon={Database} label={t.setup.viewData} desc={t.setup.viewDataDesc} color="bg-emerald-100 text-emerald-600" darkColor="bg-emerald-900/40 text-emerald-400" onClick={() => setActiveModal('data')} />
          <MenuItem icon={Table} label={t.setup.sensorTableTitle || 'Sensor Data Table'} desc={t.setup.sensorTableDesc || 'View, edit, download & upload sensor data'} color="bg-lime-100 text-lime-600" darkColor="bg-lime-900/40 text-lime-400" onClick={() => { fetchSensorTable(1, ''); setActiveModal('sensorTable'); }} />
          <MenuItem icon={BarChart3} label={t.setup.reports} desc={t.setup.reportsDesc} color="bg-orange-100 text-orange-600" darkColor="bg-orange-900/40 text-orange-400" onClick={() => { fetchReports(reportPeriod); setActiveModal('reports'); }} />
        </div>
      </div>

      {/* Help */}
      <div>
        <SectionTitle icon="❓" title={t.setup.help} />
        <div className={`rounded-2xl overflow-hidden divide-y ${isDark ? 'bg-bg-dark-card card-shadow-dark divide-gray-700/50' : 'bg-white card-shadow divide-gray-100'}`}>
          <MenuItem icon={HelpCircle} label={t.setup.faq} desc={t.setup.faqDesc} color="bg-sky-100 text-sky-600" darkColor="bg-sky-900/40 text-sky-400" onClick={() => setActiveModal('faq')} />
          <MenuItem icon={Phone} label={t.setup.contactUs} desc={t.setup.contactUsDesc} color="bg-green-100 text-green-600" darkColor="bg-green-900/40 text-green-400" onClick={() => setActiveModal('contact')} />
          <MenuItem icon={Info} label={t.setup.about} desc={t.setup.aboutDesc} color="bg-cyan-100 text-cyan-600" darkColor="bg-cyan-900/40 text-cyan-400" onClick={() => setActiveModal('about')} />
        </div>
      </div>

      {/* Logout */}
      <button onClick={logout} className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold transition-all ${isDark ? 'bg-red-900/20 text-red-400 hover:bg-red-900/30' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}><LogOut className="w-5 h-5" />{t.setup.logoutBtn}</button>
      <div className="text-center pb-4 space-y-0.5">
        <p className={`text-xs font-semibold ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Andrographis Smart Farm v3.0.0</p>
        <p className={`text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Built by COE AI WU</p>
      </div>

      {renderModal()}
    </div>
  );
}
