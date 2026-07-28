import { streamRawFetch } from '@/web/common/api/fetch';
import { batchDeleteChatHistories } from '@/web/core/chat/history/api';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import type { WorkflowBuilderChatBody } from '@fastgpt/global/openapi/core/workflow/builder/api';

export const streamWorkflowBuilderChat = ({
  data,
  onMessage,
  abortCtrl
}: {
  data: WorkflowBuilderChatBody;
  onMessage: StartChatFnProps['generatingMessage'];
  abortCtrl: AbortController;
}) =>
  streamRawFetch({
    url: '/api/proApi/core/workflow/builder/chat',
    data,
    onMessage,
    abortCtrl
  });

/** 服务端历史删除成功后重建 Builder 会话。 */
export const clearWorkflowBuilderChatHistory = async ({
  appId,
  chatId,
  clearChatRecords,
  restartChat
}: {
  appId: string;
  chatId: string;
  clearChatRecords: () => void;
  restartChat: () => void;
}) => {
  await batchDeleteChatHistories({
    appId,
    sourceType: ChatSourceTypeEnum.app,
    chatIds: [chatId]
  });
  clearChatRecords();
  restartChat();
};
