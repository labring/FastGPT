/**
 * Service helpers for persisting per-chat generate status.
 * Used by stream resume, sidebar polling, and stale-generating correction paths.
 */
import { MongoChat } from './chatSchema';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';

type EnsureGenerateChatParams = {
  appId: string;
  chatId: string;
  teamId: string;
  tmbId: string;
  source: string;
  sourceName?: string;
  shareId?: string;
  outLinkUid?: string;
};

const buildGeneratingChatUpdate = (params: EnsureGenerateChatParams) => {
  const now = new Date();

  return {
    now,
    $set: {
      ...params,
      updateTime: now,
      hasBeenRead: false,
      chatGenerateStatus: ChatGenerateStatusEnum.generating
    },
    $setOnInsert: {
      createTime: now
    }
  };
};

export const ensureGenerateChat = async (params: EnsureGenerateChatParams) => {
  const { $set, $setOnInsert } = buildGeneratingChatUpdate(params);

  await MongoChat.updateOne(
    {
      appId: params.appId,
      chatId: params.chatId
    },
    {
      $set,
      $setOnInsert
    },
    {
      upsert: true
    }
  );
};

/**
 * 尝试占用一次会话生成槽。
 *
 * 同一个 `appId/chatId` 只允许一个请求进入生成中状态；已有 generating 记录时返回 false，
 * 由 API 层转换为“当前会话正在运行”的错误。
 *
 * 这里用“条件匹配 + upsert + 唯一索引”实现无副作用抢占：只有非 generating
 * 记录会被更新为 generating；如果已有 generating 记录，查询不会命中，upsert 会因
 * `{ appId, chatId }` 唯一索引报 11000，再转换为 false。这样被拒绝的并发请求不会刷新
 * updateTime 或覆盖 source/sourceName。
 */
export const tryStartGenerateChat = async (params: EnsureGenerateChatParams) => {
  const { $set, $setOnInsert } = buildGeneratingChatUpdate(params);

  try {
    await MongoChat.findOneAndUpdate(
      {
        appId: params.appId,
        chatId: params.chatId,
        chatGenerateStatus: { $ne: ChatGenerateStatusEnum.generating }
      },
      {
        $set,
        $setOnInsert
      },
      {
        upsert: true,
        new: false
      }
    ).lean();

    return true;
  } catch (error: any) {
    if (error?.code === 11000) {
      return false;
    }
    throw error;
  }
};

type UpdateChatGenerateStatusParams = Pick<EnsureGenerateChatParams, 'appId' | 'chatId'> & {
  status: ChatGenerateStatusEnum;
  /** 若传入则覆盖；否则在 done/error 时默认未读（前台看完可再调 markRead） */
  hasBeenRead?: boolean;
};
export const updateChatGenerateStatus = async (params: UpdateChatGenerateStatusParams) => {
  const { appId, chatId, status, hasBeenRead } = params;
  const now = new Date();
  const $set: Record<string, unknown> = {
    chatGenerateStatus: status,
    updateTime: now
  };
  if (hasBeenRead !== undefined) {
    $set.hasBeenRead = hasBeenRead;
  } else if (status === ChatGenerateStatusEnum.done || status === ChatGenerateStatusEnum.error) {
    $set.hasBeenRead = false;
  }
  await MongoChat.updateOne({ appId, chatId }, { $set });
};
