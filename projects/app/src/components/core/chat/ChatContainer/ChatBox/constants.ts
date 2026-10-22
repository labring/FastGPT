import { type BoxProps } from '@chakra-ui/react';

export const textareaMinH = '24px';

export const ChatBoxContentMaxWidth = '780px';

export const ChatInputDefaultHeight: BoxProps['h'] = '112px';

export const WorkflowBuilderChatInputDefaultHeight: BoxProps['h'] = '132px';

/**
 * 输入框仅在空态使用设计稿固定高度；出现文本或文件后必须恢复内容自适应，
 * 否则 textarea 增高时会穿过底部按钮栏和圆角边框。
 */
export const getChatInputContainerHeight = ({
  isDefaultInputHeight,
  workflowBuilderStyle
}: {
  isDefaultInputHeight: boolean;
  workflowBuilderStyle: boolean;
}): BoxProps['h'] => {
  if (!isDefaultInputHeight) return;

  return workflowBuilderStyle ? WorkflowBuilderChatInputDefaultHeight : ChatInputDefaultHeight;
};

export const HomeChatMobileBottomGap = 0;

export const HomeChatContentWrapperStyle: BoxProps = {
  px: ['16px', 4],
  pb: [HomeChatMobileBottomGap, 0],
  mx: 'auto',
  w: '100%',
  maxW: ['auto', 'min(820px, 100%)']
};

export const ChatInputWrapperStyle: BoxProps = {
  ...HomeChatContentWrapperStyle,
  flexShrink: 0
};

export const MessageCardStyle: BoxProps = {
  px: 4,
  py: 3,
  borderRadius: '0 8px 8px 8px',
  boxShadow: 'none',
  display: 'inline-block',
  maxW: ['calc(100% - 25px)', 'calc(100% - 40px)'],
  color: 'myGray.900'
};

export enum FeedbackTypeEnum {
  user = 'user',
  admin = 'admin',
  hidden = 'hidden'
}

export enum ChatTypeEnum {
  test = 'test',
  chat = 'chat',
  log = 'log',
  share = 'share',
  home = 'home'
}
