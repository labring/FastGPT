import type { SandboxProviderType } from '@fastgpt-sdk/sandbox-adapter';
import { serviceEnv } from '../../../../../env';
import { buildE2BRuntimeProfile } from './e2b';
import { buildOpenSandboxRuntimeProfile } from './opensandbox';
import { buildSealosRuntimeProfile } from './sealosdevbox';
import type { SandboxRuntimeProfile } from './types';

export type {
  SandboxRuntimeCreateConfigInput,
  SandboxRuntimeProfile,
  SandboxRuntimeScenario
} from './types';
export { buildBaseSandboxRuntimeEnv } from './utils';

function assertNever(value: never): never {
  throw new Error(`Unsupported sandbox provider: ${String(value)}`);
}

function getConfiguredProvider(): SandboxProviderType {
  const provider = serviceEnv.AGENT_SANDBOX_PROVIDER;
  if (!provider) {
    throw new Error('AGENT_SANDBOX_PROVIDER is required when Agent Sandbox is used');
  }
  return provider;
}

/**
 * 获取 provider 对应的 FastGPT sandbox 运行态契约。
 *
 * index 只保留 provider 路由，具体工作目录、默认镜像、入口脚本和 createConfig
 * 映射由各 provider profile 文件维护。
 */
export function getSandboxRuntimeProfile(
  provider: SandboxProviderType = getConfiguredProvider()
): SandboxRuntimeProfile {
  switch (provider) {
    case 'opensandbox':
      return buildOpenSandboxRuntimeProfile();
    case 'sealosdevbox':
      return buildSealosRuntimeProfile();
    case 'e2b':
      return buildE2BRuntimeProfile();
    default:
      return assertNever(provider);
  }
}
