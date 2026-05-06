import { env } from './env';

/**
 * Parse a Host header into { sandboxId, baseHost } if it matches one of the configured
 * base hosts. Returns null when the host doesn't match any base or has no subdomain part.
 *
 * Examples (base="localhost:3006"):
 *   "abc123.localhost:3006" → { sandboxId: "abc123", baseHost: "localhost:3006" }
 *   "localhost:3006"        → null  (no subdomain → not a sandbox request)
 *   "evil.com"              → null  (host not in base list)
 */
export function parseSandboxHost(
  host: string | undefined
): { sandboxId: string; baseHost: string } | null {
  if (!host) return null;
  const lower = host.toLowerCase();

  for (const base of env.baseHosts) {
    if (lower === base) return null; // exact match: bare base host, not a sandbox subdomain
    const suffix = `.${base}`;
    if (lower.endsWith(suffix)) {
      const sandboxId = lower.slice(0, lower.length - suffix.length);
      // sandboxId must be non-empty and not contain dots (no nested subdomains)
      if (sandboxId.length === 0 || sandboxId.includes('.')) return null;
      return { sandboxId, baseHost: base };
    }
  }
  return null;
}
