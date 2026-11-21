import { MongoChat } from '../../chat/chatSchema';
import { MongoChatItem } from '../../chat/chatItemSchema';
import { MongoChatItemResponse } from '../../chat/chatItemResponseSchema';
import { Types } from '../../../common/mongo';
import { readFromSecondary } from '../../../common/mongo/utils';
import { MongoAppVersion } from '../../app/version/schema';
import type { AppLogsListItemType } from '@fastgpt/global/openapi/core/app/log/api';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { FilterQuery } from 'mongoose';
import type { ChatSchemaType } from '@fastgpt/global/core/chat/type';

const APP_CHAT_LOG_BASE_PROJECTION = {
  _id: 1,
  chatId: 1,
  title: 1,
  customTitle: 1,
  source: 1,
  sourceName: 1,
  publishSource: 1,
  updateTime: 1,
  createTime: 1,
  errorCount: 1,
  outLinkUid: 1,
  tmbId: 1,
  'metadata.originIp': 1
} as const;

/** 列表与导出共用的 AI 响应耗时统计 $group 字段，确保计算口径一致。 */
const chatItemResponseTimeGroupFields = {
  totalResponseTime: {
    $sum: {
      $cond: [{ $eq: ['$obj', 'AI'] }, { $ifNull: ['$durationSeconds', 0] }, 0]
    }
  },
  aiMessageCount: {
    $sum: {
      $cond: [{ $eq: ['$obj', 'AI'] }, 1, 0]
    }
  }
};

/** 列表与导出共用的历史内联积分 $group 字段，避免口径漂移。 */
const chatItemLegacyPointsGroupField = {
  totalPointsFromChatItem: {
    $sum: {
      $reduce: {
        input: { $ifNull: ['$responseData', []] },
        initialValue: 0,
        in: { $add: ['$$value', { $ifNull: ['$$this.totalPoints', 0] }] }
      }
    }
  }
};

/** 构造按 appId + chatIds 批量聚合 chatitems / chatitemresponses 的统一过滤条件。 */
const buildAppChatItemBatchFilter = (appId: string, chatIds: string[]) => ({
  appId: new Types.ObjectId(appId),
  chatId: { $in: chatIds },
  $or: [{ sourceType: ChatSourceTypeEnum.app }, { sourceType: { $exists: false } }]
});

/** 计算单条日志的平均响应耗时（秒）。 */
export const computeAverageResponseTime = (totalResponseTime = 0, aiMessageCount = 0): number =>
  aiMessageCount > 0 ? totalResponseTime / aiMessageCount : 0;

type ChatItemPageStats = {
  _id: string;
  messageCount: number;
  totalResponseTime: number;
  aiMessageCount: number;
  adminMark: number;
  goodFeedback: number;
  badFeedback: number;
  customFeedback: number;
  totalPointsFromChatItem: number;
};

type ChatItemResponsePageStats = {
  _id: string;
  totalPointsFromResponse: number;
};

export type AppChatLogExportDoc = Pick<
  ChatSchemaType,
  | '_id'
  | 'chatId'
  | 'title'
  | 'customTitle'
  | 'source'
  | 'sourceName'
  | 'publishSource'
  | 'updateTime'
  | 'createTime'
  | 'errorCount'
  | 'outLinkUid'
  | 'tmbId'
> & {
  appVersionId?: string | Types.ObjectId;
  variables?: Record<string, any>;
  metadata?: { originIp?: string };
};

export type ExportChatItemBatchStats = {
  _id: string;
  messageCount: number;
  totalResponseTime?: number;
  aiMessageCount?: number;
  totalPointsFromChatItem?: number;
  chatDetails: Array<{ id: Types.ObjectId; value: any }>;
  userGoodFeedbackItems?: Array<{ _id: Types.ObjectId; userGoodFeedback: any }>;
  userBadFeedbackItems?: Array<{ _id: Types.ObjectId; userBadFeedback: any }>;
  customFeedbackItems?: Array<{ _id: Types.ObjectId; customFeedbacks: any }>;
  markItems?: Array<{ _id: Types.ObjectId; adminFeedback: any }>;
};

