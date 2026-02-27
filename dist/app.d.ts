/**
 * @git-fabric/unifi — FabricApp factory
 * 9 tools: health, hosts, sites, devices, network status, debug
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