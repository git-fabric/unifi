/**
 * @git-fabric/unifi — FabricApp factory
 * 9 tools: health, hosts, sites, devices, network status, debug
 */
import { createAdapterFromEnv, type UnifiAdapter } from './adapters/env.js';

interface FabricTool { name: string; description: string; inputSchema: Record<string, unknown>; execute: (args: Record<string, unknown>) => Promise<unknown>; }
interface FabricApp { name: string; version: string; description: string; tools: FabricTool[]; health: () => Promise<{ app: string; status: 'healthy'|'degraded'|'unavailable'; latencyMs?: number; details?: Record<string, unknown> }>; }

export function createApp(adapterOverride?: UnifiAdapter): FabricApp {
  const ui = adapterOverride ?? createAdapterFromEnv();

  const tools: FabricTool[] = [
    { name: 'unifi_health', description: 'Check UniFi Cloud API connectivity and get host count.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => { try { const r = await ui.get('/hosts') as { data: unknown[] }; return { ok: true, hosts_count: r.data?.length ?? 0 }; } catch (e) { return { ok: false, error: String(e) }; } } },
    { name: 'unifi_list_hosts', description: 'List all UniFi hosts (consoles/gateways) registered with UI.com.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => { const r = await ui.get('/hosts') as { data: unknown[] }; return { count: r.data?.length ?? 0, hosts: r.data ?? [] }; } },
    { name: 'unifi_get_host', description: 'Get details for a specific host (console).',
      inputSchema: { type: 'object', properties: { host_id: { type: 'string' } }, required: ['host_id'] },
      execute: async (a) => { const r = await ui.get(`/hosts/${a.host_id}`) as { data: unknown }; return r.data ?? r; } },
    { name: 'unifi_list_sites', description: 'List all UniFi sites.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => { const r = await ui.get('/sites') as { data: unknown[] }; return { count: r.data?.length ?? 0, sites: r.data ?? [] }; } },
    { name: 'unifi_get_site', description: 'Get details for a specific site.',
      inputSchema: { type: 'object', properties: { site_id: { type: 'string' } }, required: ['site_id'] },
      execute: async (a) => { const r = await ui.get(`/sites/${a.site_id}`) as { data: unknown }; return r.data ?? r; } },
    { name: 'unifi_list_devices', description: 'List all UniFi devices (APs, switches, gateways), optionally filtered by host.',
      inputSchema: { type: 'object', properties: { host_id: { type: 'string', description: 'Filter by host ID.' } } },
      execute: async (a) => { const p = a.host_id ? { hostId: a.host_id as string } : undefined; const r = await ui.get('/devices', p) as { data: unknown[] }; return { count: r.data?.length ?? 0, devices: r.data ?? [] }; } },
    { name: 'unifi_get_device', description: 'Get details for a specific device.',
      inputSchema: { type: 'object', properties: { device_id: { type: 'string' } }, required: ['device_id'] },
      execute: async (a) => { const r = await ui.get(`/devices/${a.device_id}`) as { data: unknown }; return r.data ?? r; } },
    { name: 'unifi_network_status', description: 'Get comprehensive network status: all hosts, sites, devices with online/offline summary.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const [hostsR, sitesR, devicesR] = await Promise.all([
          ui.get('/hosts') as Promise<{ data: Record<string,unknown>[] }>,
          ui.get('/sites') as Promise<{ data: Record<string,unknown>[] }>,
          ui.get('/devices') as Promise<{ data: Record<string,unknown>[] }>,
        ]);
        const hosts = hostsR.data ?? [], sites = sitesR.data ?? [], devices = devicesR.data ?? [];
        let online = 0, offline = 0;
        const byType: Record<string,number> = {};
        for (const d of devices) {
          const t = String(d.productLine ?? d.type ?? 'unknown');
          byType[t] = (byType[t] ?? 0) + 1;
          const state = (d.reportedState as Record<string,unknown>)?.state;
          if (state === 'connected') online++; else offline++;
        }
        return { summary: { hosts: hosts.length, sites: sites.length, devices: { total: devices.length, online, offline, by_type: byType } }, hosts: hosts.map((h) => ({ id: h.id, name: (h.reportedState as Record<string,unknown>)?.hostname ?? h.hardwareId, type: h.type })), devices: devices.map((d) => ({ id: d.id, name: (d.reportedState as Record<string,unknown>)?.name ?? d.hardwareId, type: d.productLine ?? d.type, ip: (d.reportedState as Record<string,unknown>)?.ip, status: (d.reportedState as Record<string,unknown>)?.state === 'connected' ? 'online' : 'offline' })) };
      } },
    { name: 'unifi_debug', description: 'Debug API configuration and test connectivity to hosts/sites/devices endpoints.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const tests: Record<string,unknown> = {};
        for (const ep of ['/hosts','/sites','/devices']) {
          try { const r = await ui.get(ep) as { data: unknown[] }; tests[ep.slice(1)] = { status: 'ok', count: r.data?.length ?? 0 }; }
          catch (e) { tests[ep.slice(1)] = { status: 'error', error: String(e) }; }
        }
        return { tests };
      } },
  ];

  return {
    name: '@git-fabric/unifi', version: '0.1.0',
    description: 'UniFi fabric app — hosts, sites, and devices via UI.com Cloud API',
    tools,
    async health() {
      const start = Date.now();
      try { await ui.get('/hosts'); return { app: '@git-fabric/unifi', status: 'healthy', latencyMs: Date.now()-start }; }
      catch (e: unknown) { return { app: '@git-fabric/unifi', status: 'unavailable', latencyMs: Date.now()-start, details: { error: String(e) } }; }
    },
  };
}
