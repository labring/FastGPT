import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { AgentLoopPendingMainContext } from '../../domain';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';

/** piAgent 跨轮恢复所需的 provider 私有状态，由统一 AgentLoop 作为 opaque 数据透传。 */
export type PiAgentProviderState = {
  /** 新版 ask continuation，使用标准消息链，和 fastAgent 保持一致。 */
  pendingMainContext?: AgentLoopPendingMainContext;
  piMessages?: AgentMessage[];
  activePlan?: AgentPlanType;
};
