import { i18nT } from '../../../../../../../web/i18n/utils';

export enum SubAppIds {
  plan = 'plan_agent',
  ask = 'ask_agent',
  stop = 'stop_agent',
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
    toolDescription: '分析和拆解用户问题，制定分步计划。'
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
  [SubAppIds.stop]: {
    name: 'Stop Agent',
    avatar: 'core/workflow/template/agent',
    toolDescription: '停止当前任务。'
  },
  [SubAppIds.model]: {
    name: 'Model Agent',
    avatar: 'core/workflow/template/agent',
    toolDescription: '调用 LLM 模型完成一些通用任务。'
  }
};
