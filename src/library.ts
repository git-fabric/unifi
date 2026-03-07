/**
 * Library — git-based knowledge retrieval for fabric-unifi
 *
 * The librarian model: we know where the books are, we go fetch them
 * when asked, and we return them when done. No photocopies.
 *
 * Sources:
 *   - ubiquiti/unifi-api — community UniFi API documentation
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const LIBRARY_DIR = process.env.LIBRARY_DIR || '/tmp/fabric-library';

// ── Source Registry ─────────────────────────────────────────────────────────

interface LibrarySource {
  id: string;
  repo: string;
  branch: string;
  description: string;
  topics: TopicEntry[];
  /** Use GitHub raw API instead of git clone (for large repos) */
  useRawApi?: boolean;
}

interface TopicEntry {
  keywords: string[];
  files: string[];
  description: string;
}

const SOURCES: LibrarySource[] = [
  {
    id: 'unifi-api',
    repo: 'https://github.com/ubiquiti/unifi-api.git',
    branch: 'main',
    description: 'Community UniFi API documentation',
    useRawApi: true,
    topics: [
      // ── Devices ─────────────────────────────────────────────────
      { keywords: ['device', 'ap', 'access point', 'switch', 'gateway', 'usg', 'udm', 'adopt', 'provision'],
        files: ['README.md'],
        description: 'Device management — APs, switches, gateways, adoption' },
      { keywords: ['firmware', 'upgrade', 'update', 'version'],
        files: ['README.md'],
        description: 'Firmware management and upgrades' },

      // ── Networks ────────────────────────────────────────────────
      { keywords: ['network', 'vlan', 'subnet', 'dhcp', 'wan', 'lan', 'vpn', 'routing'],
        files: ['README.md'],
        description: 'Network configuration — VLANs, subnets, DHCP, routing' },
      { keywords: ['firewall', 'rule', 'traffic', 'port forward', 'nat'],
        files: ['README.md'],
        description: 'Firewall rules and traffic management' },
      { keywords: ['wifi', 'wireless', 'ssid', 'wlan', 'radio', 'channel'],
        files: ['README.md'],
        description: 'WiFi/WLAN configuration — SSIDs, radios, channels' },

      // ── Sites ───────────────────────────────────────────────────
      { keywords: ['site', 'multi-site', 'controller'],
        files: ['README.md'],
        description: 'Site management and multi-site deployments' },
      { keywords: ['setting', 'config', 'configuration', 'system'],
        files: ['README.md'],
        description: 'System settings and configuration' },

      // ── Clients ─────────────────────────────────────────────────
      { keywords: ['client', 'user', 'guest', 'connected', 'station', 'mac', 'block', 'unblock'],
        files: ['README.md'],
        description: 'Client/user management — connected devices, guests, blocking' },
      { keywords: ['voucher', 'hotspot', 'portal', 'captive'],
        files: ['README.md'],
        description: 'Hotspot and guest portal — vouchers, captive portal' },

      // ── Firmware ────────────────────────────────────────────────
      { keywords: ['backup', 'restore', 'migration'],
        files: ['README.md'],
        description: 'Backup, restore, and migration' },

      // ── Alerts ──────────────────────────────────────────────────
      { keywords: ['alert', 'alarm', 'notification', 'event', 'log'],
        files: ['README.md'],
        description: 'Alerts, alarms, and event logging' },
      { keywords: ['stat', 'statistic', 'throughput', 'bandwidth', 'traffic', 'health', 'speed test'],
        files: ['README.md'],
        description: 'Statistics — throughput, bandwidth, health metrics' },

      // ── API ─────────────────────────────────────────────────────
      { keywords: ['api', 'rest', 'endpoint', 'auth', 'login', 'token', 'cookie'],
        files: ['README.md'],
        description: 'API authentication and endpoints' },
      { keywords: ['cloud', 'ui.com', 'remote', 'cloud key', 'unifi os'],
        files: ['README.md'],
        description: 'Cloud access and UniFi OS' },
    ],
  },
];

// ── Library Class ───────────────────────────────────────────────────────────

export class Library {
  private cacheDir: string;