/** 批量统计一页会话在 chatitems 中的消息、耗时、反馈与历史内联积分（弱一致性只读从库）。 */
const findChatItemPageStatsMap = async ({
  appId,
  chatIds
}: {
  appId: string;
  chatIds: string[];
}): Promise<Map<string, ChatItemPageStats>> => {
  if (chatIds.length === 0) return new Map();

  const stats = await MongoChatItem.aggregate<ChatItemPageStats>(
    [
      { $match: buildAppChatItemBatchFilter(appId, chatIds) },
      {
        $group: {
          _id: '$chatId',
          messageCount: { $sum: 1 },
          ...chatItemResponseTimeGroupFields,
          adminMark: {
            $sum: {
              $cond: [{ $ifNull: ['$adminFeedback', false] }, 1, 0]
            }
          },
          goodFeedback: {
            $sum: {
              $cond: [{ $ifNull: ['$userGoodFeedback', false] }, 1, 0]
            }
          },
          badFeedback: {
            $sum: {
              $cond: [{ $ifNull: ['$userBadFeedback', false] }, 1, 0]
            }
          },
          customFeedback: {
            $sum: { $size: { $ifNull: ['$customFeedbacks', []] } }
          },
          ...chatItemLegacyPointsGroupField
        }
      }
    ],
    { ...readFromSecondary }
  );

  return new Map(stats.map((item) => [item._id, item]));
};

/** 批量统计一组会话在 chatitemresponses 中的节点总积分（弱一致性只读从库）。 */
export const findChatResponsePointsMap = async ({
  appId,
  chatIds
}: {
  appId: string;
  chatIds: string[];
}): Promise<Map<string, number>> => {
  if (chatIds.length === 0) return new Map();

  const stats = await MongoChatItemResponse.aggregate<ChatItemResponsePageStats>(
    [
      { $match: buildAppChatItemBatchFilter(appId, chatIds) },
      {
        $group: {
          _id: '$chatId',
          totalPointsFromResponse: {
            $sum: { $ifNull: ['$data.totalPoints', 0] }
          }
        }
      }
    ],
    { ...readFromSecondary }
  );

  return new Map(stats.map((item) => [item._id, item.totalPointsFromResponse || 0]));
};

const queryAppVersionNamesByIds = async (
  versionIds: string[]
): Promise<Map<string, string | null>> => {
  if (versionIds.length === 0) return new Map();

  const versions = await MongoAppVersion.find(
    { _id: { $in: versionIds } },
    { _id: 1, versionName: 1 },
    readFromSecondary
  ).lean();

  return new Map(versions.map((version) => [String(version._id), version.versionName ?? null]));
};

/** 批量回表查询应用版本名映射。 */
export const findAppVersionNameMap = (
  rawVersionIds: Iterable<string | Types.ObjectId | null | undefined>
): Promise<Map<string, string | null>> => {
  const versionIds = Array.from(
    new Set(
      Array.from(rawVersionIds)
        .filter((id): id is string | Types.ObjectId => Boolean(id))
        .map((id) => String(id))
    )
  );
  return queryAppVersionNamesByIds(versionIds);
};

/**
 * 面向多批次流式导出的版本名加载器：
 * - 仅将从库实际命中的结果写入长期缓存；
 * - 从库未命中 ID 不做永久负缓存，而是按批次指数退避（1 -> 2 -> 4 -> ... -> maxMissBackoffBatches）
 *   或在超过 missRetryTtlMs 后重新探测，兼顾跨多批复制延迟追平与已删历史版本查询降频。
 */
