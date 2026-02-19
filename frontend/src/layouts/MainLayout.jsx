import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Leaf, Sliders, BarChart3, Settings, Sun, Moon, LogOut, Bell, X, Check, CheckCheck, Trash2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function MainLayout() {
  const { isDark, toggleTheme } = useTheme();
  const { logout, user, authHeaders } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  // ─── Notifications state ────────────────────────────────
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const panelRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const [notifRes, countRes] = await Promise.all([
        fetch('/api/notifications', { headers: authHeaders() }),
        fetch('/api/notifications/unread-count', { headers: authHeaders() }),
      ]);
      if (notifRes.ok) setNotifications(await notifRes.json());
      if (countRes.ok) {
        const data = await countRes.json();
        setUnreadCount(data.count);
      }
    } catch (e) {}
  }, []);

  // Initial fetch + polling every 30s
  useEffect(() => {
    fetchNotifications();
    const iv = setInterval(fetchNotifications, 30000);
    return () => clearInterval(iv);
  }, [fetchNotifications]);

  // Listen for WebSocket notification pushes
  useEffect(() => {
    let ws;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/ws/sensors`);
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'notification' && msg.data) {
            setNotifications(prev => [msg.data, ...prev].slice(0, 100));
            setUnreadCount(prev => prev + 1);
          }
        } catch {}
      };
    } catch {}
    return () => { if (ws) ws.close(); };
  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowNotifPanel(false);
      }
    };
    if (showNotifPanel) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotifPanel]);

  const markRead = async (id) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST', headers: authHeaders() });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'POST', headers: authHeaders() });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch {}
  };

  const deleteNotif = async (id) => {
    try {
      await fetch(`/api/notifications/${id}`, { method: 'DELETE', headers: authHeaders() });
      const wasUnread = notifications.find(n => n.id === id && !n.is_read);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const clearAll = async () => {
    try {
      await fetch('/api/notifications/clear', { method: 'DELETE', headers: authHeaders() });
      setNotifications([]);
      setUnreadCount(0);
    } catch {}
  };

  const severityColor = (sev) => {
    if (sev === 'danger') return isDark ? 'text-red-400' : 'text-red-600';
    if (sev === 'warning') return isDark ? 'text-amber-400' : 'text-amber-600';
    return isDark ? 'text-blue-400' : 'text-blue-600';
  };

  const severityBg = (sev) => {
    if (sev === 'danger') return isDark ? 'bg-red-900/20' : 'bg-red-50';
    if (sev === 'warning') return isDark ? 'bg-amber-900/20' : 'bg-amber-50';
    return isDark ? 'bg-blue-900/20' : 'bg-blue-50';
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'เมื่อสักครู่';
    if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
    return `${Math.floor(diff / 86400)} วันที่แล้ว`;
  };

  // ─── Notification panel component ────────────────────────
  const NotificationPanel = ({ fixed }) => (
    <div ref={panelRef} className={`${fixed ? 'fixed top-16 right-6' : 'absolute right-0 top-full mt-2'} w-80 sm:w-96 max-h-[70vh] rounded-2xl shadow-2xl overflow-hidden z-[70] ${isDark ? 'bg-bg-dark-card border border-gray-700' : 'bg-white border border-gray-200'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          🔔 การแจ้งเตือน {unreadCount > 0 && <span className="ml-1 text-xs text-primary-green">({unreadCount} ใหม่)</span>}
        </h3>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button onClick={markAllRead} title="อ่านทั้งหมด" className={`p-1.5 rounded-lg transition-all ${isDark ? 'hover:bg-bg-dark-card-alt text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
              <CheckCheck className="w-4 h-4" />
            </button>
          )}
          {notifications.length > 0 && (
            <button onClick={clearAll} title="ลบทั้งหมด" className={`p-1.5 rounded-lg transition-all ${isDark ? 'hover:bg-bg-dark-card-alt text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setShowNotifPanel(false)} className={`p-1.5 rounded-lg transition-all ${isDark ? 'hover:bg-bg-dark-card-alt text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="overflow-y-auto max-h-[55vh]">
        {notifications.length === 0 ? (
          <div className="py-12 text-center">
            <Bell className={`w-10 h-10 mx-auto mb-2 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
            <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>ไม่มีการแจ้งเตือน</p>
          </div>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              className={`flex gap-3 px-4 py-3 border-b last:border-b-0 transition-all ${isDark ? 'border-gray-700/50' : 'border-gray-100'} ${!n.is_read ? severityBg(n.severity) : isDark ? 'hover:bg-bg-dark-card-alt' : 'hover:bg-gray-50'}`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-snug ${!n.is_read ? (isDark ? 'text-white' : 'text-gray-900') : (isDark ? 'text-gray-400' : 'text-gray-500')}`}>
                  {n.title}
                </p>
                <p className={`text-xs mt-0.5 leading-relaxed ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  {n.message}
                </p>
                <p className={`text-[10px] mt-1 ${severityColor(n.severity)}`}>
                  {timeAgo(n.created_at)}
                </p>
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                {!n.is_read && (
                  <button onClick={() => markRead(n.id)} className={`p-1 rounded-lg ${isDark ? 'hover:bg-bg-dark-card-alt text-green-400' : 'hover:bg-gray-100 text-green-600'}`}>
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => deleteNotif(n.id)} className={`p-1 rounded-lg ${isDark ? 'hover:bg-bg-dark-card-alt text-red-400' : 'hover:bg-gray-100 text-red-500'}`}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const navItems = [
    { to: '/dashboard', icon: Leaf, label: t.nav.hydroponic },
    { to: '/control', icon: Sliders, label: t.nav.control },
    { to: '/cwsi', icon: BarChart3, label: t.nav.cwsiData },
    { to: '/setup', icon: Settings, label: t.nav.setup },
  ];

  return (
    <div className={`min-h-screen flex flex-col lg:flex-row ${isDark ? 'bg-bg-dark text-white' : 'bg-bg-light text-gray-900'}`}>
      {/* Sidebar - Desktop only */}
      <aside className={`hidden lg:flex flex-col w-64 fixed h-full z-30 ${isDark ? 'bg-bg-dark-card border-r border-gray-700' : 'bg-white border-r border-gray-200'} card-shadow`}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-green flex items-center justify-center">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Andrographis</h1>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Smart Farm</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? isDark
                      ? 'bg-primary-green text-white'
                      : 'bg-primary-green text-white'
                    : isDark
                    ? 'text-gray-400 hover:bg-bg-dark-card-alt hover:text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
          <p className={`px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Andrographis Smart Farm</p>
          <p className={`px-2 text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Built by COE AI WU</p>
          <button
            onClick={logout}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all text-red-500 hover:bg-red-50 ${isDark ? 'hover:bg-red-900/20' : ''}`}
          >
            <LogOut className="w-5 h-5" />
            {t.nav.logout}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 lg:ml-64 pb-20 lg:pb-6">
        {/* Desktop top-right toolbar: bell + theme toggle */}
        <div className="hidden lg:flex justify-end items-center gap-2 px-6 pt-4">
          <div className="relative" ref={panelRef}>
            <button
              onClick={() => setShowNotifPanel(!showNotifPanel)}
              className={`relative p-2.5 rounded-xl transition-all ${isDark ? 'bg-bg-dark-card text-gray-400 hover:text-white hover:bg-bg-dark-card-alt' : 'bg-white text-gray-500 hover:text-gray-900 hover:bg-gray-100'} card-shadow`}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            {showNotifPanel && <NotificationPanel fixed />}
          </div>
          <button
            onClick={toggleTheme}
            className={`p-2.5 rounded-xl transition-all ${isDark ? 'bg-bg-dark-card text-gray-400 hover:text-white hover:bg-bg-dark-card-alt' : 'bg-white text-gray-500 hover:text-gray-900 hover:bg-gray-100'} card-shadow`}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
        {/* Mobile notification bell + theme toggle */}
        <div className="lg:hidden flex justify-end items-center gap-2 px-4 pt-3">
          <div className="relative" ref={panelRef}>
            <button
              onClick={() => setShowNotifPanel(!showNotifPanel)}
              className={`relative p-2 rounded-xl transition-all ${isDark ? 'bg-bg-dark-card text-gray-400 hover:text-white' : 'bg-white text-gray-500 hover:text-gray-900'} card-shadow`}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            {showNotifPanel && <NotificationPanel />}
          </div>
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-xl transition-all ${isDark ? 'bg-bg-dark-card text-gray-400 hover:text-white' : 'bg-white text-gray-500 hover:text-gray-900'} card-shadow`}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
        <div className="max-w-6xl mx-auto p-4 lg:p-6">
          <Outlet />
        </div>
      </main>

      {/* Bottom Navigation - Mobile only */}
      <nav className={`fixed bottom-0 left-0 right-0 z-50 lg:hidden ${isDark ? 'bg-bg-dark-card border-t border-gray-700' : 'bg-white border-t border-gray-200'} card-shadow`}>
        <div className="flex justify-around items-center h-16 px-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1 px-3 rounded-lg text-xs font-medium transition-all duration-200 min-w-[60px] ${
                  isActive
                    ? 'text-primary-green'
                    : isDark
                    ? 'text-gray-500'
                    : 'text-gray-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`p-1 rounded-lg ${isActive ? (isDark ? 'bg-primary-green/20' : 'bg-primary-green/10') : ''}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="mt-0.5">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
