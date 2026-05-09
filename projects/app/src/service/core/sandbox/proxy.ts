import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  getSandboxProviderConfig,
  connectToProviderSandbox,
  disconnectFromProviderSandbox,
  getProviderSandboxProxyTarget
} from '@fastgpt/service/core/agentSkills/sandboxConfig';
import type { SandboxProxyTargetResponse } from '@fastgpt/global/openapi/core/ai/sandbox/api';

/**
 * Read code-server's password from the container's config.yaml via exec.
 * Best-effort — returns null when:
 *   - the sandbox can't be resolved
 *   - the config file is missing
 *   - password cannot be resolved from config
 */
async function readCodeServerPasswordFromSandbox(
  adapter: Awaited<ReturnType<typeof connectToProviderSandbox>>
): Promise<string | null> {
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
}

export async function getSandboxProxyTarget(
  sandboxId: string
): Promise<SandboxProxyTargetResponse> {
  const sandbox = await MongoSandboxInstance.findOne({ sandboxId }).lean();
  if (!sandbox) throw new Error('Sandbox not found');

  const providerConfig = getSandboxProviderConfig();
  const providerSandboxId =
    providerConfig.provider === 'opensandbox'
      ? sandbox.metadata?.providerSandboxId
      : sandbox.sandboxId;

  if (!providerSandboxId) throw new Error('Sandbox providerSandboxId missing');

  const adapter = await connectToProviderSandbox(providerConfig, providerSandboxId);

  try {
    const target = await getProviderSandboxProxyTarget(adapter);
    const password =
      target.password ??
      (providerConfig.provider === 'opensandbox'
        ? await readCodeServerPasswordFromSandbox(adapter).catch(() => null)
        : null);

    return {
      service: target.service,
      origin: target.origin,
      basePath: target.basePath,
      auth: target.auth,
      ...(password ? { password } : {})
    };
  } finally {
    await disconnectFromProviderSandbox(adapter);
  }
}
