import type { localeType } from '@fastgpt/global/common/i18n/type';

export type AgentLoopCoreToolDisplayInfo = {
  name: string;
  avatar?: string;
  /** @deprecated Unused now in favor of `intro` in node data. */
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
