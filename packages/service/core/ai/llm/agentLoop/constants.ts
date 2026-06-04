import { i18nT } from '@fastgpt/global/common/i18n/utils';

export const AgentUsageModuleName = {
  agentCall: i18nT('account_usage:agent_call'),
  contextCompress: i18nT('account_usage:compress_llm_messages'),
  toolResponseCompress: i18nT('account_usage:tool_response_compress')
} as const;

export const AgentNodeResponseDisplay = {
  master: {
    moduleName: i18nT('chat:master_agent_call'),
    moduleLogo: 'core/app/type/agentFill'
  },
  plan: {
    moduleName: i18nT('chat:plan_agent'),
    moduleLogo: 'core/app/agent/child/plan'
  },
  ask: {
    moduleName: i18nT('chat:collect_questions'),
    moduleLogo: 'core/app/agent/child/plan'
  },
  contextCompress: {
    moduleName: i18nT('chat:compress_llm_messages'),
    moduleLogo: 'core/app/agent/child/contextCompress'
  },
  toolResponseCompress: {
    moduleName: i18nT('chat:tool_response_compress'),
    moduleLogo: 'core/app/agent/child/contextCompress'
  },
  readFile: {
    moduleName: i18nT('chat:read_file'),
    moduleLogo: 'core/workflow/template/readFiles'
  }
} as const;
