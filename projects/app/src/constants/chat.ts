import dayjs from 'dayjs';

export enum sseResponseEventEnum {
  error = 'error',
  answer = 'answer',
  moduleStatus = 'moduleStatus',
  appStreamResponse = 'appStreamResponse' // sse response request
}

export enum ChatRoleEnum {
  System = 'System',
  Human = 'Human',
  AI = 'AI'
}

export enum TaskResponseKeyEnum {
  'answerText' = 'answerText', //  answer module text key
  'responseData' = 'responseData'
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

export enum OutLinkTypeEnum {
  'share' = 'share',
  'iframe' = 'iframe',
  apikey = 'apikey'
}

export const HUMAN_ICON = `/icon/human.png`;
export const LOGO_ICON = `/icon/logo.svg`;
