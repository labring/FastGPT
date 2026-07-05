import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { Types } from '../../common/mongo';

export type ChatSourceParams = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
};

/**
 * 将业务层 source 语义映射到 chat 三表的历史物理字段。
 *
 * 第一版不重命名 Mongo 字段，所有新写入仍写入 `appId`，但业务含义为
 * `sourceId`。调用方必须通过该 helper 写入，避免再次把 skillId 伪装成 appId。
 */
export function buildChatSourceWriteFields({ sourceType, sourceId }: ChatSourceParams) {
  return {
    sourceType,
    appId: sourceId
  };
}

/**
 * 构造 chat 三表 source-aware 查询条件。
 *
 * App 查询默认兼容缺失 `sourceType` 的历史数据；非 App 来源必须精确匹配
 * `sourceType`，避免不同资源类型复用同一物理 `appId` 字段时串记录。
 */
export function buildChatSourceQuery({ sourceType, sourceId }: ChatSourceParams) {
  if (sourceType === ChatSourceTypeEnum.app) {
    return {
      appId: sourceId,
      $or: [{ sourceType: ChatSourceTypeEnum.app }, { sourceType: { $exists: false } }]
    };
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit || sourceType === ChatSourceTypeEnum.helperBot) {
    return {
      appId: sourceId,
      sourceType
    };
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
}

const buildPhysicalSourceIdAggregateMatch = (sourceId: string) => {
  if (!Types.ObjectId.isValid(sourceId)) {
    return sourceId;
  }

  // Mongoose 不会自动 cast aggregate.$match，显式兼容 ObjectId 存量数据。
  return new Types.ObjectId(sourceId);
};

/**
 * 构造 aggregate.$match 使用的 chat source 条件。
 *
 * 与普通 query helper 语义一致，但会显式把 ObjectId 字符串转换成 ObjectId，
 * 避免聚合管线里无法命中历史 `appId` 物理字段。
 */
export function buildChatSourceAggregateMatch(params: ChatSourceParams) {
  return {
    ...buildChatSourceQuery(params),
    appId: buildPhysicalSourceIdAggregateMatch(params.sourceId)
  };
}
