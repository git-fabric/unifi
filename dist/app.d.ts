/**
 * @git-fabric/unifi — FabricApp factory
 * 9 tools: health, hosts, sites, devices, network status, debug
 *
 * UI.com Cloud API shape:
 *   GET /hosts  → { data: Host[] }  — consoles/gateways, no device details
 *   GET /devices → { data: HostWithDevices[] }
 *     Each item has a top-level `devices: Device[]` array containing the
 *     actual network devices (APs, switches, PDUs, etc.)
 *   GET /sites  → { data: Site[] }
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