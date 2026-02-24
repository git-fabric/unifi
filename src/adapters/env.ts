/**
 * UniFi UI.com Cloud API adapter
 * Required: UNIFI_API_KEY
 * Optional: UNIFI_API_BASE (default: https://api.ui.com), UNIFI_API_VERSION (default: v1)
 */

export interface UnifiAdapter {
  get(path: string, params?: Record<string, string>): Promise<unknown>;
  post(path: string, body?: unknown): Promise<unknown>;
  put(path: string, body?: unknown): Promise<unknown>;
  delete(path: string): Promise<unknown>;
}

export function createAdapterFromEnv(): UnifiAdapter {
  const key = process.env.UNIFI_API_KEY;
  if (!key) throw new Error('UNIFI_API_KEY is required');
  const base = `${(process.env.UNIFI_API_BASE ?? 'https://api.ui.com').replace(/\/$/, '')}/${process.env.UNIFI_API_VERSION ?? 'v1'}`;
  const timeout = parseInt(process.env.UNIFI_TIMEOUT_S ?? '30', 10) * 1000;

  function headers() { return { 'X-API-KEY': key!, Accept: 'application/json', 'Content-Type': 'application/json' }; }

  async function uf(method: string, path: string, body?: unknown, params?: Record<string, string>): Promise<unknown> {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    const url = `${base}/${path.replace(/^\//, '')}${q}`;
    const res = await fetch(url, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new Error(`UniFi ${method} ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  }

  return {
    get: (path, params?) => uf('GET', path, undefined, params),
    post: (path, body?) => uf('POST', path, body),
    put: (path, body?) => uf('PUT', path, body),
    delete: (path) => uf('DELETE', path),
  };
}
