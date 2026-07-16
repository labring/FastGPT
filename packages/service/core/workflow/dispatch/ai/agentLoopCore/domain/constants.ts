import { i18nT } from '@fastgpt/global/common/i18n/utils';

/** Workflow 层由 Agent Loop 事件生成 nodeResponse 时使用的展示元数据。 */
export const AgentNodeResponseDisplay = {
  master: {
    moduleName: i18nT('chat:master_agent_call'),
    moduleLogo: 'core/app/type/agentFill'
  },
  piMaster: {
    moduleName: i18nT('chat:master_agent_call'),
    moduleLogo: 'core/app/type/agentFill'
  },
  plan: {
    moduleName: i18nT('chat:plan_update'),
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
