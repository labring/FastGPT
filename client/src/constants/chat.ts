export const NEW_CHATID_HEADER = 'response-new-chat-id';
export const QUOTE_LEN_HEADER = 'response-quote-len';
export const GUIDE_PROMPT_HEADER = 'response-guide-prompt';

export enum ChatRoleEnum {
  System = 'System',
  Human = 'Human',
  AI = 'AI'
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

export const HUMAN_ICON = `https://fastgpt.run/icon/human.png`;
export const LOGO_ICON = `https://fastgpt.run/imgs/modelAvatar.png`;
