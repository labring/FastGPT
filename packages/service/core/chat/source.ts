import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { Types } from '../../common/mongo';

export type ChatSourceParams = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
};

export type BuildChatSourceQueryParams = ChatSourceParams & {
  legacySkillDebug?: boolean;
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
 * App 查询默认兼容缺失 `sourceType` 的历史数据；Skill Edit 必须精确匹配
 * `sourceType=skillEdit`。`legacySkillDebug` 仅用于上线初始化清理旧 Skill Debug 数据，
 * 不应出现在常规业务读取链路中。
 */
export function buildChatSourceQuery({
  sourceType,
  sourceId,
  legacySkillDebug = false
}: BuildChatSourceQueryParams) {
  if (legacySkillDebug) {
    return {
      appId: sourceId,
      source: ChatSourceEnum.test,
      sourceType: { $exists: false }
    };
  }

  if (sourceType === ChatSourceTypeEnum.app) {
    return {
      appId: sourceId,
      $or: [{ sourceType: ChatSourceTypeEnum.app }, { sourceType: { $exists: false } }]
    };
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    return {
      appId: sourceId,
      sourceType: ChatSourceTypeEnum.skillEdit
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
export function buildChatSourceAggregateMatch(params: BuildChatSourceQueryParams) {
  return {
    ...buildChatSourceQuery(params),
    appId: buildPhysicalSourceIdAggregateMatch(params.sourceId)
  };
}
