import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BASE_PATH } from './config.js'

// ── Global fetch interceptor ───────────────────────────────
// Automatically prepends BASE_PATH to /api/ and /ws/ requests
// so existing fetch('/api/...') calls work under a subpath.
if (BASE_PATH) {
  const _fetch = window.fetch;
  window.fetch = function (url, opts) {
    if (typeof url === 'string' && (url.startsWith('/api/') || url.startsWith('/ws/'))) {
      url = BASE_PATH + url;
    }
    return _fetch.call(this, url, opts);
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
