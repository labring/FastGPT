import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { resumeInheritPermission } from '@fastgpt/service/support/permission/inheritPermission';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import {
  getResourceOwnedClbs,
  getDatasetEffectiveClbs
} from '@fastgpt/service/support/permission/controller';

export type ResumeCollectionInheritPermissionQuery = {};
export type ResumeCollectionInheritPermissionBody = {
  collectionId: string;
};

async function handler(
  req: ApiRequestProps<
    ResumeCollectionInheritPermissionBody,
    ResumeCollectionInheritPermissionQuery
  >
) {
  const { collectionId } = req.body;
  const { collection } = await authDatasetCollection({
    collectionId,
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  // API 知识库开启权限同步后，不支持在文件列表修改权限（ROOT_FOLDER 除外）
  if (
    collection.dataset.type === DatasetTypeEnum.apiDataset &&
    !!(collection.dataset.apiDatasetServer as any)?.apiServer?.permissionSync &&
    collection.apiFileId !== RootCollectionId
  ) {
    return Promise.reject(DatasetErrEnum.permissionSyncEnabled);
  }

  // Sync from parent collection if exists, otherwise from dataset
  const parentId = collection.parentId ? String(collection.parentId) : String(collection.datasetId);
  const parentResourceType = collection.parentId
    ? PerResourceTypeEnum.collection
    : PerResourceTypeEnum.dataset;

  const parentClbs =
    parentResourceType === PerResourceTypeEnum.dataset
      ? await getDatasetEffectiveClbs({
          datasetId: parentId,
          teamId: String(collection.teamId)
        })
      : await getResourceOwnedClbs({
          resourceId: parentId,
          teamId: String(collection.teamId),
          resourceType: parentResourceType
        });

  await resumeInheritPermission({
    resource: {
      _id: String(collection._id),
      type: collection.type,
      teamId: String(collection.teamId),
      parentId
    },
    folderTypeList: [DatasetCollectionTypeEnum.folder],
    resourceType: PerResourceTypeEnum.collection,
    resourceModel: MongoDatasetCollection,
    parentClbs
  });
}

export default NextAPI(handler);
