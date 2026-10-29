const TOKEN_KEY = 'token';
const COOKIE_NAME = 'admin_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSession(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable — the cookie still gates the admin pages */
  }
  document.cookie = `${COOKIE_NAME}=${token}; path=/; max-age=604800; samesite=strict`;
}

export interface SessionUser {
  id: string;
  role: 'admin' | 'manager' | 'user';
  name?: string;
  username?: string;
  email?: string;
}

export function getCurrentUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user');
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return {
      id: payload.id,
      role: payload.role || 'user',
    };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('user');
  } catch {
    /* ignore */
  }
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; samesite=strict`;
}

export function logout(): void {
  clearSession();
  window.location.href = '/admin/login';
}

/**
 * fetch() for admin endpoints: attaches the bearer token and sends the user
 * back to the login page when the session is missing or expired.
 */
export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    logout();
  }
  return res;
}

/** Reads `{ message }` from an error response, falling back to the status. */
export async function errorMessage(res: Response, fallback = 'Something went wrong'): Promise<string> {
  try {
    const body = await res.json();
    return body?.message || `${fallback} (HTTP ${res.status})`;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}
