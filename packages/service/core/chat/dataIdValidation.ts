import type { ChatItemMiniType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { UserError } from '@fastgpt/global/common/error/utils';
import { MongoChatItem } from './chatItemSchema';

export const CHAT_DATA_ID_DUPLICATE_ERROR_MESSAGE = 'Chat dataId already exists';

type ValidateChatRoundDataIdsParams = {
  appId: string;
  chatId: string;
  userContent: UserChatItemType & { dataId?: string };
  responseChatItemId: string;
};

const getValidDataIds = (dataIds: Array<string | undefined>) =>
  dataIds.filter((dataId): dataId is string => typeof dataId === 'string' && dataId.length > 0);

const findDuplicateDataId = (dataIds: string[]) => {
  const seen = new Set<string>();

  for (const dataId of dataIds) {
    if (seen.has(dataId)) return dataId;
    seen.add(dataId);
  }
};

export const getChatMessagesDataIds = (chatMessages: ChatItemMiniType[]) =>
  getValidDataIds(chatMessages.map((item) => item.dataId));

export const assertNoDuplicateChatDataIdsInRequest = (dataIds: Array<string | undefined>) => {
  const duplicateDataId = findDuplicateDataId(getValidDataIds(dataIds));

  if (duplicateDataId) {
    throw new UserError(`${CHAT_DATA_ID_DUPLICATE_ERROR_MESSAGE}: ${duplicateDataId}`);
  }
};

export const assertNoExistingChatDataIds = async ({
  appId,
  chatId,
  dataIds
}: {
  appId: string;
  chatId: string;
  dataIds: Array<string | undefined>;
}) => {
  const validDataIds = getValidDataIds(dataIds);
  if (validDataIds.length === 0) return;

  const existingChatItem = await MongoChatItem.findOne(
    {
      appId,
      chatId,
      dataId: { $in: validDataIds }
    },
    'dataId'
  )
    .lean()
    .exec();

  if (existingChatItem?.dataId) {
    throw new UserError(`${CHAT_DATA_ID_DUPLICATE_ERROR_MESSAGE}: ${existingChatItem.dataId}`);
  }
};

export const validateChatRoundDataIds = async ({
  appId,
  chatId,
  userContent,
  responseChatItemId
}: ValidateChatRoundDataIdsParams) => {
  const currentRoundDataIds = [userContent.dataId, responseChatItemId];

  assertNoDuplicateChatDataIdsInRequest(currentRoundDataIds);

  await assertNoExistingChatDataIds({
    appId,
    chatId,
    dataIds: currentRoundDataIds
  });
};
