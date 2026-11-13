import { getAgentSandboxMissingRequiredEnvKeys, hasOpenSandboxEnvConfig } from '../../../env.util';

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
 * 只在显式启用后校验 OpenSandbox 集成测试环境变量。
 *
 * 启用后配置不完整会立即失败，避免真实用例因环境变量缺失而静默跳过。
 */
export const isSandboxIntegrationEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => {
  if (env.SANDBOX_INTEGRATION?.toLowerCase() !== 'true') return false;

  if (!hasOpenSandboxEnvConfig(env)) {
    throw new Error(
      'AGENT_SANDBOX_OPENSANDBOX_BASEURL must be configured when SANDBOX_INTEGRATION=true'
    );
  }

  const missingKeys = getAgentSandboxMissingRequiredEnvKeys(env);
  if (missingKeys.length > 0) {
    throw new Error(`Missing Sandbox integration environment variables: ${missingKeys.join(', ')}`);
  }

  return true;
};

/** 读取本地性能预算；所有预算都是单次操作的 wall-clock 上限。 */
export const getSandboxIntegrationTimingBudgets = (
  env: NodeJS.ProcessEnv = process.env
): SandboxIntegrationTimingBudgets => ({
  toolMs: getPositiveIntegerEnv(env, 'SANDBOX_INTEGRATION_TOOL_MAX_MS', 2_000),
  timeoutMs: getPositiveIntegerEnv(env, 'SANDBOX_INTEGRATION_TIMEOUT_MAX_MS', 8_000),
  lifecycleMs: getPositiveIntegerEnv(env, 'SANDBOX_INTEGRATION_LIFECYCLE_MAX_MS', 180_000),
  cleanupMs: getPositiveIntegerEnv(env, 'SANDBOX_INTEGRATION_CLEANUP_MAX_MS', 120_000)
});
