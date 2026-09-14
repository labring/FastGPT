import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { disableDatasetCollectionPermissions } from '@fastgpt/service/support/permission/collection/enable';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DisableCollectionPermissionBodySchema,
  DisableCollectionPermissionResponseSchema,
  type DisableCollectionPermissionBody,
  type DisableCollectionPermissionResponse
} from '@fastgpt/global/openapi/core/dataset/api';

/**
 * 关闭 dataset 的 collection 级权限：清理该 dataset 全部 collection 的权限配置
 * （删除 ACL 行 + `inheritPermission` 重置为继承态），最后置位开关为关闭。
 *
 * 权限：dataset `manage` 及以上。**破坏性操作**：会删除该知识库下所有文件/文件夹的协作者配置，
 * 前端必须二次确认；关闭后读路径全部短路到 dataset 有效权限，重新启用等价于首次启用（需重新物化）。
 */
async function handler(
  req: ApiRequestProps<DisableCollectionPermissionBody>
): Promise<DisableCollectionPermissionResponse> {
  const { datasetId } = parseApiInput({
    req,
    bodySchema: DisableCollectionPermissionBodySchema
  }).body;

  const { teamId } = await authDataset({
    req,
    authToken: true,
    datasetId,
    per: ManagePermissionVal
  });

  const { collectionCount } = await disableDatasetCollectionPermissions({
    teamId: String(teamId),
    datasetId: String(datasetId)
  });

  return DisableCollectionPermissionResponseSchema.parse({ collectionCount });
}

export default NextAPI(handler);
