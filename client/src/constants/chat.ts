import dayjs from 'dayjs';

export enum sseResponseEventEnum {
  error = 'error',
  answer = 'answer',
  chatResponse = 'chatResponse', //
  appStreamResponse = 'appStreamResponse', // sse response request
  moduleFetchResponse = 'moduleFetchResponse' // http module sse response
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
  'test' = 'test',
  online = 'online',
  share = 'share',
  api = 'api'
}

export const ChatSourceMap = {
  [ChatSourceEnum.test]: {
    name: '调试测试'
  },
  [ChatSourceEnum.online]: {
    name: '在线使用'
  },
  [ChatSourceEnum.share]: {
    name: '链接分享'
  },
  [ChatSourceEnum.api]: {
    name: 'API调用'
  }
};

export enum ChatModuleEnum {
  'AIChat' = 'AI Chat',
  'KBSearch' = 'KB Search',
  'CQ' = 'Classify Question',
  'Extract' = 'Content Extract'
}

export enum OutLinkTypeEnum {
  'share' = 'share',
  'iframe' = 'iframe'
}

export const HUMAN_ICON = `https://fastgpt.run/icon/human.png`;
export const LOGO_ICON = `https://fastgpt.run/icon/logo.png`;

export const getDefaultChatVariables = () => ({
  cTime: dayjs().format('YYYY/MM/DD HH:mm:ss')
});
