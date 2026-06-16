import { serviceEnv } from '../../../../../env';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { SandboxRuntimeProfile } from './types';
import { getSandboxSkillsRootPath, mergeStringRecord, mergeUnknownRecord } from './utils';
import { parseImageSpec } from '@fastgpt-sdk/sandbox-adapter';

/**
 * 构建 Sealos Devbox 的 FastGPT 运行态 profile。
 *
 * Devbox 的工作目录通过 CODEX_GATEWAY_CWD 间接生效，adapter 会把 workingDir 映射过去。
 */
export function buildSealosRuntimeProfile(): SandboxRuntimeProfile {
  const workDirectory = serviceEnv.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY || '/home/devbox/workspace';

  const defaultImage = parseImageSpec(serviceEnv.AGENT_SANDBOX_SEALOS_IMAGE);

  return {
    provider: 'sealosdevbox',
    defaultImage,
    workDirectory,
    entrypoint: '',
    skillsRootPath: getSandboxSkillsRootPath(workDirectory),
    buildConfig(input = {}) {
      const createConfig = input.createConfig ?? {};
      const image = input.image ?? createConfig.image ?? defaultImage;
      const env = mergeStringRecord(createConfig.env, input.env);
      const metadata = mergeUnknownRecord(createConfig.metadata, input.metadata);
      // Sealos adapter 会把 workingDir 写入 CODEX_GATEWAY_CWD，让 exec/code-server 落在同一工作区。
      const workingDir = createConfig.workingDir ?? workDirectory;
      // upstreamID 绑定稳定 sessionId，便于 provider 侧复用/追踪同一业务运行态。
      const upstreamID = createConfig.upstreamID ?? input.sessionId;

      return {
        ...createConfig,
        ...(image ? { image } : {}),
        ...(env ? { env } : {}),
        ...(metadata ? { metadata } : {}),
        ...(workingDir ? { workingDir } : {}),
        ...(upstreamID ? { upstreamID } : {})
      };
    }
  };
}
