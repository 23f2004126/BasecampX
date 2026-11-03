/**
 * Global auth state, shared by every component.
 * reactive() makes it update the UI automatically; localStorage keeps the
 * user logged in after a page refresh.
 */
import { reactive } from 'vue';

const STORAGE_KEY = 'tma.auth';

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export const auth = reactive({
  token: null,
  role: null,      // 'admin' | 'staff' | 'user'
  id: null,
  fullName: null,
  ...loadSaved(),
});

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  } catch {
    /* private mode / storage full: stay logged in for this tab only */
  }
}

/** Store the response of POST /api/login. */
export function setAuth({ token, role, id, full_name }) {
  Object.assign(auth, { token, role, id, fullName: full_name });
  save();
}

export function clearAuth() {
  Object.assign(auth, { token: null, role: null, id: null, fullName: null });
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export const isLoggedIn = () => Boolean(auth.token);

export const ROLE_LABELS = { admin: 'Admin', staff: 'Trek Staff', user: 'Trekker' };

const DASHBOARDS = { admin: '/admin', staff: '/staff', user: '/user' };

/** Where each role lands after logging in. */
export function dashboardPath(role = auth.role) {
  return DASHBOARDS[role] || '/login';
}
