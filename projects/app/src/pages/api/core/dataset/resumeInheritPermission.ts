import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { resumeInheritPermission } from '@fastgpt/service/support/permission/inheritPermission';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
export type ResumeInheritPermissionQuery = {
  datasetId: string;
};
export type ResumeInheritPermissionBody = {};
// resume the dataset's inherit permission.
async function handler(
  req: ApiRequestProps<ResumeInheritPermissionBody, ResumeInheritPermissionQuery>
) {
  const { datasetId } = req.query;
  const { dataset } = await authDataset({
    datasetId,
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  if (dataset.parentId) {
    await resumeInheritPermission({
      resource: dataset,
      folderTypeList: [DatasetTypeEnum.folder],
      resourceType: PerResourceTypeEnum.dataset,
      resourceModel: MongoDataset
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
