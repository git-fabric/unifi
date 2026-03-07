# @git-fabric/unifi

UniFi fabric app -- hosts, sites, and devices via the UI.com Cloud API as a composable MCP layer. Part of [git-fabric](https://github.com/git-fabric).

## What it is

`@git-fabric/unifi` is a self-contained autonomous fabric that exposes UniFi network infrastructure through the MCP protocol. It queries the UI.com Cloud API for hosts (consoles/gateways), sites, and devices (APs, switches, PDUs), and serves them as 9 MCP tools over stdio or StreamableHTTP.

When a gateway is available, the fabric registers as AS65005 and advertises `fabric.network.*` routes so other fabrics and the gateway's BGP-style resolver can route network questions here before falling back to Claude.

Built on the [fabric-sdk](https://github.com/git-fabric/sdk) architecture.

## Tools

| Tool | Description |
|------|-------------|
| `unifi_health` | Check UniFi Cloud API connectivity and get device count |
| `unifi_list_hosts` | List all UniFi consoles/gateways registered with UI.com |
| `unifi_get_host` | Get details for a specific console/gateway by host ID |
| `unifi_list_sites` | List all UniFi sites |
| `unifi_get_site` | Get details for a specific site |
| `unifi_list_devices` | List all network devices (APs, switches, gateways, PDUs) as a flat list |
| `unifi_get_device` | Get details for a specific device by ID or MAC address |
| `unifi_network_status` | Comprehensive network status: hosts, sites, devices with online/offline counts |
| `unifi_debug` | Debug API connectivity with raw counts from all endpoints |

## OSI Layer Architecture

```
Layer 7 -- Application    app.ts (FabricApp factory, 9 tools)
Layer 6 -- Presentation   bin/cli.js (MCP stdio + HTTP, aiana_query)
Layer 5 -- Session        (stateless -- direct API queries)
Layer 4 -- Transport      MCP protocol (stdio + StreamableHTTP)
Layer 3 -- Network        Gateway registration (AS65005, fabric.network.*)
Layer 2 -- Data Link      adapters/env.ts (UI.com Cloud API)
Layer 1 -- Physical       UI.com Cloud API
```

**Layer 7** defines the FabricApp interface and all 9 tools. Each tool is a pure function: input schema in, JSON out.

**Layer 6** is the presentation layer -- `bin/cli.js` wires the FabricApp into MCP request handlers (ListTools, CallTool) and exposes `aiana_query` for gateway DNS-style resolution. Two knowledge sources are checked in order: live UniFi API (deterministic, real-time state) and the Library (reference docs fetched from git on demand).

**Layer 5** is stateless. Every tool call makes a fresh API request -- no sessions, no caching, no state to invalidate.

**Layer 4** supports two transports: stdio (for local MCP clients like Claude Desktop) and StreamableHTTP (for gateway and network access on `MCP_HTTP_PORT`).

**Layer 3** handles gateway registration. On startup, the fabric announces its AS number (65005) and route prefixes to the gateway. A 30-second keepalive interval maintains the session. If the gateway is unreachable, the fabric continues operating standalone.

**Layer 2** is the adapter layer. `createAdapterFromEnv()` reads credentials from environment variables and returns a typed `UnifiAdapter` with `get`, `post`, `put`, `delete` methods against the UI.com Cloud API.

**Layer 1** is the UI.com Cloud API itself (`https://api.ui.com/v1`).

## Gateway Registration

When `GATEWAY_URL` is set, the fabric registers with the gateway on startup:

- **AS Number**: 65005
- **Fabric ID**: `fabric-unifi`
- **Keepalive**: every 30 seconds

### Advertised Routes

| Prefix | Description |
|--------|-------------|
| `fabric.network` | UniFi network management -- devices, sites, hosts, status |
| `fabric.network.devices` | Network devices -- APs, switches, gateways, PDUs |
| `fabric.network.sites` | UniFi sites -- multi-site management |
| `fabric.network.hosts` | UniFi consoles/gateways -- Cloud Key, UDM, UNVR |
| `fabric.network.status` | Network status -- online/offline counts, health overview |

All routes advertise with `local_pref: 100`. The gateway's F-RIB uses these prefixes to route incoming queries to this fabric before considering other fabrics or the Claude default route.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `UNIFI_API_KEY` | Yes | -- | UI.com Cloud API key |
| `UNIFI_API_BASE` | No | `https://api.ui.com` | API base URL |
| `UNIFI_API_VERSION` | No | `v1` | API version path segment |
| `MCP_HTTP_PORT` | No | -- | Port for StreamableHTTP transport (omit for stdio-only) |
| `GATEWAY_URL` | No | -- | Gateway URL for fabric registration (e.g. `http://gateway:8100`) |
| `POD_IP` | No | `0.0.0.0` | IP address announced to gateway for MCP endpoint |
| `OLLAMA_ENDPOINT` | No | `http://ollama.fabric-sdk:11434` | Ollama endpoint for local LLM inference |
| `OLLAMA_MODEL` | No | `qwen2.5-coder:3b` | Ollama model for local inference |

## Library

The fabric includes a built-in Library (`src/library.ts`) that acts as a reference knowledge layer. When a query does not match a live API pattern, the Library fetches documentation from upstream sources -- currently [`ubiquiti/unifi-api`](https://github.com/ubiquiti/unifi-api) -- via the GitHub raw content API (no local clone needed).

The Library uses a topic index with keyword matching to find relevant files, fetches them on demand, and returns context with a confidence score. This keeps "how to" and "why" questions inside the fabric without hitting Claude.

## Usage

### Stdio (local MCP client)

```bash
UNIFI_API_KEY=your-key npx @git-fabric/unifi
```

Or in Claude Desktop / MCP client config:

```json
{
  "mcpServers": {
    "unifi": {
      "command": "npx",
      "args": ["@git-fabric/unifi"],
      "env": { "UNIFI_API_KEY": "your-key" }
    }
  }
}
```

### StreamableHTTP (standalone)

```bash
UNIFI_API_KEY=your-key MCP_HTTP_PORT=8200 npx @git-fabric/unifi
```

Endpoints: `/health`, `/tools`, `/tools/call`, `/mcp/tools/call`, `/mcp`

### Gateway mode

```bash
UNIFI_API_KEY=your-key \
MCP_HTTP_PORT=8200 \
GATEWAY_URL=http://gateway:8100 \
npx @git-fabric/unifi
```

The fabric registers with the gateway on startup and sends keepalives every 30 seconds. If the gateway is unreachable, it continues operating standalone.

## License

MIT
