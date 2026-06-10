import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { checkInteractiveResponseStatus } from '@fastgpt/global/core/chat/utils';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { UserChatItemType } from '@fastgpt/global/core/chat/type';
import { MongoChatItem } from './chatItemSchema';

/**
 * 解析本轮 workflow 写入 nodeResponse 时应该归属的 AI chat item dataId。
 *
 * 交互 submit 会把结果追加到数据库最后一条 AI 消息，而不是新建 AI 消息；因此 runtime
 * 写 nodeResponse 前就必须使用旧 AI 消息的 dataId。交互 query 和普通对话仍使用客户端
 * 本轮 responseChatItemId，因为它们会新建 AI 消息。
 */
export const getInteractiveResponseStatus = ({
  interactive,
  userContent
}: {
  interactive?: WorkflowInteractiveResponseType;
  userContent: UserChatItemType;
}) => {
  if (!interactive) return;
  const { text } = chatValue2RuntimePrompt(userContent.value);

  return checkInteractiveResponseStatus({
    interactive,
    input: text
  });
};

export const resolveResponseChatItemId = async ({
  appId,
  chatId,
  responseChatItemId,
  interactive,
  userContent
}: {
  appId: string;
  chatId?: string;
  responseChatItemId: string;
  interactive?: WorkflowInteractiveResponseType;
  userContent: UserChatItemType;
}) => {
  if (!interactive || !chatId) return responseChatItemId;

  const status = getInteractiveResponseStatus({ interactive, userContent });
  if (status === 'query') return responseChatItemId;

  const chatItem = await MongoChatItem.findOne(
    {
      appId,
      chatId,
      obj: ChatRoleEnum.AI
    },
    'dataId'
  )
    .sort({ _id: -1 })
    .lean();

  return chatItem?.dataId || responseChatItemId;
};
