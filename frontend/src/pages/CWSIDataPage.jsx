import { useState, useRef } from 'react';
import {
  BarChart3, Cloud, FileSpreadsheet, Upload, Download,
  HelpCircle, AlertCircle, CheckCircle2, Loader2,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiUrl } from '../config.js';

export default function CWSIDataPage() {
  const { isDark } = useTheme();
  const { authHeaders } = useAuth();
  const { t } = useLanguage();

  const [selectedSource, setSelectedSource] = useState('api');
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const fileInput = useRef(null);

  const loadFromAPI = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/sensors/cwsi-history?period=today'), { headers: authHeaders() });
      if (res.status === 401) { setError(t.cwsi.loginAgain); return; }
      if (!res.ok) { setError(t.cwsi.loadFail); return; }
      const data = await res.json();
      setChartData(data.history || []);
      setSummary(data.summary || null);
    } catch {
      setError(t.cwsi.connectFail);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result;
        if (!text) { setError(t.cwsi.emptyFile); setLoading(false); return; }
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) { setError(t.cwsi.noFileData); setLoading(false); return; }
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const timeIdx = headers.findIndex(h => h.includes('time') || h.includes('date') || h.includes('recorded'));
        const p1Idx = headers.findIndex(h => h.includes('plot1') || h.includes('cwsi1') || h.includes('plot_1'));
        const p2Idx = headers.findIndex(h => h.includes('plot2') || h.includes('cwsi2') || h.includes('plot_2'));
        const valIdx = headers.findIndex(h => h.includes('value') || h.includes('cwsi'));
        const plotIdx = headers.findIndex(h => h.includes('plot'));

        const parsed = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          const time = timeIdx >= 0 ? cols[timeIdx]?.slice(-5) || `#${i}` : `#${i}`;
          if (p1Idx >= 0 || p2Idx >= 0) {
            parsed.push({
              time,
              plot1: p1Idx >= 0 ? parseFloat(cols[p1Idx]) || 0 : undefined,
              plot2: p2Idx >= 0 ? parseFloat(cols[p2Idx]) || 0 : undefined,
            });
          } else if (valIdx >= 0) {
            const val = parseFloat(cols[valIdx]) || 0;
            const plot = plotIdx >= 0 ? cols[plotIdx] : '1';
            const existing = parsed.find(p => p.time === time);
            if (existing) {
              existing[`plot${plot}`] = val;
            } else {
              parsed.push({ time, [`plot${plot}`]: val });
            }
          }
        }
        setChartData(parsed);
        setSummary(null);
      } catch {
        setError(t.cwsi.fileReadFail);
      }
      setLoading(false);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const card = `rounded-2xl p-5 ${isDark ? 'bg-gray-800/80 border border-gray-700' : 'bg-white/90 border border-gray-200'} shadow-lg backdrop-blur-sm`;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden">
        <img src="/andrographis-bg.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-teal-900/85 to-emerald-800/75" />
        <div className="relative p-6 text-white">
          <span className="text-xs font-bold tracking-widest bg-white/20 px-3 py-1 rounded-full">{t.cwsi.badge}</span>
          <h1 className="text-2xl font-bold mt-3">{t.cwsi.title}</h1>
          <p className="text-sm text-white/80 mt-1">{t.cwsi.subtitle}</p>
        </div>
      </div>

      {/* Data Source */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-teal-500" />
          <div>
            <h2 className="font-semibold text-sm">{t.cwsi.sourceTitle}</h2>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.cwsi.sourceDesc}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* API option */}
          <button
            onClick={() => setSelectedSource('api')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              selectedSource === 'api'
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30'
                : isDark ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Cloud className={`w-6 h-6 mb-2 ${selectedSource === 'api' ? 'text-teal-500' : isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            <p className="font-medium text-sm">{t.cwsi.liveApi}</p>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.cwsi.raspiServer}</p>
            <span className="text-[10px] mt-1 inline-block bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300 px-2 py-0.5 rounded-full">
              {t.cwsi.realtimeData}
            </span>
          </button>

          {/* File option */}
          <button
            onClick={() => setSelectedSource('file')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              selectedSource === 'file'
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30'
                : isDark ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <FileSpreadsheet className={`w-6 h-6 mb-2 ${selectedSource === 'file' ? 'text-teal-500' : isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            <p className="font-medium text-sm">{t.cwsi.importFile}</p>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.cwsi.excelCsv}</p>
            <span className="text-[10px] mt-1 inline-block bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 px-2 py-0.5 rounded-full">
              {t.cwsi.historicalData}
            </span>
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          {selectedSource === 'api' ? (
            <button
              onClick={loadFromAPI}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-teal-500 text-white font-medium text-sm hover:bg-teal-600 transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {t.cwsi.loadApi}
            </button>
          ) : (
            <>
              <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileSelect} />
              <button
                onClick={() => fileInput.current?.click()}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 transition disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {t.cwsi.selectFile}
              </button>
            </>
          )}
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-red-500 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* How to use */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <HelpCircle className="w-5 h-5 text-blue-500" />
          <h3 className="font-semibold text-sm">{t.cwsi.howToUse}</h3>
        </div>
        <ol className={`text-xs space-y-1.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          <li>1. {t.cwsi.howStep1}</li>
          <li>2. {t.cwsi.howStep2}</li>
        </ol>
      </div>

      {/* Chart */}
      <div className={card}>
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-teal-500" />
          {t.cwsi.chartTitle}
        </h3>
        {chartData.length > 0 ? (
          <>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#e5e7eb'} />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke={isDark ? '#9ca3af' : '#6b7280'} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} stroke={isDark ? '#9ca3af' : '#6b7280'} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#1f2937' : '#fff',
                      border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="plot1" name={t.cwsi.plot1} stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="plot2" name={t.cwsi.plot2} stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {summary && (
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className={`p-3 rounded-xl text-center ${isDark ? 'bg-teal-900/30 border border-teal-800' : 'bg-teal-50 border border-teal-200'}`}>
                  <p className="text-xs text-teal-600 dark:text-teal-400">{t.cwsi.plot1}</p>
                  <p className="text-lg font-bold text-teal-600 dark:text-teal-400">{summary.plot1_avg ?? '—'}</p>
                  <p className="text-[10px] text-teal-500">{summary.plot1_status}</p>
                </div>
                <div className={`p-3 rounded-xl text-center ${isDark ? 'bg-orange-900/30 border border-orange-800' : 'bg-orange-50 border border-orange-200'}`}>
                  <p className="text-xs text-orange-600 dark:text-orange-400">{t.cwsi.plot2}</p>
                  <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{summary.plot2_avg ?? '—'}</p>
                  <p className="text-[10px] text-orange-500">{summary.plot2_status}</p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className={`text-center py-12 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t.cwsi.noDataYet}</p>
          </div>
        )}
      </div>
    </div>
  );
}
