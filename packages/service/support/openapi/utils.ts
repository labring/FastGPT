import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { ApiKeyScopeSchema } from '@fastgpt/global/support/openapi/schema';
import type { ApiKeyScope } from '@fastgpt/global/support/openapi/schema';
import type { OpenApiSchema } from '@fastgpt/global/support/openapi/type';
import { Types, type FilterQuery } from 'mongoose';

/**
 * 显式类型优先；缺 type 的历史 Key 统一沿用个人权限，旧 appId 仅规范化为默认应用。
 * null/空 appId 表示无默认目标；非法类型或应用绑定抛错，绝不把显式 app 降级为个人权限。
 */
export const resolveApiKeyScope = (record: { type?: unknown; appId?: unknown }): ApiKeyScope => {
  const hasAppId = record.appId !== undefined && record.appId !== null && record.appId !== '';
  // ObjectIdSchema 会归一化对象；原始凭证只接受 BSON ObjectId 或历史字符串，避免数组等被转成 ID。
  if (hasAppId && typeof record.appId !== 'string' && !(record.appId instanceof Types.ObjectId)) {
    throw new Error('Invalid API Key application ID');
  }
  const type = record.type === undefined ? ApiKeyTypeEnum.personal : record.type;
  const scope = ApiKeyScopeSchema.parse({
    type,
    ...(hasAppId
      ? type === ApiKeyTypeEnum.personal
        ? { defaultAppId: record.appId }
        : { appId: record.appId }
      : {})
  });
  if (scope.type === ApiKeyTypeEnum.app) return { ...scope, appId: scope.appId.toLowerCase() };
  return scope.defaultAppId ? { ...scope, defaultAppId: scope.defaultAppId.toLowerCase() } : scope;
};

/** 迁移补齐类型后，列表、限额、标签和清理统一按显式类型查询。 */
export const getOpenApiTypeFilter = (type: ApiKeyTypeEnum): FilterQuery<OpenApiSchema> => ({
  type
});

/** 迁移已将有效应用 ID 统一为 BSON ObjectId，直接匹配字段以利用应用索引。 */
export const getOpenApiAppIdFilter = (appIds: string[]): FilterQuery<OpenApiSchema> => ({
  appId: { $in: appIds.map((id) => new Types.ObjectId(id)) }
});
