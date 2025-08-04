import { i18nT } from '../../../web/i18n/utils';

export enum ChatRoleEnum {
  System = 'System',
  Human = 'Human',
  AI = 'AI'
}
export const ChatRoleMap = {
  [ChatRoleEnum.System]: {
    name: '系统'
  },
  [ChatRoleEnum.Human]: {
    name: '用户'
  },
  [ChatRoleEnum.AI]: {
    name: 'AI'
  }
};

export enum ChatFileTypeEnum {
  image = 'image',
  file = 'file'
}
export enum ChatItemValueTypeEnum {
  text = 'text',
  file = 'file',
  tool = 'tool',
  interactive = 'interactive',
  reasoning = 'reasoning'
}

export enum ChatSourceEnum {
  test = 'test',
  online = 'online',
  share = 'share',
  api = 'api',
  cronJob = 'cronJob',
  team = 'team',
  feishu = 'feishu',
  official_account = 'official_account',
  wecom = 'wecom',
  mcp = 'mcp'
}

export const ChatSourceMap = {
  [ChatSourceEnum.test]: {
    name: i18nT('common:core.chat.logs.test'),
    color: '#5E8FFF'
  },
  [ChatSourceEnum.online]: {
    name: i18nT('common:core.chat.logs.online'),
    color: '#47B2FF'
  },
  [ChatSourceEnum.share]: {
    name: i18nT('common:core.chat.logs.share'),
    color: '#9E8DFB'
  },
  [ChatSourceEnum.api]: {
    name: i18nT('common:core.chat.logs.api'),
    color: '#D389F6'
  },
  [ChatSourceEnum.cronJob]: {
    name: i18nT('chat:source_cronJob'),
    color: '#FF81AE'
  },
  [ChatSourceEnum.team]: {
    name: i18nT('common:core.chat.logs.team'),
    color: '#42CFC6'
  },
  [ChatSourceEnum.feishu]: {
    name: i18nT('common:core.chat.logs.feishu'),
    color: '#39CC83'
  },
  [ChatSourceEnum.official_account]: {
    name: i18nT('common:core.chat.logs.official_account'),
    color: '#FDB022'
  },
  [ChatSourceEnum.wecom]: {
    name: i18nT('common:core.chat.logs.wecom'),
    color: '#FD853A'
  },
  [ChatSourceEnum.mcp]: {
    name: i18nT('common:core.chat.logs.mcp'),
    color: '#F97066'
  }
};

export enum ChatStatusEnum {
  loading = 'loading',
  running = 'running',
  finish = 'finish'
}
