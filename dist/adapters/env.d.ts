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
export declare function createAdapterFromEnv(): UnifiAdapter;
//# sourceMappingURL=env.d.ts.map