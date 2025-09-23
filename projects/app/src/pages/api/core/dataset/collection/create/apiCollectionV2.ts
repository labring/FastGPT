import type { ApiDatasetCreateDatasetCollectionV2Params } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import {
  createCollectionAndInsertData,
  createOneCollection
} from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';

import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import type { APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { type DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import type { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';

async function handler(req: ApiRequestProps<ApiDatasetCreateDatasetCollectionV2Params>) {
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: req.body.datasetId,
    per: WritePermissionVal
  });

  return createApiDatasetCollection({
    ...req.body,
    teamId,
    tmbId,
    dataset
  });
}

export default NextAPI(handler);

export const createApiDatasetCollection = async ({
  apiFiles,
  customPdfParse,
  teamId,
  tmbId,
  dataset,
  ...body
}: ApiDatasetCreateDatasetCollectionV2Params & {
  teamId: string;
  tmbId: string;
  dataset: DatasetSchemaType & {
    permission: DatasetPermission;
  };
}) => {
  // FileId deduplication
  const existCollections = await MongoDatasetCollection.find(
    {
      teamId: dataset.teamId,
      datasetId: dataset._id
    },
    'apiFileId'
  ).lean();
  const existApiFileIdSet = new Set(existCollections.map((item) => item.apiFileId).filter(Boolean));

  const startId =
    dataset.apiDatasetServer?.apiServer?.basePath ||
    dataset.apiDatasetServer?.yuqueServer?.basePath ||
    dataset.apiDatasetServer?.feishuServer?.folderToken;

  // check if the directory is selected
  const isDirectorySelected = apiFiles.length === 1 && apiFiles[0].id === RootCollectionId;
  const rootDirectoryId = isDirectorySelected ? RootCollectionId : undefined;

  // Get all apiFileId with top level parent ID
  const getFilesRecursively = async (
    files: APIFileItemType[],
    topLevelParentId?: string
  ): Promise<(APIFileItemType & { apiFileParentId?: string })[]> => {
    const allFiles: (APIFileItemType & { apiFileParentId?: string })[] = [];

    for (const file of files) {
      // if the directory is selected, then the top level parent id of all files is the directory id
      // otherwise, determine the top level parent id according to the original logic
      const currentTopLevelParentId = (() => {
        if (topLevelParentId) return topLevelParentId;
        if (isDirectorySelected) return rootDirectoryId;
        if (file.hasChild) return file.id;
        return undefined;
      })();

      // Add parentId to file
      const fileWithParentId = {
        ...file,
        apiFileParentId: topLevelParentId
      };

      allFiles.push(fileWithParentId);

      if (file.hasChild) {
        const folderFiles = await (
          await getApiDatasetRequest(dataset.apiDatasetServer)
        ).listFiles({ parentId: file.id === RootCollectionId ? startId : file.id });
        const subFiles = await getFilesRecursively(folderFiles, currentTopLevelParentId);
        allFiles.push(...subFiles.filter((f) => f.type === 'file'));
      }
    }
    return allFiles;
  };
  const allFiles = await getFilesRecursively(apiFiles);

  const createFiles = allFiles.filter(
    (item, index, array) =>
      !existApiFileIdSet.has(item.id) && array.findIndex((file) => file.id === item.id) === index
  );

  return mongoSessionRun(async (session) => {
    for await (const file of createFiles) {
      // Create folder
      if (file.hasChild && file.type === 'folder') {
        await createOneCollection({
          teamId,
          tmbId,
          session,
          name: file.name,
          type: DatasetCollectionTypeEnum.folder,
          datasetId: dataset._id,
          apiFileId: file.id
        });
      }

      if (file.type === 'file') {
        await createCollectionAndInsertData({
          dataset,
          createCollectionParams: {
            ...body,
            teamId,
            tmbId,
            type: DatasetCollectionTypeEnum.apiFile,
            name: file.name,
            apiFileId: file.id,
            apiFileParentId: file.apiFileParentId,
            metadata: {
              relatedImgId: file.id
            },
            customPdfParse
          },
          session
        });
      }
    }
  });
};
