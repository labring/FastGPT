import { getAgentSandboxMissingRequiredEnvKeys, isAgentSandboxProvider } from '../../../env.util';
import type { SandboxProviderType } from '@fastgpt-sdk/sandbox-adapter';

const getPositiveIntegerEnv = (
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number
): number => {
  const rawValue = env[name];
  if (rawValue === undefined || rawValue === '') return defaultValue;

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
};

export type SandboxIntegrationTimingBudgets = {
  toolMs: number;
  timeoutMs: number;
  lifecycleMs: number;
  cleanupMs: number;
};

/**
 * 只在显式启用后解析 Sandbox 集成测试 provider。
 *
 * 启用后配置不完整会立即失败，避免真实 provider 用例因环境变量缺失而静默跳过。
 */
export const getSandboxIntegrationProvider = (
  env: NodeJS.ProcessEnv = process.env
): SandboxProviderType | undefined => {
  if (env.SANDBOX_INTEGRATION?.toLowerCase() !== 'true') return;

  const provider = env.AGENT_SANDBOX_PROVIDER;
  if (!isAgentSandboxProvider(provider)) {
    throw new Error(
      'AGENT_SANDBOX_PROVIDER must be opensandbox or sealosdevbox when SANDBOX_INTEGRATION=true'
    );
  }

  const missingKeys = getAgentSandboxMissingRequiredEnvKeys(env);
  if (missingKeys.length > 0) {
    throw new Error(`Missing Sandbox integration environment variables: ${missingKeys.join(', ')}`);
  }

  return provider;
};

/** 读取本地 provider 性能预算；所有预算都是单次操作的 wall-clock 上限。 */
export const getSandboxIntegrationTimingBudgets = (
  env: NodeJS.ProcessEnv = process.env
): SandboxIntegrationTimingBudgets => ({
  toolMs: getPositiveIntegerEnv(env, 'SANDBOX_INTEGRATION_TOOL_MAX_MS', 2_000),
  timeoutMs: getPositiveIntegerEnv(env, 'SANDBOX_INTEGRATION_TIMEOUT_MAX_MS', 8_000),
  lifecycleMs: getPositiveIntegerEnv(env, 'SANDBOX_INTEGRATION_LIFECYCLE_MAX_MS', 180_000),
  cleanupMs: getPositiveIntegerEnv(env, 'SANDBOX_INTEGRATION_CLEANUP_MAX_MS', 120_000)
});
