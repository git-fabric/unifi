/**
 * @git-fabric/unifi — shared types
 *
 * Covers: devices, networks, sites, clients, firmware, alerts.
 */
export interface UnifiAdapter {
    get(path: string, params?: Record<string, string>): Promise<unknown>;
    post(path: string, body?: unknown): Promise<unknown>;
    put(path: string, body?: unknown): Promise<unknown>;
    delete(path: string): Promise<unknown>;
}
//# sourceMappingURL=types.d.ts.map