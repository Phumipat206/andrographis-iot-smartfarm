import { useState, useEffect } from 'react';
import {
  Shield, Key, Activity, Monitor, LogOut, Loader2,
  Eye, EyeOff, CheckCircle2, XCircle, AlertTriangle,
  Users, Trash2, Edit2, UserPlus, Search
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiUrl } from '../config.js';

export default function SecurityPage() {
  const { isDark } = useTheme();
  const { authHeaders, logout, user } = useAuth();
  const { t } = useLanguage();

  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [pwLoading, setPwLoading] = useState(false);

  const [activity, setActivity] = useState([]);
  const [actLoading, setActLoading] = useState(true);

  // User management (admin)
  const [userList, setUserList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);
  const [allActivity, setAllActivity] = useState([]);
  const [allActLoading, setAllActLoading] = useState(false);
  const [searchUser, setSearchUser] = useState('');
  const [pendingUsers, setPendingUsers] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  const isAdmin = user?.user_type === 'admin' || user?.role === 'admin';

  useEffect(() => {
    fetchActivity();
    if (isAdmin) { fetchUsers(); fetchAllActivity(); fetchPendingUsers(); }
  }, []);

  const fetchActivity = async () => {
    try {
      const res = await fetch(apiUrl('/api/security/login-activity'), { headers: authHeaders() });
      if (res.ok) setActivity(await res.json());
    } catch (e) {}
    setActLoading(false);
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await fetch(apiUrl('/api/users'), { headers: authHeaders() });
      if (res.ok) {
        setUserList(await res.json());
      } else {
        const errText = res.status === 401 ? 'Session expired — please login again' : res.status === 403 ? 'Admin access required' : `Error ${res.status}`;
        setUsersError(errText);
      }
    } catch (e) {
      setUsersError('Network error — cannot reach server');
    }
    setUsersLoading(false);
  };

  const fetchAllActivity = async () => {
    setAllActLoading(true);
    try {
      const res = await fetch(apiUrl('/api/security/all-activity'), { headers: authHeaders() });
      if (res.ok) setAllActivity(await res.json());
    } catch (e) {}
    setAllActLoading(false);
  };

  const fetchPendingUsers = async () => {
    setPendingLoading(true);
    try {
      const res = await fetch(apiUrl('/api/users/pending'), { headers: authHeaders() });
      if (res.ok) setPendingUsers(await res.json());
    } catch (e) {}
    setPendingLoading(false);
  };

  const approveUser = async (id) => {
    try {
      await fetch(apiUrl(`/api/users/${id}/approve`), { method: 'POST', headers: authHeaders() });
      fetchPendingUsers();
      fetchUsers();
    } catch (e) {}
  };

  const rejectUser = async (id) => {
    if (!confirm(t.security.rejectConfirm || 'Reject and delete this user?')) return;
    try {
      await fetch(apiUrl(`/api/users/${id}/reject`), { method: 'POST', headers: authHeaders() });
      fetchPendingUsers();
    } catch (e) {}
  };

  const updateUserRole = async (userId, role) => {
    try {
      await fetch(apiUrl(`/api/users/${userId}`), { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ role }) });
      fetchUsers();
    } catch (e) {}
  };

  const deleteUser = async (userId) => {
    if (!confirm(t.security.deleteUserConfirm || 'Delete this user?')) return;
    try {
      await fetch(apiUrl(`/api/users/${userId}`), { method: 'DELETE', headers: authHeaders() });
      fetchUsers();
    } catch (e) {}
  };

  const handleChangePassword = async () => {
    if (pwForm.new_password !== pwForm.confirm) { setPwMsg({ type: 'error', text: t.security.passwordMismatch }); return; }
    if (pwForm.new_password.length < 6) { setPwMsg({ type: 'error', text: t.security.passwordTooShort }); return; }
    setPwLoading(true); setPwMsg(null);
    try {
      const res = await fetch(apiUrl('/api/auth/change-password'), { method: 'POST', headers: authHeaders(), body: JSON.stringify({ current_password: pwForm.current_password, new_password: pwForm.new_password }) });
      if (res.ok) { setPwMsg({ type: 'success', text: t.security.changeSuccess }); setPwForm({ current_password: '', new_password: '', confirm: '' }); }
      else { let errMsg = t.security.changeFail; try { const data = await res.json(); errMsg = data.detail || errMsg; } catch {} setPwMsg({ type: 'error', text: errMsg }); }
    } catch (e) { setPwMsg({ type: 'error', text: t.security.connectFail }); }
    setPwLoading(false);
  };

  const handleLogoutAll = async () => {
    if (!confirm(t.security.logoutAllConfirm)) return;
    try { await fetch(apiUrl('/api/security/logout-all'), { method: 'POST', headers: authHeaders() }); logout(); } catch (e) {}
  };

  const formatDate = (iso) => { try { return new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; } };
  const getBrowserInfo = (ua) => { if (!ua) return 'Unknown'; if (ua.includes('Chrome')) return 'Chrome'; if (ua.includes('Firefox')) return 'Firefox'; if (ua.includes('Safari')) return 'Safari'; if (ua.includes('Edge')) return 'Edge'; return ua.slice(0, 30); };

  const inputCls = `w-full px-4 py-2.5 rounded-xl text-sm ${isDark ? 'bg-bg-dark-card-alt text-white border-gray-600' : 'bg-gray-50 text-gray-900 border-gray-200'} border focus:outline-none focus:ring-2 focus:ring-red-500`;

  const filteredUsers = userList.filter(u => u.username.toLowerCase().includes(searchUser.toLowerCase()));

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="relative rounded-3xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-red-900 via-rose-800 to-pink-700" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-red-600/20 blur-2xl" />
        <div className="absolute -bottom-5 -left-10 w-32 h-32 rounded-full bg-pink-500/20 blur-2xl" />
        <div className="relative px-6 pt-5 pb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm text-red-200 text-xs font-medium"><Shield className="w-3.5 h-3.5" />SECURITY</div>
          </div>
          <h1 className="text-2xl font-bold text-white">{t.security.title}</h1>
          <p className="text-red-200/80 text-sm mt-1 tracking-wide">{t.security.subtitle}</p>
        </div>
      </div>

      {/* Change Password */}
      <div>
        <div className="flex items-center gap-2 mb-1"><Key className={`w-5 h-5 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} /><h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.security.changePassword}</h2></div>
        <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.security.changePasswordDesc}</p>
        <div className={`p-5 rounded-2xl space-y-4 ${isDark ? 'bg-bg-dark-card card-shadow-dark' : 'bg-white card-shadow'}`}>
          <div className="relative"><label className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{t.security.currentPassword}</label>
            <div className="relative mt-1"><input type={showCurrent ? 'text' : 'password'} value={pwForm.current_password} onChange={e => setPwForm({ ...pwForm, current_password: e.target.value })} className={`${inputCls} pr-10`} />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </div></div>
          <div className="relative"><label className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{t.security.newPassword}</label>
            <div className="relative mt-1"><input type={showNew ? 'text' : 'password'} value={pwForm.new_password} onChange={e => setPwForm({ ...pwForm, new_password: e.target.value })} className={`${inputCls} pr-10`} />
              <button type="button" onClick={() => setShowNew(!showNew)} className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </div></div>
          <div><label className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{t.security.confirmNewPassword}</label>
            <input type="password" value={pwForm.confirm} onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })} className={`${inputCls} mt-1`} /></div>
          {pwMsg && (<div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${pwMsg.type === 'success' ? isDark ? 'bg-green-900/20 text-green-400' : 'bg-green-50 text-green-600' : isDark ? 'bg-red-900/20 text-red-400' : 'bg-red-50 text-red-600'}`}>{pwMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{pwMsg.text}</div>)}
          <button onClick={handleChangePassword} disabled={pwLoading || !pwForm.current_password || !pwForm.new_password || !pwForm.confirm} className="w-full py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2">{pwLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}{t.security.changeBtn}</button>
        </div>
      </div>

      {/* Pending User Approvals (Admin only) */}
      {isAdmin && pendingUsers.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1"><UserPlus className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} /><h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.security.pendingApproval || 'Pending Approvals'}</h2></div>
          <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.security.pendingApprovalDesc || 'New user registrations waiting for admin approval'}</p>
          <div className={`rounded-2xl overflow-hidden ${isDark ? 'bg-bg-dark-card card-shadow-dark' : 'bg-white card-shadow'}`}>
            <div className={`divide-y ${isDark ? 'divide-gray-700/50' : 'divide-gray-100'}`}>
              {pendingUsers.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-amber-900/30' : 'bg-amber-100'}`}>
                    <UserPlus className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{u.username}</p>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{u.user_type} · {formatDate(u.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => approveUser(u.id)} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700">{t.security.approve || 'Approve'}</button>
                    <button onClick={() => rejectUser(u.id)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700">{t.security.reject || 'Reject'}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* User Management (Admin only) */}
      {isAdmin && (
        <div>
          <div className="flex items-center gap-2 mb-1"><Users className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} /><h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.security.userManagement || 'User Management'}</h2></div>
          <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.security.userManagementDesc || 'Manage users, roles, and permissions'}</p>

          <div className={`rounded-2xl overflow-hidden ${isDark ? 'bg-bg-dark-card card-shadow-dark' : 'bg-white card-shadow'}`}>
            <div className={`p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
              <div className="relative">
                <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                <input type="text" placeholder={t.security.searchUsers || 'Search users...'} value={searchUser} onChange={e => setSearchUser(e.target.value)} className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm ${isDark ? 'bg-bg-dark-card-alt text-white border-gray-600' : 'bg-gray-50 text-gray-900 border-gray-200'} border focus:outline-none focus:ring-2 focus:ring-purple-500`} />
              </div>
            </div>
            {usersLoading ? (<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>) : usersError ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <AlertTriangle className={`w-6 h-6 ${isDark ? 'text-red-400' : 'text-red-500'}`} />
                <p className={`text-sm ${isDark ? 'text-red-400' : 'text-red-500'}`}>{usersError}</p>
                <button onClick={fetchUsers} className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 transition-all">Retry</button>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8">
                <Users className={`w-6 h-6 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
                <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{searchUser ? 'No users match your search' : 'No users found'}</p>
              </div>
            ) : (
              <div className={`divide-y ${isDark ? 'divide-gray-700/50' : 'divide-gray-100'}`}>
                {filteredUsers.map(u => (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${u.user_type === 'admin' ? isDark ? 'bg-purple-900/30' : 'bg-purple-100' : isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <Users className={`w-5 h-5 ${u.user_type === 'admin' ? isDark ? 'text-purple-400' : 'text-purple-500' : isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{u.username}</p>
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{u.user_type} · {u.role || 'viewer'} {u.approved === 0 ? '· ⏳ Pending' : ''} · {formatDate(u.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select value={u.role || 'viewer'} onChange={e => updateUserRole(u.id, e.target.value)} className={`text-xs px-2 py-1.5 rounded-lg ${isDark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white border-gray-200 text-gray-700'} border`}>
                        <option value="admin">Admin</option>
                        <option value="operator">Operator</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      {u.username !== user?.username && (<button onClick={() => deleteUser(u.id)} className={`p-1.5 rounded-lg text-red-400 ${isDark ? 'hover:bg-red-900/20' : 'hover:bg-red-50'}`}><Trash2 className="w-4 h-4" /></button>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* My Login Activity */}
      <div>
        <div className="flex items-center gap-2 mb-1"><Activity className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} /><h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.security.loginHistory}</h2></div>
        <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.security.loginHistoryDesc}</p>
        <div className={`rounded-2xl overflow-hidden ${isDark ? 'bg-bg-dark-card card-shadow-dark' : 'bg-white card-shadow'}`}>
          {actLoading ? (<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>)
            : activity.length === 0 ? (<div className="p-6 text-center"><p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.security.noHistory}</p></div>)
            : (<div className={`divide-y ${isDark ? 'divide-gray-700/50' : 'divide-gray-100'}`}>
                {activity.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${item.status === 'success' ? isDark ? 'bg-green-900/30' : 'bg-green-100' : isDark ? 'bg-red-900/30' : 'bg-red-100'}`}>
                      {item.status === 'success' ? <CheckCircle2 className={`w-4 h-4 ${isDark ? 'text-green-400' : 'text-green-500'}`} /> : <XCircle className={`w-4 h-4 ${isDark ? 'text-red-400' : 'text-red-500'}`} />}
                    </div>
                    <div className="flex-1 min-w-0"><p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{item.action === 'login' ? t.security.loginSuccess : t.security.loginFailed}</p><p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.ip_address} · {getBrowserInfo(item.user_agent)}</p></div>
                    <p className={`text-xs flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{formatDate(item.created_at)}</p>
                  </div>
                ))}
              </div>)}
        </div>
      </div>

      {/* All Users Activity (Admin only) */}
      {isAdmin && allActivity.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1"><Activity className={`w-5 h-5 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} /><h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.security.allActivity || 'All Users Activity'}</h2></div>
          <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.security.allActivityDesc || 'Recent login activity across all users'}</p>
          <div className={`rounded-2xl overflow-hidden ${isDark ? 'bg-bg-dark-card card-shadow-dark' : 'bg-white card-shadow'}`}>
            <div className={`divide-y ${isDark ? 'divide-gray-700/50' : 'divide-gray-100'}`}>
              {allActivity.slice(0, 30).map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${item.status === 'success' ? isDark ? 'bg-green-900/30' : 'bg-green-100' : isDark ? 'bg-red-900/30' : 'bg-red-100'}`}>
                    {item.status === 'success' ? <CheckCircle2 className={`w-4 h-4 ${isDark ? 'text-green-400' : 'text-green-500'}`} /> : <XCircle className={`w-4 h-4 ${isDark ? 'text-red-400' : 'text-red-500'}`} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}><span className="font-bold">{item.username}</span> — {item.action}</p>
                    <p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.ip_address} · {getBrowserInfo(item.user_agent)}</p>
                  </div>
                  <p className={`text-xs flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{formatDate(item.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Session Management */}
      <div>
        <div className="flex items-center gap-2 mb-1"><Monitor className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} /><h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.security.sessionTitle}</h2></div>
        <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.security.sessionDesc}</p>
        <div className={`p-5 rounded-2xl ${isDark ? 'bg-bg-dark-card card-shadow-dark' : 'bg-white card-shadow'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-red-900/30' : 'bg-red-100'}`}><LogOut className={`w-5 h-5 ${isDark ? 'text-red-400' : 'text-red-500'}`} /></div>
              <div><p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.security.logoutAll}</p><p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.security.logoutAllDesc}</p></div>
            </div>
            <button onClick={handleLogoutAll} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-all">Logout All</button>
          </div>
        </div>
      </div>
    </div>
  );
}
