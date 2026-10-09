import type { UnifiAdapter } from './types.js';
interface FabricTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
    };
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