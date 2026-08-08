/**
 * Remembers the last `/app/*` tab the user was on, so a reload — or, for
 * an installed PWA, the OS fully killing and relaunching the app window
 * when it's backgrounded and reopened — can send them back to it instead
 * of silently landing on the dashboard.
 *
 * localStorage on purpose (not sessionStorage): an installed PWA window
 * that gets backgrounded can be killed and relaunched by the OS as a
 * brand-new browsing session, which wipes sessionStorage. localStorage
 * survives that because it's tied to the origin, not the session.
 */
const LAST_ROUTE_KEY = 'erj_last_app_route';

export function saveLastRoute(pathname) {
  try {
    localStorage.setItem(LAST_ROUTE_KEY, pathname);
  } catch {
    // localStorage unavailable (private mode, etc.) — non-critical, skip.
  }
}

export function getLastRoute() {
  try {
    return localStorage.getItem(LAST_ROUTE_KEY);
  } catch {
    return null;
  }
}

export function clearLastRoute() {
  try {
    localStorage.removeItem(LAST_ROUTE_KEY);
  } catch {
    // no-op
  }
}