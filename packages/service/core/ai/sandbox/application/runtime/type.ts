import type { ResourceLimits, SandboxCreateSpec, ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { SandboxProviderType } from '../../type';
import type { SandboxResourceDoc } from '../../infrastructure/instance/repository';

export type SandboxClientQuery = {
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId?: string;
};

export type SandboxRuntimeOptions = {
  providerName?: SandboxProviderType;
  resourceLimits?: ResourceLimits;
  createConfig?: SandboxCreateSpec;
  onUpgrade?: () => void;
};

/** 已建立团队归属的当前记录；历史原始记录在进入运行操作前完成转换。 */
export type OwnedSandboxResource = SandboxResourceDoc & { teamId: string };

/** 运行准备的结果同时返回持久化事实和连接，调用方无需再查 volume 或 Provider。 */
export type PreparedSandboxRuntime = {
  resource: OwnedSandboxResource;
  adapter: ISandbox;
};
