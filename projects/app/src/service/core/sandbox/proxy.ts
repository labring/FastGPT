import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { getSandboxProviderConfig } from '@fastgpt/service/core/ai/sandbox/config';
import {
  connectToSandbox,
  disconnectSandbox,
  getSandboxCodeServerProxyTarget
} from '@fastgpt/service/core/ai/sandbox/controller';
import type { SandboxProxyTargetResponse } from '@fastgpt/global/openapi/core/ai/sandbox/api';

/**
 * 从 code-server 配置文件读取访问密码；读取失败时由调用方按无密码目标处理。
 */
async function readCodeServerPasswordFromSandbox(
  adapter: Awaited<ReturnType<typeof connectToSandbox>>
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
  const providerConfig = getSandboxProviderConfig();
  const provider = providerConfig.provider;
  const sandbox = await MongoSandboxInstance.findOne({ provider, sandboxId }).lean();
  if (!sandbox) throw new Error('Sandbox not found');
  if (sandbox.status !== SandboxStatusEnum.running) {
    throw new Error('Sandbox is not running');
  }

  const adapter = await connectToSandbox(providerConfig, sandbox.sandboxId);

  try {
    const target = await getSandboxCodeServerProxyTarget(adapter);
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
    await disconnectSandbox(adapter);
  }
}
