import {
  CreateApiCollectionV2BodySchema,
  type CreateApiCollectionV2BodyType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
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
import {
  buildTree,
  syncCollectionPermissions
} from '@fastgpt/service/core/dataset/apiDataset/buildTree';
import type { TreeNode } from '@fastgpt/service/core/dataset/apiDataset/buildTree';
import type { APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { type DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import type { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';

async function handler(req: ApiRequestProps<CreateApiCollectionV2BodyType>) {
  const body = CreateApiCollectionV2BodySchema.parse(req.body);

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  // Check dataset limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: 1
  });

  return createApiDatasetCollection({
    ...body,
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
}: CreateApiCollectionV2BodyType & {
  teamId: string;
  tmbId: string;
  dataset: DatasetSchemaType & {
    permission: DatasetPermission;
  };
}) => {
  // Get existing collections with apiFileId and parentId for tree building
  const existCollections = await MongoDatasetCollection.find(
    {
      teamId: dataset.teamId,
      datasetId: dataset._id
    },
    'apiFileId parentId'
  ).lean();
  const existCollectionMap = new Map(
    existCollections
      .filter((item) => item.apiFileId)
      .map((item) => [
        item.apiFileId,
        { _id: item._id.toString(), parentId: item.parentId?.toString() || null }
      ])
  );

  const startId =
    dataset.apiDatasetServer?.apiServer?.basePath ||
    dataset.apiDatasetServer?.yuqueServer?.basePath ||
    dataset.apiDatasetServer?.feishuServer?.folderToken;

  const apiDatasetRequest = await getApiDatasetRequest(dataset.apiDatasetServer);
  const isPermissionSync = !!(dataset.apiDatasetServer as any)?.apiServer?.permissionSync;

  // Get all apiFileId with top level parent ID
  const getFilesRecursively = async (
    files: APIFileItemType[],
    topLevelParentId?: string
  ): Promise<(APIFileItemType & { apiFileParentId?: string })[]> => {
    const allFiles: (APIFileItemType & { apiFileParentId?: string })[] = [];

    for (const file of files) {
      // Add parentId to file
      const fileWithParentId = {
        ...file,
        apiFileParentId: topLevelParentId
      };

      allFiles.push(fileWithParentId);

      if (file.hasChild) {
        const folderFiles = await apiDatasetRequest.listFiles({
          parentId: file.id === RootCollectionId ? startId : file.id
        });
        const subFiles = await getFilesRecursively(folderFiles, file.id);
        allFiles.push(...subFiles);
      }
    }
    return allFiles;
  };
  // 文件夹
  // |-根目录 apiFileParentId SYSTEM_ROOT
  // |-非根目录 parentId notnull 可能不传，apiFileParentId null
  // 文件 parentId notnull，apiFileParentId null
  const allFiles = await getFilesRecursively(apiFiles);

  // Deduplicate within the same request
  const uniqueFiles = allFiles.filter(
    (item, index, array) => array.findIndex((file) => file.id === item.id) === index
  );

  // Collect items for permission sync after session completes
  const permissionSyncItems: {
    mongoId: string;
    file: APIFileItemType & { apiFileParentId?: string };
  }[] = [];

  await mongoSessionRun(async (session) => {
    const processTree = async (
      nodes: TreeNode<APIFileItemType & { apiFileParentId?: string }>[],
      parentMongoId: string | undefined
    ): Promise<void> => {
      for (const { file, children } of nodes) {
        const existing = existCollectionMap.get(file.id);
        const expectedParentId = parentMongoId || null;
        let mongoId: string | undefined;

        if (file.type === 'folder') {
          if (existing) {
            mongoId = existing._id;
            if (existing.parentId !== expectedParentId) {
              await MongoDatasetCollection.updateOne(
                { _id: mongoId },
                { $set: { parentId: expectedParentId } },
                { session }
              );
            }
          } else {
            const folderCollection = await createOneCollection({
              teamId,
              tmbId,
              session,
              name: file.name,
              type: DatasetCollectionTypeEnum.folder,
              datasetId: dataset._id,
              apiFileId: file.id,
              apiFileParentId: file.apiFileParentId,
              ...(parentMongoId && { parentId: parentMongoId }),
              skipPermissionCreate: isPermissionSync
            });
            mongoId = folderCollection._id.toString();
          }

          await processTree(children, mongoId);
        }

        if (file.type === 'file') {
          if (existing) {
            mongoId = existing._id;
            if (existing.parentId !== expectedParentId) {
              await MongoDatasetCollection.updateOne(
                { _id: existing._id },
                { $set: { parentId: expectedParentId } },
                { session }
              );
            }
          } else {
            const result = await createCollectionAndInsertData({
              dataset,
              createCollectionParams: {
                ...body,
                teamId,
                tmbId,
                type: DatasetCollectionTypeEnum.apiFile,
                name: file.name,
                apiFileId: file.id,
                apiFileParentId: file.apiFileParentId,
                ...(parentMongoId && { parentId: parentMongoId }),
                metadata: {
                  relatedImgId: file.id
                },
                customPdfParse
              },
              session
            });
            mongoId = result.collectionId;
          }
        }

        // Collect for permission sync after session completes
        if (mongoId && isPermissionSync) {
          permissionSyncItems.push({ mongoId, file });
        }
      }
    };

    const tree = buildTree(uniqueFiles, (f) => f.apiFileParentId);
    await processTree(tree, undefined);
  });

  // Sync external permissions after session commits (to avoid nested mongoSessionRun)
  if (isPermissionSync && permissionSyncItems.length > 0) {
    for (const item of permissionSyncItems) {
      await syncCollectionPermissions({
        mongoId: item.mongoId,
        file: item.file,
        apiDatasetRequest,
        teamId,
        isPermissionSync,
        datasetId: dataset._id
      });
    }
  }
};
