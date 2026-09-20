import {
  CreateApiCollectionV2BodySchema,
  type CreateApiCollectionV2BodyType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { authDatasetCollectionCreate } from '@fastgpt/service/support/permission/dataset/auth';
import {
  createCollectionAndInsertData,
  createOneCollection
} from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';

import { NextAPI } from '@/service/middleware/entry';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import type { APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { type DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import type { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { randomUUID } from 'node:crypto';
import { refreshTrainingAuditTask } from '@fastgpt/service/core/dataset/training/audit';
import type { TeamAuditDetail } from '@fastgpt/global/support/user/audit/type';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

async function handler(req: ApiRequestProps<CreateApiCollectionV2BodyType>) {
  const body = parseApiInput({ req, bodySchema: CreateApiCollectionV2BodySchema }).body;

  const { teamId, tmbId, dataset } = await authDatasetCollectionCreate({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    parentId: body.parentId
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
    dataset.apiDatasetServer?.feishuServer?.folderToken ||
    dataset.apiDatasetServer?.dingtalkServer?.rootNodeId;

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

  const auditTaskId = randomUUID();
  const auditDetails = await mongoSessionRun(async (session) => {
    const details: TeamAuditDetail[] = [];
    for await (const file of createFiles) {
      // Create folder
      if (file.hasChild && file.type === 'folder') {
        const { _id } = await createOneCollection({
          teamId,
          tmbId,
          session,
          name: file.name,
          type: DatasetCollectionTypeEnum.folder,
          datasetId: dataset._id,
          apiFileId: file.id
        });
        details.push({
          resourceId: String(_id),
          resourceName: file.name,
          resourceType: 'folder',
          sourceType: 'api',
          sourceName: file.name,
          action: 'import',
          result: 'success'
        });
      }

      if (file.type === 'file') {
        const { collectionId } = await createCollectionAndInsertData({
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
          session,
          audit: false,
          auditTaskId
        });
        details.push({
          resourceId: collectionId,
          resourceName: file.name,
          resourceType: 'collection',
          sourceType: 'api',
          sourceName: file.name,
          action: 'import',
          result: 'processing'
        });
      }
    }
    return details;
  });

  // 事务提交后才写入导入事件，避免为失败的导入留下 processing 记录；
  // collectionName 存稳定枚举值，渲染时再翻译
  await addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.IMPORT_DATASET_CONTENT,
    params: {
      datasetId: String(dataset._id),
      datasetName: dataset.name,
      collectionName: 'api_files',
      sourceType: 'api',
      result: createFiles.length === 0 ? 'success' : 'processing',
      insertLen: String(createFiles.length),
      taskId: auditTaskId,
      details: auditDetails
    }
  }).catch((error) => {
    logger.warn('API dataset import audit create failed', { error, teamId, auditTaskId });
  });
  await refreshTrainingAuditTask(auditTaskId);
};
