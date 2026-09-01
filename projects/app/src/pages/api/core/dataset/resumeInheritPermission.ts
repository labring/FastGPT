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

async function handler(req: ApiRequestProps<ResumeDatasetInheritPermissionBody>) {
  const { datasetId } = parseApiInput({
    req,
    bodySchema: ResumeDatasetInheritPermissionBodySchema
  }).body;
  const { dataset, teamId } = await authDataset({
    datasetId,
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  if (dataset.parentId) {
    await mongoSessionRun(async (session) => {
      // 恢复继承会重算 dataset 自身快照（旧独立快照 → merge(父级, 自身) 全量快照），
      // 同一事务内读取变更前后有效 clbs 并跨树重物化其下 collection 快照。
      const oldEffectiveClbs = await getResourceOwnedClbs({
        teamId,
        resourceId: datasetId,
        resourceType: PerResourceTypeEnum.dataset,
        session
      });
      await resumeInheritPermission({
        resource: dataset,
        folderTypeList: [DatasetTypeEnum.folder],
        resourceType: PerResourceTypeEnum.dataset,
        resourceModel: MongoDataset,
        session
      });
      const newEffectiveClbs = await getResourceOwnedClbs({
        teamId,
        resourceId: datasetId,
        resourceType: PerResourceTypeEnum.dataset,
        session
      });
      await syncDatasetToCollections({
        teamId,
        datasetId: String(dataset._id),
        oldEffectiveClbs,
        newEffectiveClbs,
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
}
export default NextAPI(handler);
