import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, Facebook, Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password, remember);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || t.login.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=1200&q=80')`,
        }}
      />
      <div className="absolute inset-0 bg-black/30" />

      {/* Back button */}
      <div className="relative z-10 p-4">
        <button
          onClick={() => navigate('/')}
          className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Header */}
      <div className="relative z-10 px-8 pt-2 pb-8">
        <h1 className="text-white text-3xl lg:text-4xl font-bold">Andrographis</h1>
        <p className="text-white/80 text-lg font-light">Smart farm</p>
      </div>

      {/* Login Card */}
      <div className="relative z-10 flex-1 flex items-start justify-center px-4 lg:px-0">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 card-shadow">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{t.login.title}</h2>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                placeholder={t.login.username}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-green focus:border-transparent transition-all"
                required
              />
            </div>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={t.login.password}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-green focus:border-transparent transition-all pr-12"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="remember"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary-green focus:ring-primary-green"
              />
              <label htmlFor="remember" className="text-sm text-gray-600">
                {t.login.rememberMe}
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-full bg-primary-green text-white text-base font-semibold hover:bg-primary-green-light transition-all duration-300 disabled:opacity-50 active:scale-95"
            >
              {loading ? t.login.loggingIn : t.login.loginBtn}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => alert(t.login.forgotAlert)}
                className="text-primary-green text-sm underline hover:text-primary-green-light"
              >
                {t.login.forgotPassword}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 p-6 text-white/70 text-sm space-y-1">
        <div className="flex items-center gap-2">
          <Facebook className="w-4 h-4" />
          <span>: Andrographis Smart farm</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4" />
          <span>: 093-5899990</span>
        </div>
      </div>
    </div>
  );
}
