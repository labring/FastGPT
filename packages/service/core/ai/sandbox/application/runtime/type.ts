import type { OpenSandboxClient } from '../../infrastructure/opensandbox/opensandbox';
import type { ResourceLimits, SandboxCreateSpec } from '../../infrastructure/opensandbox/type';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { SandboxResourceDoc } from '../../infrastructure/instance/repository';

export type SandboxClientQuery = {
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId?: string;
};

export type SandboxRuntimeOptions = {
  resourceLimits?: ResourceLimits;
  createConfig?: SandboxCreateSpec;
  onUpgrade?: () => void;
  onUpgradeComplete?: () => void;
};

/** 已建立团队归属的当前记录；历史原始记录在进入运行操作前完成转换。 */
export type OwnedSandboxResource = SandboxResourceDoc & { teamId: string };

/** 运行准备的结果同时返回持久化事实和连接，调用方无需再查远端或 volume。 */
export type PreparedSandboxRuntime = {
  resource: OwnedSandboxResource;
  opensandbox: OpenSandboxClient;
};
