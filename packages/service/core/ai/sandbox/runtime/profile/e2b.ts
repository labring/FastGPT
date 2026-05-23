import type { SandboxRuntimeProfile } from './types';
import { getSandboxSkillsRootPath, mergeStringRecord, mergeUnknownRecord } from './utils';

const E2B_DEFAULT_WORK_DIRECTORY = '/home/user';

/**
 * 构建 E2B 的 FastGPT 运行态 profile。
 *
 * 当前 E2B adapter 的连接参数仍由 provider config 提供，这里只保留统一 createConfig 合并语义。
 */
export function buildE2BRuntimeProfile(): SandboxRuntimeProfile {
  return {
    provider: 'e2b',
    defaultImage: {
      repository: ''
    },
    workDirectory: E2B_DEFAULT_WORK_DIRECTORY,
    entrypoint: '',
    skillsRootPath: getSandboxSkillsRootPath(E2B_DEFAULT_WORK_DIRECTORY),
    buildConfig(input = {}) {
      // E2B 当前 create 语义主要在 adapter 连接配置内，这里只合并通用 env/metadata 扩展。
      const createConfig = input.createConfig;
      const env = mergeStringRecord(createConfig?.env, input.env);
      const metadata = mergeUnknownRecord(createConfig?.metadata, input.metadata);

      if (!createConfig && !env && !metadata) return undefined;

      return {
        ...(createConfig ?? {}),
        ...(env ? { env } : {}),
        ...(metadata ? { metadata } : {})
      };
    }
  };
}
