import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  getSandboxProviderConfig,
  connectToProviderSandbox,
  disconnectFromProviderSandbox
} from '@fastgpt/service/core/agentSkills/sandboxConfig';
import { serviceEnv } from '@fastgpt/service/env';

/**
 * Read code-server's password from the container's config.yaml via exec.
 * Best-effort — returns null when:
 *   - the sandbox / providerSandboxId can't be resolved
 *   - the config file is missing
 *   - password cannot be resolved from config
 */
export async function getCodeServerPasswordFromSandbox(sandboxId: string): Promise<string | null> {
  const sandbox = await MongoSandboxInstance.findOne({ sandboxId }).lean();
  if (!sandbox?.metadata?.providerSandboxId) return null;

  const providerConfig = getSandboxProviderConfig();
  const adapter = await connectToProviderSandbox(
    providerConfig,
    sandbox.metadata.providerSandboxId
  );
  try {
    const result = await adapter.execute(
      'for f in /root/.config/code-server/config.yaml ~/.config/code-server/config.yaml; do ' +
        '  [ -f "$f" ] && cat "$f" && break; ' +
        'done'
    );
    const yaml = result.stdout;
    if (!yaml) return null;
    const auth = yaml
      .match(/^auth:\s*(\S+)/m)?.[1]
      ?.trim()
      .toLowerCase();
    if (auth === 'none') return null;
    const password = yaml.match(/^password:\s*(\S+)/m)?.[1]?.trim();
    return password || null;
  } finally {
    await disconnectFromProviderSandbox(adapter);
  }
}

/**
 * Resolve the **direct** (non-server-proxied) endpoint for a sandbox port.
 *
 * The default `endpoint.url` stored in `sandbox.metadata.endpoint` goes through
 * opensandbox's HTTP path-proxy (`/sandboxes/<sid>/proxy/<port>`), which is FastAPI-
 * routed and does NOT support WebSocket upgrade. Code-server inside the iframe needs
 * WS for its remote-extension-host channel, so we must bypass the path-proxy and hit
 * the published host port directly.
 *
 * Returns a base URL like `http://localhost:55549` (no path) suitable for use as
 * the proxy target. Any inner path (e.g. `/proxy/8080/...`) is appended by the
 * sandbox-proxy when forwarding the iframe request.
 */
export async function getDirectSandboxBaseUrl(
  providerSandboxId: string,
  port: number
): Promise<string> {
  const baseUrl = serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL;
  if (!baseUrl) throw new Error('AGENT_SANDBOX_OPENSANDBOX_BASEURL not configured');

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY) {
    headers['Authorization'] = `Bearer ${serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY}`;
  }

  const resp = await fetch(
    `${baseUrl}/v1/sandboxes/${providerSandboxId}/endpoints/${port}?use_server_proxy=false`,
    { method: 'GET', headers }
  );
  if (!resp.ok) {
    throw new Error(`opensandbox endpoint lookup failed: HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as { endpoint?: string };
  if (!data.endpoint) throw new Error('opensandbox returned no endpoint');

  // Endpoint format: `<host>:<host-port>/proxy/<container-port>` — drop the trailing
  // `/proxy/<port>` (it's execd-proxying-to-itself, would loop). We want the bare
  // host:port pointing at execd directly.
  let hostPort = data.endpoint.replace(/\/proxy\/\d+\/?$/, '');

  // 宿主进程解析不到 host.docker.internal —— proxy 在宿主跑时改写为 localhost。
  if (serviceEnv.SANDBOX_PROXY_REPLACE_DOCKER_INTERNAL_WITH_LOCALHOST) {
    hostPort = hostPort.replace(/^host\.docker\.internal\b/, 'localhost');
  }

  return `http://${hostPort}`;
}
