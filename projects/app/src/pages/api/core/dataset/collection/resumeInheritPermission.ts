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
import { addAuditLog, getI18nAuditResourceType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getDatasetCollectionPaths } from './paths';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

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

  const collectionPaths = await getDatasetCollectionPaths({
    parentId: String(collection._id)
  });
  const parentDatasetName = collectionPaths.at(-2)?.parentName ?? collection.dataset.name;
  const affectedResourceCount = await resumeCollectionInheritPermission({
    collection: {
      _id: String(collection._id),
      tmbId: String(collection.tmbId),
      parentId: collection.parentId ? String(collection.parentId) : null,
      datasetId: String(collection.datasetId),
      type: collection.type,
      teamId: String(collection.teamId)
    }
  });

  // 权限恢复成功后才写入事件；受影响数量包含当前 collection 及其继承子树。
  await addAuditLog({
    teamId,
    tmbId,
    scope: 'member',
    event: AuditEventEnum.RESUME_INHERIT_PERMISSION,
    params: {
      resourceType: getI18nAuditResourceType('dataset'),
      datasetId: String(collection.datasetId),
      datasetName: collection.dataset.name,
      targetPath: [collection.dataset.name, ...collectionPaths.map((path) => path.parentName)].join(
        '/'
      ),
      parentDatasetName,
      oldPermissionSource: 'self',
      newPermissionSource: 'parent',
      affectedResourceCount
    }
  }).catch((error) => {
    logger.error('Failed to write collection resume inherit permission audit log', {
      error,
      collectionId
    });
  });
}

export default NextAPI(handler);
