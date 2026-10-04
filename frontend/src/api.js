const BASE = '/api';

function getToken() { return localStorage.getItem('wp_token'); }
export function setSession(token, user) {
  localStorage.setItem('wp_token', token);
  localStorage.setItem('wp_user', JSON.stringify(user));
}
export function getUser() {
  try { return JSON.parse(localStorage.getItem('wp_user')); } catch { return null; }
}
export function clearSession() {
  localStorage.removeItem('wp_token');
  localStorage.removeItem('wp_user');
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export const api = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),

  board: (date, depot) => request(`/dispatcher/board?date=${date}&depot=${depot}`),
  allocate: (date, depot) => request('/dispatcher/allocate', { method: 'POST', body: { date, depot } }),
  shortfall: (date, depot) => request(`/dispatcher/shortfall?date=${date}&depot=${depot}`),
  decide: (orderId, body) => request(`/dispatcher/orders/${orderId}/decision`, { method: 'POST', body }),

  loaderTrips: (date, depot) => request(`/loader/trips?date=${date}&depot=${depot}`),
  loaderStops: (tripKey) => request(`/loader/trips/${encodeURIComponent(tripKey)}/stops`),
  loadStop: (stopId) => request(`/loader/stops/${stopId}/load`, { method: 'POST' }),
  flagStop: (stopId, note) => request(`/loader/stops/${stopId}/flag`, { method: 'POST', body: { note } }),

  driverStops: (date) => request(`/driver/stops?date=${date}`),
  driverStatus: (stopId, status, note) => request(`/driver/stops/${stopId}/status`, { method: 'POST', body: { status, note } }),
  sync: (events) => request('/driver/sync', { method: 'POST', body: { events } }),
  resolveConflict: (stopId, keep) => request('/driver/sync/resolve', { method: 'POST', body: { stopId, keep } }),

  smOrders: (date) => request(`/storemanager/orders?date=${date}`),
  confirmReceipt: (orderId, status, note) => request(`/storemanager/orders/${orderId}/confirm`, { method: 'POST', body: { status, note } }),
};

export const DEMO_DATE = '2026-02-16';
