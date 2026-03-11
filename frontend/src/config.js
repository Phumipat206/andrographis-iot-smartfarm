// ============================================================
//  Subpath Configuration
//  Change BASE_PATH when deploying under a subpath
//  e.g., https://coe.wu-iotfarm.org/andrographis/
// ============================================================

// Base path for the application (no trailing slash)
// Set to '' for root deployment, '/andrographis' for subpath
export const BASE_PATH = '/andrographis';

// Helper: prepend base path to an API/internal path
export const apiUrl = (path) => `${BASE_PATH}${path}`;

// Helper: build full WebSocket URL with base path
export const wsUrl = (path) => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${BASE_PATH}${path}`;
};