export const createAppVersionNameLoader = ({
  maxMissBackoffBatches = 64,
  missRetryTtlMs = 5000,
  now = () => Date.now()
}: {
  maxMissBackoffBatches?: number;
  missRetryTtlMs?: number;
  now?: () => number;
} = {}) => {
  const resolvedMap = new Map<string, string>();
  const missState = new Map<
    string,
    { missCount: number; nextRetryBatch: number; nextRetryAt: number }
  >();
  let batchIndex = 0;

  const preload = async (rawVersionIds: Iterable<string | Types.ObjectId | null | undefined>) => {
    batchIndex += 1;
    const currentTime = now();
    const queryIdSet = new Set<string>();
    for (const rawId of rawVersionIds) {
      if (!rawId) continue;
      const id = String(rawId);
      if (resolvedMap.has(id) || queryIdSet.has(id)) continue;
      const state = missState.get(id);
      if (!state || batchIndex >= state.nextRetryBatch || currentTime >= state.nextRetryAt) {
        queryIdSet.add(id);
      }
    }
    const queryIds = Array.from(queryIdSet);
    if (queryIds.length === 0) return;

    const fetchedMap = await queryAppVersionNamesByIds(queryIds);
    const finishedAt = now();
    const cappedMaxBackoff = Math.max(1, maxMissBackoffBatches);

    for (const requestedId of queryIds) {
      if (fetchedMap.has(requestedId)) {
        resolvedMap.set(requestedId, fetchedMap.get(requestedId) || '');
        missState.delete(requestedId);
        continue;
      }
      const missCount = (missState.get(requestedId)?.missCount ?? 0) + 1;
      const backoffBatches = Math.min(cappedMaxBackoff, 2 ** Math.min(missCount - 1, 30));
      missState.set(requestedId, {
        missCount,
        nextRetryBatch: batchIndex + backoffBatches,
        nextRetryAt: finishedAt + missRetryTtlMs
      });
    }
  };

  const get = (rawVersionId: string | Types.ObjectId | null | undefined): string => {
    if (!rawVersionId) return '';
    return resolvedMap.get(String(rawVersionId)) ?? '';
  };

  return { preload, get };
};

/** 按导出列按需批量聚合 chatitems 详情、反馈、响应时长与历史内联积分。 */
export const findExportChatItemStatsMap = async ({
  appId,
  chatIds,
  needResponseTime,
  needPoints,
  needFeedback,
  needCustomFeedback,
  needAnnotated
}: {
  appId: string;
  chatIds: string[];
  needResponseTime: boolean;
  needPoints: boolean;
  needFeedback: boolean;
  needCustomFeedback: boolean;
  needAnnotated: boolean;
}): Promise<Map<string, ExportChatItemBatchStats>> => {
  if (chatIds.length === 0) return new Map();

  const needFeedbackMeta = needFeedback || needCustomFeedback || needAnnotated;
  const groupStage: Record<string, any> = {
    _id: '$chatId',
    messageCount: { $sum: 1 },
    chatDetails: {
      $push: {
        id: '$_id',
        value: '$value'
      }
    }
  };
  if (needResponseTime) {
    Object.assign(groupStage, chatItemResponseTimeGroupFields);
  }
  if (needPoints) {
    Object.assign(groupStage, chatItemLegacyPointsGroupField);
  }
  if (needFeedbackMeta) {
    groupStage.feedbackMeta = {
      $push: {
        _id: '$_id',
        ...(needFeedback
          ? {
              userGoodFeedback: '$userGoodFeedback',
              userBadFeedback: '$userBadFeedback'
            }
          : {}),
        ...(needCustomFeedback ? { customFeedbacks: '$customFeedbacks' } : {}),
        ...(needAnnotated ? { adminFeedback: '$adminFeedback' } : {})
      }
    };
  }

  const projectStage: Record<string, any> = {
    _id: 1,
    messageCount: 1,
    chatDetails: { $slice: ['$chatDetails', -100] }
  };
  if (needResponseTime) {
    projectStage.totalResponseTime = 1;
    projectStage.aiMessageCount = 1;
  }
  if (needPoints) {
    projectStage.totalPointsFromChatItem = 1;
  }
  if (needFeedback) {
    projectStage.userGoodFeedbackItems = {
      $filter: {
        input: '$feedbackMeta',
        as: 'item',
        cond: { $ifNull: ['$$item.userGoodFeedback', false] }
      }
    };
    projectStage.userBadFeedbackItems = {
      $filter: {
        input: '$feedbackMeta',
        as: 'item',
        cond: { $ifNull: ['$$item.userBadFeedback', false] }
      }
    };
  }
  if (needCustomFeedback) {
    projectStage.customFeedbackItems = {
      $filter: {
        input: '$feedbackMeta',
        as: 'item',
        cond: { $gt: [{ $size: { $ifNull: ['$$item.customFeedbacks', []] } }, 0] }
      }
    };
  }
  if (needAnnotated) {
    projectStage.markItems = {
      $filter: {
        input: '$feedbackMeta',
        as: 'item',
        cond: { $ifNull: ['$$item.adminFeedback', false] }
      }
    };
  }

  const stats = await MongoChatItem.aggregate<ExportChatItemBatchStats>(
    [
      { $match: buildAppChatItemBatchFilter(appId, chatIds) },
      { $sort: { _id: 1 } },
      { $group: groupStage },
      { $project: projectStage }
    ],
    { ...readFromSecondary, allowDiskUse: true }
  );

  return new Map(stats.map((item) => [item._id, item]));
};

