/**
 * Parse the sandbox id from the first Host label.
 * The ingress/gateway owns wildcard-domain routing; sandbox-proxy only needs the
 * left-most label to bind the request to the JWT `sid`.
 *
 * Examples:
 *   "abc123.sandbox.example.com" → { sandboxId: "abc123" }
 *   "abc123.localhost:3006"      → { sandboxId: "abc123" }
 *   "localhost:3006"             → null  (no sandbox subdomain)
 */
export function parseSandboxHost(host: string | undefined): { sandboxId: string } | null {
  if (!host) return null;
  const lower = host.toLowerCase().trim();
  if (!lower) return null;

  const withoutPort = lower.startsWith('[') ? lower : lower.split(':')[0];
  const firstDot = withoutPort.indexOf('.');
  if (firstDot <= 0) return null;

  const sandboxId = withoutPort.slice(0, firstDot);
  if (!sandboxId) return null;

  return { sandboxId };
}
