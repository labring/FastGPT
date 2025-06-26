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
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
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

  // 检查是否传递的是目录（目录全选的情况）
  const isDirectorySelected =
    apiFiles.length === 1 && apiFiles[0].type === 'folder' && apiFiles[0].hasChild;

  const rootDirectoryId = isDirectorySelected ? 'SYSTEM_ROOT' : undefined;

  const startId =
    dataset.apiDatasetServer?.apiServer?.basePath ||
    dataset.apiDatasetServer?.yuqueServer?.basePath ||
    dataset.apiDatasetServer?.feishuServer?.folderToken;

  // Get all apiFileId with top level parent ID
  const getFilesRecursively = async (
    files: APIFileItemType[],
    topLevelParentId?: string
  ): Promise<(APIFileItemType & { apiFileParentId?: string })[]> => {
    const allFiles: (APIFileItemType & { apiFileParentId?: string })[] = [];

    for (const file of files) {
      // 如果目录是全选，则所有文件的顶级父目录ID都是该目录ID
      // 否则按照原来的逻辑确定顶级父目录ID
      let currentTopLevelParentId = isDirectorySelected
        ? rootDirectoryId
        : topLevelParentId || (file.hasChild ? file.id : undefined);

      // 为文件添加顶级父目录ID
      const fileWithParentId = {
        ...file,
        apiFileParentId: currentTopLevelParentId
      };

      allFiles.push(fileWithParentId);

      if (file.hasChild) {
        const folderFiles = await (
          await getApiDatasetRequest(dataset.apiDatasetServer)
        ).listFiles({ parentId: file.id });
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
      if (file.hasChild) {
        await createOneCollection({
          teamId,
          tmbId,
          session,
          name: file.name,
          type: DatasetCollectionTypeEnum.folder,
          datasetId: dataset._id,
          apiFileId: file.id === startId ? 'SYSTEM_ROOT' : file.id
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