  constructor() {
    this.cacheDir = LIBRARY_DIR;
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Find relevant files for a query by matching against the topic index.
   * Returns the source, topic description, and file paths.
   */
  findTopics(query: string): { source: LibrarySource; topic: TopicEntry; score: number }[] {
    const q = query.toLowerCase();
    const matches: { source: LibrarySource; topic: TopicEntry; score: number }[] = [];

    for (const source of SOURCES) {
      for (const topic of source.topics) {
        let score = 0;
        for (const kw of topic.keywords) {
          if (q.includes(kw)) {
            // Longer keyword matches are more specific → higher score
            score += kw.length;
          }
        }
        if (score > 0) {
          matches.push({ source, topic, score });
        }
      }
    }

    // Sort by score descending, deduplicate files
    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Ensure a source repo is checked out (shallow clone, cached).
   * Returns the local path to the repo.
   */
  checkout(source: LibrarySource): string {
    if (source.useRawApi) {
      // No checkout needed — files fetched via API
      return '';
    }

    const localPath = join(this.cacheDir, source.id);

    if (existsSync(join(localPath, '.git'))) {
      // Already checked out — pull latest (fast, shallow)
      try {
        execSync(`git -C ${localPath} pull --depth 1 --rebase 2>/dev/null || true`, {
          timeout: 15000,
          stdio: 'pipe',
        });
      } catch {
        // Pull failed — stale cache is better than no cache
      }
      return localPath;
    }

    // Fresh shallow clone
    execSync(
      `git clone --depth 1 --branch ${source.branch} ${source.repo} ${localPath}`,
      { timeout: 60000, stdio: 'pipe' }
    );

    return localPath;
  }

  /**
   * Read files from a source — either from git checkout or GitHub raw API.
   * Returns concatenated content with file headers.
   */
  readFiles(source: LibrarySource, files: string[]): string {
    if (source.useRawApi) {
      return this.readFilesFromGitHub(source, files);
    }

    const localPath = this.checkout(source);
    const sections: string[] = [];

    for (const file of files) {
      const fullPath = join(localPath, file);
      if (existsSync(fullPath)) {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          const trimmed = content.length > 8000
            ? content.slice(0, 8000) + '\n\n...[truncated — full source at ' + file + ']'
            : content;
          sections.push(`--- ${file} ---\n${trimmed}`);
        } catch {
          // Skip unreadable files
        }
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Fetch files directly from GitHub raw content API.
   * No clone needed — perfect for large repos where we only need specific files.
   */
  private readFilesFromGitHub(source: LibrarySource, files: string[]): string {
    // Extract owner/repo from git URL
    const match = source.repo.match(/github\.com\/([^/]+\/[^/.]+)/);
    if (!match) return '';

    const ownerRepo = match[1];
    const sections: string[] = [];

    for (const file of files) {
      try {
        const url = `https://raw.githubusercontent.com/${ownerRepo}/${source.branch}/${file}`;
        // Synchronous fetch via curl — keeps the API simple
        const content = execSync(`curl -sf --max-time 10 "${url}"`, {
          timeout: 12000,
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf-8',
        });
        if (content) {
          const trimmed = content.length > 8000
            ? content.slice(0, 8000) + '\n\n...[truncated — full source at ' + file + ']'
            : content;
          sections.push(`--- ${file} ---\n${trimmed}`);
        }
      } catch {
        // File not found or fetch failed — skip it
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Query the library: find relevant topics, fetch files, return context.
   */
  async query(queryText: string): Promise<{ context: string; confidence: number; sources: string[] } | null> {
    const matches = this.findTopics(queryText);
    if (matches.length === 0) return null;

    // Take top 3 topic matches, deduplicate files
    const topMatches = matches.slice(0, 3);
    const seenFiles = new Set<string>();
    const filesToRead: { source: LibrarySource; file: string }[] = [];

    for (const m of topMatches) {
      for (const f of m.topic.files) {
        const key = `${m.source.id}:${f}`;
        if (!seenFiles.has(key)) {
          seenFiles.add(key);
          filesToRead.push({ source: m.source, file: f });
        }
      }
    }

    // Cap at 6 files to keep context manageable
    const capped = filesToRead.slice(0, 6);

    // Group by source for efficient checkout
    const bySource = new Map<string, { source: LibrarySource; files: string[] }>();
    for (const { source, file } of capped) {
      const existing = bySource.get(source.id);
      if (existing) {
        existing.files.push(file);
      } else {
        bySource.set(source.id, { source, files: [file] });
      }
    }

    // Read all files — catch per-source errors so one failure doesn't kill the query
    const sections: string[] = [];
    const sources: string[] = [];
    for (const { source, files } of bySource.values()) {
      try {
        const content = this.readFiles(source, files);
        if (content) {
          sections.push(content);
          sources.push(...files.map(f => `${source.id}/${f}`));
        }
      } catch {
        // Source unavailable — continue with others
      }
    }

    if (sections.length === 0) return null;

    const context = sections.join('\n\n');
    // Confidence: based on topic match quality
    const bestScore = topMatches[0].score;
    const confidence = Math.min(0.92, 0.6 + bestScore * 0.04);

    return { context, confidence, sources };
  }

  /**
   * List all registered sources and their topic counts.
   */
  listSources(): { id: string; repo: string; topics: number; description: string }[] {
    return SOURCES.map(s => ({
      id: s.id,
      repo: s.repo,
      topics: s.topics.length,
      description: s.description,
    }));
  }
}