/** 创建流式日志导出主游标，按列需求最小化投影避免读取无关大字段。 */
export const createAppChatLogExportCursor = ({
  filter,
  needVersionName,
  needVariables,
  limit = 50000,
  batchSize = 1000
}: {
  filter: FilterQuery<ChatSchemaType>;
  needVersionName: boolean;
  needVariables: boolean;
  limit?: number;
  batchSize?: number;
}) =>
  MongoChat.find(
    filter,
    {
      ...APP_CHAT_LOG_BASE_PROJECTION,
      ...(needVariables ? { variables: 1 } : {}),
      ...(needVersionName ? { appVersionId: 1 } : {})
    },
    readFromSecondary
  )
    .sort({ updateTime: -1 })
    .limit(limit)
    .lean<AppChatLogExportDoc>()
    .cursor({ batchSize });

/** 聚合一页应用日志原始行，统计消息、反馈、积分和版本展示数据。 */
export const findAppChatLogPage = async ({
  appId,
  filter,
  sort,
  skip,
  limit
}: {
  appId: string;
  filter: FilterQuery<ChatSchemaType>;
  sort: Record<string, 1 | -1>;
  skip: number;
  limit: number;
}) => {
  const chats = await MongoChat.find(
    filter,
    {
      ...APP_CHAT_LOG_BASE_PROJECTION,
      appVersionId: 1
    },
    readFromSecondary
  )
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  if (chats.length === 0) return [];

  const chatIds = Array.from(new Set(chats.map((chat) => chat.chatId).filter(Boolean)));

  const [itemStatsMap, responsePointsMap, versionNameMap] = await Promise.all([
    findChatItemPageStatsMap({ appId, chatIds }),
    findChatResponsePointsMap({ appId, chatIds }),
    findAppVersionNameMap(chats.map((chat) => chat.appVersionId))
  ]);

  return chats.map((chat): AppLogsListItemType => {
    const itemStats = itemStatsMap.get(chat.chatId);
    const averageResponseTime = computeAverageResponseTime(
      itemStats?.totalResponseTime,
      itemStats?.aiMessageCount
    );
    const totalPoints =
      (itemStats?.totalPointsFromChatItem ?? 0) + (responsePointsMap.get(chat.chatId) ?? 0);
    const versionName = chat.appVersionId
      ? (versionNameMap.get(String(chat.appVersionId)) ?? null)
      : null;

    return {
      _id: String(chat._id),
      chatId: chat.chatId,
      title: chat.title,
      customTitle: chat.customTitle,
      source: chat.source,
      sourceName: chat.sourceName,
      publishSource: chat.publishSource,
      updateTime: chat.updateTime,
      createTime: chat.createTime,
      messageCount: itemStats?.messageCount ?? 0,
      userGoodFeedbackCount: itemStats?.goodFeedback ?? 0,
      userBadFeedbackCount: itemStats?.badFeedback ?? 0,
      customFeedbacksCount: itemStats?.customFeedback ?? 0,
      markCount: itemStats?.adminMark ?? 0,
      averageResponseTime,
      errorCount: chat.errorCount ?? 0,
      totalPoints,
      outLinkUid: chat.outLinkUid,
      tmbId: chat.tmbId === null || chat.tmbId === undefined ? null : String(chat.tmbId),
      versionName,
      region: chat.metadata?.originIp
    };
  });
};

/** 统计当前筛选条件下的日志总数。 */
export const countAppChatLogs = (filter: FilterQuery<ChatSchemaType>) =>
  MongoChat.countDocuments(filter, { ...readFromSecondary });
