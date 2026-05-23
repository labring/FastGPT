import type { SandboxImageConfigType } from '@fastgpt/global/core/ai/skill/type';
import type { SandboxCreateSpec, SandboxProviderType } from '@fastgpt-sdk/sandbox-adapter';
import type { VolumeManagerResult } from '../../volume/service';

export type SandboxRuntimeScenario = 'runtime' | 'session-runtime' | 'edit-debug';

/**
 * FastGPT 运行态构造 sandbox 的统一入参。
 *
 * 上层只表达业务意图和通用 create spec；provider profile 负责把这些字段映射成
 * 当前 provider 真正支持的 createConfig。
 */
export type SandboxRuntimeCreateConfigInput = {
  scenario?: SandboxRuntimeScenario;
  sessionId?: string;
  image?: SandboxImageConfigType;
  entrypoint?: string | string[];
  env?: Record<string, string>;
  metadata?: Record<string, unknown>;
  createConfig?: SandboxCreateSpec;
  resourceLimits?: SandboxCreateSpec['resourceLimits'];
  volumes?: SandboxCreateSpec['volumes'];
  vmConfig?: Pick<VolumeManagerResult, 'volumes'> | undefined;
};

/**
 * FastGPT 对某个 sandbox provider 的运行态契约。
 *
 * provider 连接认证仍由 provider/config.ts 负责；这里只维护工作目录、技能根目录、
 * 默认镜像、入口脚本，以及统一 createConfig 到 provider create spec 的转换。
 */
export type SandboxRuntimeProfile = {
  provider: SandboxProviderType;
  defaultImage: SandboxImageConfigType;
  workDirectory: string;
  entrypoint: string;
  skillsRootPath: string;
  buildConfig: (input?: SandboxRuntimeCreateConfigInput) => SandboxCreateSpec | undefined;
};
