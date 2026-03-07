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
import { createAdapterFromEnv } from './adapters/env.js';
import type { UnifiAdapter } from './types.js';

interface FabricTool { name: string; description: string; inputSchema: Record<string, unknown>; execute: (args: Record<string, unknown>) => Promise<unknown>; }
interface FabricApp { name: string; version: string; description: string; tools: FabricTool[]; health: () => Promise<{ app: string; status: 'healthy'|'degraded'|'unavailable'; latencyMs?: number; details?: Record<string, unknown> }>; }

interface HostWithDevices {
  hostId?: string;
  hostName?: string;
  devices?: DeviceRecord[];
  updatedAt?: string;
  [k: string]: unknown;
}

interface DeviceRecord {
  id: string;
  name?: string;
  model?: string;
  ip?: string;
  status?: string;
  isConsole?: boolean;
  productLine?: string;
  version?: string;
  firmwareStatus?: string;
  mac?: string;
  [k: string]: unknown;
}

// GET /devices returns HostWithDevices[] — flatten the nested devices arrays
async function fetchAllDevices(ui: UnifiAdapter): Promise<(DeviceRecord & { hostId?: string; hostName?: string })[]> {
  const r = await ui.get('/devices') as { data: HostWithDevices[] };
  const hosts = r.data ?? [];
  return hosts.flatMap(host =>
    (host.devices ?? []).map(d => ({ ...d, hostId: host.hostId, hostName: host.hostName }))
  );
}

export function createApp(adapterOverride?: UnifiAdapter): FabricApp {
  const ui = adapterOverride ?? createAdapterFromEnv();

  const tools: FabricTool[] = [
    {
      name: 'unifi_health',
      description: 'Check UniFi Cloud API connectivity and get device count.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        try {
          const [hostsR, devices] = await Promise.all([
            ui.get('/hosts') as Promise<{ data: unknown[] }>,
            fetchAllDevices(ui),
          ]);
          return { ok: true, hosts: hostsR.data?.length ?? 0, devices: devices.length };
        } catch (e) { return { ok: false, error: String(e) }; }
      }
    },
    {
      name: 'unifi_list_hosts',
      description: 'List all UniFi consoles/gateways registered with UI.com.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const r = await ui.get('/hosts') as { data: unknown[] };
        return { count: r.data?.length ?? 0, hosts: r.data ?? [] };
      }
    },
    {
      name: 'unifi_get_host',
      description: 'Get details for a specific UniFi console/gateway by host ID.',
      inputSchema: { type: 'object', properties: { host_id: { type: 'string' } }, required: ['host_id'] },
      execute: async (a) => {
        const r = await ui.get(`/hosts/${a.host_id}`) as { data: unknown };
        return r.data ?? r;
      }
    },
    {
      name: 'unifi_list_sites',
      description: 'List all UniFi sites.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const r = await ui.get('/sites') as { data: unknown[] };
        return { count: r.data?.length ?? 0, sites: r.data ?? [] };
      }
    },
    {
      name: 'unifi_get_site',
      description: 'Get details for a specific UniFi site.',
      inputSchema: { type: 'object', properties: { site_id: { type: 'string' } }, required: ['site_id'] },
      execute: async (a) => {
        const r = await ui.get(`/sites/${a.site_id}`) as { data: unknown };
        return r.data ?? r;
      }
    },
    {
      name: 'unifi_list_devices',
      description: 'List all UniFi network devices (APs, switches, gateways, PDUs) as a flat list. Returns id, name, model, ip, status (online/offline), mac, version, firmwareStatus, isConsole, productLine.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const devices = await fetchAllDevices(ui);
        const online = devices.filter(d => d.status === 'online').length;
        const offline = devices.filter(d => d.status === 'offline').length;
        return { count: devices.length, online, offline, devices };
      }
    },
    {
      name: 'unifi_get_device',
      description: 'Get details for a specific UniFi device by device ID or MAC address.',
      inputSchema: { type: 'object', properties: { device_id: { type: 'string', description: 'Device ID or MAC address.' } }, required: ['device_id'] },
      execute: async (a) => {
        const devices = await fetchAllDevices(ui);
        const device = devices.find(d => d.id === a.device_id || d.mac === a.device_id);
        if (!device) throw new Error(`Device ${a.device_id} not found`);
        return device;
      }
    },
    {
      name: 'unifi_network_status',
      description: 'Get comprehensive network status: hosts, sites, all devices with online/offline counts and per-device summary.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const [hostsR, sitesR, devices] = await Promise.all([
          ui.get('/hosts') as Promise<{ data: unknown[] }>,
          ui.get('/sites') as Promise<{ data: unknown[] }>,
          fetchAllDevices(ui),
        ]);
        const online = devices.filter(d => d.status === 'online').length;
        const offline = devices.filter(d => d.status === 'offline').length;
        const byProductLine: Record<string, number> = {};
        for (const d of devices) {
          const pl = d.productLine ?? 'unknown';
          byProductLine[pl] = (byProductLine[pl] ?? 0) + 1;
        }
        return {
          summary: {
            hosts: hostsR.data?.length ?? 0,
            sites: sitesR.data?.length ?? 0,
            devices: { total: devices.length, online, offline, by_product_line: byProductLine }
          },
          devices: devices.map(d => ({
            id: d.id, name: d.name, model: d.model, ip: d.ip,
            status: d.status, mac: d.mac, version: d.version,
            firmwareStatus: d.firmwareStatus, isConsole: d.isConsole,
            productLine: d.productLine, hostName: d.hostName,
          })),
        };
      }
    },
    {
      name: 'unifi_debug',
      description: 'Debug API connectivity. Returns raw counts from hosts, sites, and devices endpoints.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const tests: Record<string, unknown> = {};
        for (const ep of ['/hosts', '/sites', '/devices']) {
          try {
            const r = await ui.get(ep) as { data: unknown[] };
            tests[ep.slice(1)] = { status: 'ok', count: r.data?.length ?? 0 };
          } catch (e) { tests[ep.slice(1)] = { status: 'error', error: String(e) }; }
        }
        try {
          const devices = await fetchAllDevices(ui);
          tests['devices_flattened'] = { status: 'ok', count: devices.length };
        } catch (e) { tests['devices_flattened'] = { status: 'error', error: String(e) }; }
        return { tests };
      }
    },
  ];

  return {
    name: '@git-fabric/unifi', version: '0.1.2',
    description: 'UniFi fabric app — hosts, sites, and devices via UI.com Cloud API',
    tools,
    async health() {
      const start = Date.now();
      try { await ui.get('/hosts'); return { app: '@git-fabric/unifi', status: 'healthy', latencyMs: Date.now()-start }; }
      catch (e: unknown) { return { app: '@git-fabric/unifi', status: 'unavailable', latencyMs: Date.now()-start, details: { error: String(e) } }; }
    },
  };
}
