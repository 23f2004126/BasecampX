/**
 * Global state shared by every component.
 *
 * auth  - who is logged in. "Remember me" decides where it is saved:
 *         ticked   -> localStorage   (survives closing the browser)
 *         unticked -> sessionStorage (this tab only; gone when it closes)
 * prefs - small per-browser preferences (Admin > Settings), in localStorage.
 *
 * reactive() makes the UI update automatically when these change.
 */
import { reactive } from 'vue';

const AUTH_KEY = 'tma.auth';
const PREFS_KEY = 'tma.prefs';

function read(storage, key) {
  try {
    return JSON.parse(storage.getItem(key));
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / storage full: keep it in memory only */
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
const remembered = read(localStorage, AUTH_KEY);
const tabOnly = read(sessionStorage, AUTH_KEY);

export const auth = reactive({
  token: null,
  role: null,      // 'admin' | 'staff' | 'user'
  id: null,
  fullName: null,
  ...(remembered || tabOnly || {}),
});

let rememberMe = Boolean(remembered);

function saveAuth() {
  const data = { token: auth.token, role: auth.role, id: auth.id, fullName: auth.fullName };
  write(rememberMe ? localStorage : sessionStorage, AUTH_KEY, data);
  write(rememberMe ? sessionStorage : localStorage, AUTH_KEY, null);
}

/**
 * Store the response of POST /api/login.
 * Pass { remember } on login; later refreshes keep the original choice.
 */
export function setAuth({ token, role, id, full_name }, { remember } = {}) {
  if (remember !== undefined) rememberMe = remember;
  Object.assign(auth, { token, role, id, fullName: full_name });
  saveAuth();
}

export function clearAuth() {
  Object.assign(auth, { token: null, role: null, id: null, fullName: null });
  write(localStorage, AUTH_KEY, null);
  write(sessionStorage, AUTH_KEY, null);
}

export const isLoggedIn = () => Boolean(auth.token);

export const ROLE_LABELS = { admin: 'Admin', staff: 'Trekking Staff', user: 'User (Trekker)' }; // wireframe names

const DASHBOARDS = { admin: '/admin', staff: '/staff', user: '/user' };

/** Where each role lands after logging in. */
export function dashboardPath(role = auth.role) {
  return DASHBOARDS[role] || '/login';
}

// ---------------------------------------------------------------------------
// Preferences (this browser only)
// ---------------------------------------------------------------------------
export const PER_PAGE_OPTIONS = [5, 10, 20, 50];

export const prefs = reactive({
  sidebarCollapsed: false, // desktop icon-only sidebar
  perPage: 10,             // rows per page in tables
  ...(read(localStorage, PREFS_KEY) || {}),
});

export function setPref(key, value) {
  prefs[key] = value;
  write(localStorage, PREFS_KEY, { ...prefs });
}
