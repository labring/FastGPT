import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { AgentAskPayload } from '../../domain/systemTool/ask';

/** piAgent 跨轮恢复所需的 provider 私有状态，由统一 AgentLoop 作为 opaque 数据透传。 */
export type PiAgentProviderState = {
  piMessages?: AgentMessage[];
  activePlan?: AgentPlanType;
  pendingAsk?: AgentAskPayload;
  pendingAskId?: string;
};
