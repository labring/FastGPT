import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { getErrResponse } from '@fastgpt/global/common/error/utils';

/** 判断发送失败是否因为同一个会话已有服务端生成任务。 */
export const isChatGeneratingError = (error: unknown) => {
  const errorResponse = getErrResponse(error);

  return (
    errorResponse === ChatErrEnum.chatIsGenerating ||
    errorResponse?.statusText === ChatErrEnum.chatIsGenerating ||
    errorResponse?.message === ChatErrEnum.chatIsGenerating
  );
};
