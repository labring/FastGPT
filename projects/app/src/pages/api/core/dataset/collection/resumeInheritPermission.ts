import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/constants';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { resumeCollectionInheritPermission } from '@fastgpt/service/support/permission/collection/controller';
import {
  ResumeCollectionInheritPermissionBodySchema,
  type ResumeCollectionInheritPermissionBody
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { getDatasetCollectionPaths } from '@fastgpt/service/core/dataset/collection/paths';

async function handler(req: ApiRequestProps<ResumeCollectionInheritPermissionBody>) {
  const { collectionId } = parseApiInput({
    req,
    bodySchema: ResumeCollectionInheritPermissionBodySchema
  }).body;

  const { collection, teamId, tmbId } = await authDatasetCollection({
    collectionId,
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  // 恢复继承后跟随的上级：有父目录时取直接父目录，根集合时直接继承知识库。
  // getDatasetCollectionPaths 返回的是「以传入 id 为末端的祖先链」，因此传 parentId 后
  // 链末项正好是直接父目录，不含集合自身。
  const parentResource = collection.parentId
    ? await getDatasetCollectionPaths({ parentId: String(collection.parentId) })
        .then((paths) => paths.at(-1)?.parentName)
        .catch(() => undefined)
    : undefined;

  await resumeCollectionInheritPermission({
    collection: {
      _id: String(collection._id),
      tmbId: String(collection.tmbId),
      parentId: collection.parentId ? String(collection.parentId) : null,
      datasetId: String(collection.datasetId),
      type: collection.type,
      teamId: String(collection.teamId)
    }
  });

  void addAuditLog({
    tmbId,
    teamId,
    event: DatasetAuditEventEnum.DATASET_COLLECTION_PERMISSION_INHERITANCE_RESUME,
    params: {
      datasetName: collection.dataset.name,
      collectionName: collection.name,
      parentResource: parentResource ?? collection.dataset.name
    }
  });
}

export default NextAPI(handler);
