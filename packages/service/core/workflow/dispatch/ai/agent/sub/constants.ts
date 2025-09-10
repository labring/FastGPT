import { i18nT } from '../../../../../../../web/i18n/utils';

export enum SubAppIds {
  plan = 'plan_agent',
  ask = 'ask_agent',
  stop = 'stop_agent',
  model = 'model_agent',
  fileRead = 'file_read'
}

export const systemSubInfo: Record<string, { name: string; avatar: string }> = {
  [SubAppIds.plan]: {
    name: i18nT('chat:plan_agent'),
    avatar: 'common/detail'
  },
  [SubAppIds.fileRead]: {
    name: i18nT('chat:file_parse'),
    avatar: 'core/workflow/template/readFiles'
  },
  [SubAppIds.ask]: {
    name: 'Ask Agent',
    avatar: 'core/workflow/template/agent'
  },
  [SubAppIds.stop]: {
    name: 'Stop Agent',
    avatar: 'core/workflow/template/agent'
  },
  [SubAppIds.model]: {
    name: 'Model Agent',
    avatar: 'core/workflow/template/agent'
  }
};
