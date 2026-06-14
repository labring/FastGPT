import type { ChatItemMiniType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { UserError } from '@fastgpt/global/common/error/utils';
import { MongoChatItem } from '../chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

export const CHAT_DATA_ID_DUPLICATE_ERROR_MESSAGE = 'Chat dataId already exists';

/**
 * 单轮对话进入工作流前的 dataId 校验参数。
 *
 * 当前运行前唯一性只约束 AI responseChatItemId；Human 消息允许与 AI 消息使用同一个
 * dataId 表示同一轮对话。
 */
type ValidateChatRoundDataIdsParams = {
  appId: string;
  chatId: string;
  userContent: UserChatItemType & { dataId?: string };
  responseChatItemId?: string;
};

/** 过滤空值，避免未传 dataId 的旧调用或兼容数据参与重复判断。 */
const getValidDataIds = (dataIds: Array<string | undefined>) =>
  dataIds.filter((dataId): dataId is string => typeof dataId === 'string' && dataId.length > 0);

/** 返回列表中第一个重复的 dataId，用于生成稳定、可读的错误信息。 */
const findDuplicateDataId = (dataIds: string[]) => {
  const seen = new Set<string>();

  for (const dataId of dataIds) {
    if (seen.has(dataId)) return dataId;
    seen.add(dataId);
  }
};

/** 从历史消息上下文中提取有效 dataId，供新请求进入前做重复检查。 */
export const getChatMessagesDataIds = (chatMessages: ChatItemMiniType[]) =>
  getValidDataIds(chatMessages.map((item) => item.dataId));

/**
 * 校验本次请求体内部不能携带重复 dataId。
 *
 * 这是纯内存检查，用于在访问数据库前快速拦截明显错误；旧数据中缺失 dataId 的消息会被忽略。
 */
export const assertNoDuplicateChatDataIdsInRequest = (dataIds: Array<string | undefined>) => {
  const duplicateDataId = findDuplicateDataId(getValidDataIds(dataIds));

  if (duplicateDataId) {
    throw new UserError(`${CHAT_DATA_ID_DUPLICATE_ERROR_MESSAGE}: ${duplicateDataId}`);
  }
};

/**
 * 校验目标会话中是否已经存在任意相同 dataId 的 chat item。
 *
 * 这个方法不区分 Human/AI obj，适合通用历史消息场景；单轮工作流运行前的 AI response
 * dataId 校验应使用 validateChatRoundDataIds。
 */
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

/**
 * 校验本轮 AI responseChatItemId 是否已在当前会话中被占用。
 *
 * Human/AI 可以共用同一个 dataId 表示同一轮对话，所以这里仅检查 AI item，防止新的
 * AI placeholder 或最终回复覆盖已有 AI 消息。
 */
export const validateChatRoundDataIds = async ({
  appId,
  chatId,
  responseChatItemId
}: ValidateChatRoundDataIdsParams) => {
  if (!responseChatItemId) return;

  const existingChatItem = await MongoChatItem.findOne(
    {
      appId,
      chatId,
      obj: ChatRoleEnum.AI,
      dataId: responseChatItemId
    },
    'dataId'
  )
    .lean()
    .exec();

  if (existingChatItem?.dataId) {
    throw new UserError(`${CHAT_DATA_ID_DUPLICATE_ERROR_MESSAGE}: ${existingChatItem.dataId}`);
  }
};
