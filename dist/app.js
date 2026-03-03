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
import { createAdapterFromEnv } from './adapters/env.js';
function flattenDevices(hostsData) {
    return hostsData.flatMap(host => (host.devices ?? []).map(d => ({ ...d, hostId: host.hostId, hostName: host.hostName })));
}
export function createApp(adapterOverride) {
    const ui = adapterOverride ?? createAdapterFromEnv();
    const tools = [
        {
            name: 'unifi_health',
            description: 'Check UniFi Cloud API connectivity and get host and device count.',
            inputSchema: { type: 'object', properties: {} },
            execute: async () => {
                try {
                    const r = await ui.get('/hosts');
                    const devices = flattenDevices(r.data ?? []);
                    return { ok: true, hosts: r.data?.length ?? 0, devices: devices.length };
                }
                catch (e) {
                    return { ok: false, error: String(e) };
                }
            }
        },
        {
            name: 'unifi_list_hosts',
            description: 'List all UniFi consoles/gateways registered with UI.com. Each host contains a nested devices array.',
            inputSchema: { type: 'object', properties: {} },
            execute: async () => {
                const r = await ui.get('/hosts');
                return { count: r.data?.length ?? 0, hosts: r.data ?? [] };
            }
        },
        {
            name: 'unifi_get_host',
            description: 'Get details for a specific UniFi console/gateway by host ID.',
            inputSchema: { type: 'object', properties: { host_id: { type: 'string' } }, required: ['host_id'] },
            execute: async (a) => {
                const r = await ui.get(`/hosts/${a.host_id}`);
                return r.data ?? r;
            }
        },
        {
            name: 'unifi_list_sites',
            description: 'List all UniFi sites.',
            inputSchema: { type: 'object', properties: {} },
            execute: async () => {
                const r = await ui.get('/sites');
                return { count: r.data?.length ?? 0, sites: r.data ?? [] };
            }
        },
        {
            name: 'unifi_get_site',
            description: 'Get details for a specific UniFi site.',
            inputSchema: { type: 'object', properties: { site_id: { type: 'string' } }, required: ['site_id'] },
            execute: async (a) => {
                const r = await ui.get(`/sites/${a.site_id}`);
                return r.data ?? r;
            }
        },
        {
            name: 'unifi_list_devices',
            description: 'List all UniFi network devices (APs, switches, gateways, PDUs) flattened from all hosts. Returns id, name, model, ip, status (online/offline), mac, version, firmwareStatus, isConsole, productLine.',
            inputSchema: { type: 'object', properties: { host_id: { type: 'string', description: 'Filter to devices under a specific host.' } } },
            execute: async (a) => {
                const r = await ui.get('/hosts');
                let hosts = r.data ?? [];
                if (a.host_id)
                    hosts = hosts.filter(h => h.hostId === a.host_id);
                const devices = flattenDevices(hosts);
                const online = devices.filter(d => d.status === 'online').length;
                const offline = devices.filter(d => d.status === 'offline').length;
                return { count: devices.length, online, offline, devices };
            }
        },
        {
            name: 'unifi_get_device',
            description: 'Get details for a specific UniFi device by device ID (MAC-based ID).',
            inputSchema: { type: 'object', properties: { device_id: { type: 'string' } }, required: ['device_id'] },
            execute: async (a) => {
                // Flatten all devices and find by id
                const r = await ui.get('/hosts');
                const devices = flattenDevices(r.data ?? []);
                const device = devices.find(d => d.id === a.device_id || d.mac === a.device_id);
                if (!device)
                    throw new Error(`Device ${a.device_id} not found`);
                return device;
            }
        },
        {
            name: 'unifi_network_status',
            description: 'Get comprehensive network status: all hosts, sites, and devices with online/offline counts and per-device summary.',
            inputSchema: { type: 'object', properties: {} },
            execute: async () => {
                const [hostsR, sitesR] = await Promise.all([
                    ui.get('/hosts'),
                    ui.get('/sites'),
                ]);
                const hosts = hostsR.data ?? [];
                const sites = sitesR.data ?? [];
                const devices = flattenDevices(hosts);
                const online = devices.filter(d => d.status === 'online').length;
                const offline = devices.filter(d => d.status === 'offline').length;
                const byProductLine = {};
                for (const d of devices) {
                    const pl = d.productLine ?? 'unknown';
                    byProductLine[pl] = (byProductLine[pl] ?? 0) + 1;
                }
                return {
                    summary: {
                        hosts: hosts.length,
                        sites: sites.length,
                        devices: { total: devices.length, online, offline, by_product_line: byProductLine }
                    },
                    hosts: hosts.map(h => ({ id: h.hostId, name: h.hostName, deviceCount: (h.devices ?? []).length })),
                    devices: devices.map(d => ({
                        id: d.id,
                        name: d.name,
                        model: d.model,
                        ip: d.ip,
                        status: d.status,
                        mac: d.mac,
                        version: d.version,
                        firmwareStatus: d.firmwareStatus,
                        isConsole: d.isConsole,
                        productLine: d.productLine,
                        hostName: d.hostName,
                    })),
                };
            }
        },
        {
            name: 'unifi_debug',
            description: 'Debug API configuration and test connectivity. Returns raw counts from hosts, sites endpoints.',
            inputSchema: { type: 'object', properties: {} },
            execute: async () => {
                const tests = {};
                for (const ep of ['/hosts', '/sites']) {
                    try {
                        const r = await ui.get(ep);
                        tests[ep.slice(1)] = { status: 'ok', count: r.data?.length ?? 0 };
                    }
                    catch (e) {
                        tests[ep.slice(1)] = { status: 'error', error: String(e) };
                    }
                }
                // Also count flattened devices
                try {
                    const r = await ui.get('/hosts');
                    tests['devices_flattened'] = { status: 'ok', count: flattenDevices(r.data ?? []).length };
                }
                catch (e) {
                    tests['devices_flattened'] = { status: 'error', error: String(e) };
                }
                return { tests };
            }
        },
    ];
    return {
        name: '@git-fabric/unifi', version: '0.1.1',
        description: 'UniFi fabric app — hosts, sites, and devices via UI.com Cloud API',
        tools,
        async health() {
            const start = Date.now();
            try {
                await ui.get('/hosts');
                return { app: '@git-fabric/unifi', status: 'healthy', latencyMs: Date.now() - start };
            }
            catch (e) {
                return { app: '@git-fabric/unifi', status: 'unavailable', latencyMs: Date.now() - start, details: { error: String(e) } };
            }
        },
    };
}
//# sourceMappingURL=app.js.map