import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { resumeInheritPermission } from '@fastgpt/service/support/permission/inheritPermission';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  ResumeDatasetInheritPermissionBodySchema,
  type ResumeDatasetInheritPermissionBody
} from '@fastgpt/global/openapi/core/dataset/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getResourceOwnedClbs } from '@fastgpt/service/support/permission/controller';
import { syncDatasetToCollections } from '@fastgpt/service/support/permission/collection/controller';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { calculateInheritedResourceCollaborators } from '@fastgpt/service/support/permission/resourcePermissionPolicy';

async function handler(req: ApiRequestProps<ResumeDatasetInheritPermissionBody>) {
  const { datasetId } = parseApiInput({
    req,
    bodySchema: ResumeDatasetInheritPermissionBodySchema
  }).body;
  const { dataset, teamId, tmbId } = await authDataset({
    datasetId,
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  const parentDataset = dataset.parentId
    ? await MongoDataset.findById(dataset.parentId, 'name').lean()
    : undefined;
  const parentResourceName = parentDataset?.name;
  if (dataset.parentId) {
    await mongoSessionRun(async (session) => {
      const [parentClbs, oldEffectiveClbs] = await Promise.all([
        getResourceOwnedClbs({
          teamId,
          resourceId: String(dataset.parentId),
          resourceType: PerResourceTypeEnum.dataset,
          session
        }),
        getResourceOwnedClbs({
          teamId,
          resourceId: datasetId,
          resourceType: PerResourceTypeEnum.dataset,
          session
        })
      ]);
      // 与 resumeResourcePermissionInheritance 内部重算公式一致：merge(父级, 自身独有位)
      const newEffectiveClbs = calculateInheritedResourceCollaborators({
        oldParentCollaborators: parentClbs,
        newParentCollaborators: parentClbs,
        childCollaborators: oldEffectiveClbs
      });

      // 先同步 collection 再写 dataset 树：syncDatasetToCollections 依赖后代 dataset 的变更前快照。
      await syncDatasetToCollections({
        teamId,
        datasetId: String(dataset._id),
        oldEffectiveClbs,
        newEffectiveClbs,
        session
      });
      await resumeInheritPermission({
        resource: dataset,
        folderTypeList: [DatasetTypeEnum.folder],
        resourceType: PerResourceTypeEnum.dataset,
        resourceModel: MongoDataset,
        session
      });
    });
  } else {
    await MongoDataset.updateOne(
      {
        _id: datasetId
      },
      {
        inheritPermission: true
      }
    );
  }

  // 权限恢复成功后才写入事件
  addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.RESUME_INHERIT_PERMISSION,
    resources: [{ datasetId: String(dataset._id) }],
    params: {
      targetResource: dataset.name,
      ...(parentResourceName !== undefined ? { parentResource: parentResourceName } : {})
    }
  });
}
export default NextAPI(handler);
