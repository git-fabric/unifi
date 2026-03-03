/**
 * @git-fabric/unifi — FabricApp factory
 * 9 tools: health, hosts, sites, devices, network status, debug
 *
 * UI.com Cloud API shape:
 *   GET /hosts  → { data: Host[] }
 *   Each Host has a nested `devices: Device[]` array (the actual network devices).
 *   GET /devices returns the same host-level envelope — NOT a flat device list.
 *   GET /sites  → { data: Site[] }
 *
 * All device tools flatten devices out of the hosts response.
 */
import { type UnifiAdapter } from './adapters/env.js';
interface FabricTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
}
interface FabricApp {
    name: string;
    version: string;
    description: string;
    tools: FabricTool[];
    health: () => Promise<{
        app: string;
        status: 'healthy' | 'degraded' | 'unavailable';
        latencyMs?: number;
        details?: Record<string, unknown>;
    }>;
}
export declare function createApp(adapterOverride?: UnifiAdapter): FabricApp;
export {};
//# sourceMappingURL=app.d.ts.map