import type { localeType } from '@fastgpt/global/common/i18n/type';

export type AgentLoopCoreToolDisplayInfo = {
  name: string;
  avatar?: string;
  toolDescription?: string;
};

export type AgentLoopCoreSystemToolType = 'file' | 'sandbox' | 'datasetSearch';

export type AgentLoopCoreSystemToolInfo = AgentLoopCoreToolDisplayInfo & {
  type: AgentLoopCoreSystemToolType;
};

export type GetAgentLoopCoreToolInfoParams = {
  name: string;
  lang?: localeType;
};
