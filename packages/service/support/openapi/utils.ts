import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { ApiKeyScopeSchema } from '@fastgpt/global/support/openapi/schema';
import type { ApiKeyScope } from '@fastgpt/global/support/openapi/schema';
import type { OpenApiSchema } from '@fastgpt/global/support/openapi/type';
import type { FilterQuery } from 'mongoose';

/**
 * 显式类型优先，仅缺 type 的旧记录按绑定分类；非法绑定或冲突抛错，不降级个人权限。
 * 历史 null/空 appId 保留在数据库中，返回的个人 scope 不包含这些兼容字段。
 */
export const resolveApiKeyScope = (record: { type?: unknown; appId?: unknown }): ApiKeyScope => {
  const hasAppId = record.appId !== undefined && record.appId !== null && record.appId !== '';
  return ApiKeyScopeSchema.parse({
    type:
      record.type === undefined
        ? hasAppId
          ? ApiKeyTypeEnum.app
          : ApiKeyTypeEnum.personal
        : record.type,
    ...(hasAppId ? { appId: record.appId } : {})
  });
};

/** 列表、限额、标签和清理统一兼容尚未完成回填的记录，不将异常显式类型纳入个人集合。 */
export const getOpenApiTypeFilter = (type: ApiKeyTypeEnum): FilterQuery<OpenApiSchema> => ({
  $or: [{ type }, { type: { $exists: false } }],
  appId:
    type === ApiKeyTypeEnum.personal
      ? { $in: [null, ''] }
      : { $type: 'string', $regex: /^[a-fA-F0-9]{24}$/ }
});
