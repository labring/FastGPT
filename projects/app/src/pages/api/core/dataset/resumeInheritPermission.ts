import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { resumeInheritPermission } from '@fastgpt/service/support/permission/inheritPermission';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getDatasetEffectiveClbs } from '@fastgpt/service/support/permission/controller';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

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

  if (!dataset.parentId) {
    return Promise.reject(new Error(CommonErrEnum.inheritPermissionError));
  }

  await mongoSessionRun(async (session) => {
    // 1. Resume dataset inherit permission
    await resumeInheritPermission({
      resource: dataset,
      folderTypeList: [DatasetTypeEnum.folder],
      resourceType: PerResourceTypeEnum.dataset,
      resourceModel: MongoDataset,
      session
    });

    // 2. Resume first-level collections under this dataset that have inheritPermission: true
    // syncChildrenPermission inside resumeInheritPermission will recursively handle deeper levels
    const allCollections = await MongoDatasetCollection.find(
      {
        datasetId,
        parentId: null,
        inheritPermission: true
      },
      '_id type teamId parentId'
    )
      .lean()
      .session(session);

    // Get effective clbs from dataset once (includes inherited parent clbs), pass to all collections
    const datasetClbs = await getDatasetEffectiveClbs({
      datasetId,
      teamId: String(dataset.teamId),
      session
    });

    for (const collection of allCollections) {
      await resumeInheritPermission({
        resource: {
          _id: String(collection._id),
          type: collection.type,
          teamId: String(collection.teamId),
          parentId: collection.parentId ? String(collection.parentId) : undefined
        },
        folderTypeList: [DatasetCollectionTypeEnum.folder, DatasetCollectionTypeEnum.virtual],
        resourceType: PerResourceTypeEnum.collection,
        resourceModel: MongoDatasetCollection,
        parentClbs: datasetClbs,
        session
      });
    }
  });
}

export default NextAPI(handler);
