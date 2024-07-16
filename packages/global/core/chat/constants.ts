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
  tool = 'tool'
}

export enum ChatSourceEnum {
  test = 'test',
  online = 'online',
  share = 'share',
  api = 'api',
  team = 'team'
}
export const ChatSourceMap = {
  [ChatSourceEnum.test]: {
    name: 'core.chat.logs.test'
  },
  [ChatSourceEnum.online]: {
    name: 'core.chat.logs.online'
  },
  [ChatSourceEnum.share]: {
    name: 'core.chat.logs.share'
  },
  [ChatSourceEnum.api]: {
    name: 'core.chat.logs.api'
  },
  [ChatSourceEnum.team]: {
    name: 'core.chat.logs.team'
  }
};

export enum ChatStatusEnum {
  loading = 'loading',
  running = 'running',
  finish = 'finish'
}

export const MARKDOWN_QUOTE_SIGN = 'QUOTE SIGN';
