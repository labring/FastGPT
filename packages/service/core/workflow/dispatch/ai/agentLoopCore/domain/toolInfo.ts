import type { localeType } from '@fastgpt/global/common/i18n/type';

export type AgentLoopCoreToolDisplayInfo = {
  name: string;
  avatar?: string;
  toolDescription?: string;
  /** 工具调用条目保留在 UI 中，但隐藏工具执行产生的子 assistant 响应。 */
  hideChildResponses?: boolean;
};

export type AgentLoopCoreSystemToolType = 'file' | 'sandbox' | 'datasetSearch';

export type AgentLoopCoreSystemToolInfo = AgentLoopCoreToolDisplayInfo & {
  type: AgentLoopCoreSystemToolType;
};

export type GetAgentLoopCoreToolInfoParams = {
  name: string;
  lang?: localeType;
};
