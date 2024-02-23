export enum ChatRoleEnum {
  System = 'System',
  Human = 'Human',
  AI = 'AI',
  Function = 'Function',
  Tool = 'Tool'
}
export const ChatRoleMap = {
  [ChatRoleEnum.System]: {
    name: '系统提示词'
  },
  [ChatRoleEnum.Human]: {
    name: '用户'
  },
  [ChatRoleEnum.AI]: {
    name: 'AI'
  },
  [ChatRoleEnum.Function]: {
    name: 'Function'
  },
  [ChatRoleEnum.Tool]: {
    name: 'Tool'
  }
};

export enum ChatSourceEnum {
  test = 'test',
  online = 'online',
  share = 'share',
  api = 'api'
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
  }
};

export enum ChatStatusEnum {
  loading = 'loading',
  running = 'running',
  finish = 'finish'
}

export const IMG_BLOCK_KEY = 'img-block';
export const FILE_BLOCK_KEY = 'file-block';

export const MARKDOWN_QUOTE_SIGN = 'QUOTE SIGN';
