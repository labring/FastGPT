import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { enableDatasetCollectionPermissions } from '@fastgpt/service/support/permission/collection/enable';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  EnableCollectionPermissionBodySchema,
  EnableCollectionPermissionResponseSchema,
  type EnableCollectionPermissionBody,
  type EnableCollectionPermissionResponse
} from '@fastgpt/global/openapi/core/dataset/api';

/**
 * 启用 dataset 的 collection 级权限：物化该 dataset 全部 collection 快照，成功后置位开关。
 *
 * 权限：dataset `manage` 及以上（开关会改变整个知识库的权限解析模式，需知识库管理员操作）。
 * 语义：开关是 collection 级自定义权限的唯一入口；未启用时相关写路径（配置协作者 / 独立态 move /
 * 恢复继承 / 创建独立态 collection）都会被拒绝并提示先开启。
 *
 * 物化在请求内同步完成，开关最后置位：失败时读语义保持关闭态，重试即再执行一次（幂等）。
 */
async function handler(
  req: ApiRequestProps<EnableCollectionPermissionBody>
): Promise<EnableCollectionPermissionResponse> {
  const { datasetId } = parseApiInput({
    req,
    bodySchema: EnableCollectionPermissionBodySchema
  }).body;

  const { teamId } = await authDataset({
    req,
    authToken: true,
    datasetId,
    per: ManagePermissionVal
  });

  const { collectionCount } = await enableDatasetCollectionPermissions({
    teamId: String(teamId),
    datasetId: String(datasetId)
  });

  return EnableCollectionPermissionResponseSchema.parse({ collectionCount });
}

export default NextAPI(handler);
