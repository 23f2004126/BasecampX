/**
 * One place for every call to the Flask API.
 * - Adds the Authentication-Token header automatically
 * - Turns error responses into an ApiError with the server's message
 * - If a logged-in request gets 401 (token expired / logged out elsewhere),
 *   clears the session and sends the user to the login page
 */
import { auth, clearAuth } from './store.js';

export class ApiError extends Error {
  constructor(message, status, errors = {}) {
    super(message);
    this.status = status;
    this.errors = errors; // field -> message, from 400 validation errors
  }
}

export async function api(path, { method = 'GET', body, withAuth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const sentToken = withAuth && auth.token;
  if (sentToken) headers['Authentication-Token'] = auth.token;

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Please check your connection.', 0);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && sentToken) {
      clearAuth();
      window.location.hash = '#/login';
    }
    throw new ApiError(data.message || `Request failed (${response.status}).`, response.status, data.errors);
  }
  return data;
}

/**
 * Log out: tell the server (it invalidates every token for this user), then
 * clear local storage. Local logout happens even if the server call fails.
 */
export async function logout() {
  try {
    await api('/logout', { method: 'POST' });
  } catch {
    /* token already invalid / offline: still log out locally */
  }
  clearAuth();
}

/**
 * Download a file from a protected endpoint (needs the auth header, so a plain
 * <a href> can't be used): fetch it as a blob, then save it via a temporary link.
 */
export async function download(path, fallbackName = 'download') {
  const response = await fetch(`/api${path}`, { headers: { 'Authentication-Token': auth.token || '' } });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearAuth();
      window.location.hash = '#/login';
    }
    throw new ApiError(data.message || `Download failed (${response.status}).`, response.status);
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const filename = match ? decodeURIComponent(match[1]) : fallbackName;

  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const get = (path) => api(path);
export const post = (path, body, options = {}) => api(path, { method: 'POST', body, ...options });
export const put = (path, body, options = {}) => api(path, { method: 'PUT', body, ...options });
export const del = (path) => api(path, { method: 'DELETE' });
