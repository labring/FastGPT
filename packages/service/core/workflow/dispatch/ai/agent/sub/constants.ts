import { i18nT } from '../../../../../../../web/i18n/utils';

export enum SubAppIds {
  plan = 'plan_agent',
  ask = 'ask_agent',
  model = 'model_agent',
  fileRead = 'file_read'
}

export const systemSubInfo: Record<
  string,
  { name: string; avatar: string; toolDescription: string }
> = {
  [SubAppIds.plan]: {
    name: i18nT('chat:plan_agent'),
    avatar: 'common/detail',
    toolDescription:
      '将任务拆解成多个步骤，并给出每个步骤的描述和执行工具。当任务较为复杂，并且需要多轮运行时，执行该工具。或者当用户已经有明确流程时，也调用该工具进行流程化运行。'
  },
  [SubAppIds.fileRead]: {
    name: i18nT('chat:file_parse'),
    avatar: 'core/workflow/template/readFiles',
    toolDescription: '读取文件内容，并返回文件内容。'
  },
  [SubAppIds.ask]: {
    name: 'Ask Agent',
    avatar: 'core/workflow/template/agent',
    toolDescription: '询问用户问题，并返回用户回答。'
  },
  [SubAppIds.model]: {
    name: 'Model Agent',
    avatar: 'core/workflow/template/agent',
    toolDescription: '调用 LLM 模型完成一些通用任务。'
  }
};
