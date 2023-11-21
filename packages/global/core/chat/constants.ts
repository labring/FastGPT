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
    name: 'chat.logs.test'
  },
  [ChatSourceEnum.online]: {
    name: 'chat.logs.online'
  },
  [ChatSourceEnum.share]: {
    name: 'chat.logs.share'
  },
  [ChatSourceEnum.api]: {
    name: 'chat.logs.api'
  }
};

export const HUMAN_ICON = `/icon/human.svg`;
export const LOGO_ICON = `/icon/logo.svg`;

export const IMG_BLOCK_KEY = 'img-block';
export const FILE_BLOCK_KEY = 'file-block';
