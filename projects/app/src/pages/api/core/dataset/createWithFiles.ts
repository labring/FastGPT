import { randomUUID } from 'node:crypto';
import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { NextAPI } from '@/service/middleware/entry';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import {
  DatasetTypeEnum,
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum,
  ChunkTriggerConfigTypeEnum,
  ChunkSettingModeEnum,
  DataChunkSplitModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  CreateDatasetWithFilesBodySchema,
  CreateDatasetWithFilesResponseSchema,
  type CreateDatasetWithFilesResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import {
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { checkTeamDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { getFileS3Key } from '@fastgpt/service/common/s3/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { refreshTrainingAuditTask } from '@fastgpt/service/core/dataset/training/audit';
import type { TeamAuditDetail } from '@fastgpt/global/support/user/audit/type';
import { addAuditLog, getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

async function handler(req: ApiRequestProps): Promise<CreateDatasetWithFilesResponse> {
  const { datasetParams, files } = parseApiInput({
    req,
    bodySchema: CreateDatasetWithFilesBodySchema
  }).body;
  const {
    parentId,
    name,
    avatar,
    vectorModelId,
    agentModelId,
    vlmModelId,
    sangforFileParseConfig
  } = datasetParams;
  const modelHandle = await getModelHandle();
  const vectorModelData =
    modelHandle.getEmbeddingModelData({ modelId: vectorModelId }, { optional: true }) ??
    modelHandle.getDefaultModelData('embedding');
  const agentModelData =
    modelHandle.getLLMModelData({ modelId: agentModelId }, { optional: true }) ??
    modelHandle.getDefaultModelData('llm');
  // 与普通创建入口一致：显式“不设置”必须保持禁用，只有省略参数才继承系统默认。
  const vlmModelData =
    vlmModelId === undefined
      ? modelHandle.getDefaultModelData('datasetImageLLM')
      : modelHandle.getVlmModelData({ modelId: vlmModelId }, { optional: true });

  const { teamId, tmbId, userId } = parentId
    ? await authDataset({
        req,
        datasetId: parentId,
        authToken: true,
        authApiKey: true,
        per: WritePermissionVal
      })
    : await authUserPer({
        req,
        authToken: true,
        authApiKey: true,
        per: TeamDatasetCreatePermissionVal
      });

  // check limit
  await checkTeamDatasetLimit(teamId);

  const auditTaskId = randomUUID();
  const chunkSize = 1024;
  const indexSize = 512;

  try {
    const result = await mongoSessionRun(async (session) => {
      // 1. Create dataset
      const [dataset] = await MongoDataset.create(
        [
          {
            ...parseParentIdInMongo(parentId),
            name,
            teamId,
            tmbId,
            vectorModelId: vectorModelData.modelId,
            agentModelId: agentModelData.modelId,
            ...(vlmModelData?.modelId && { vlmModelId: vlmModelData.modelId }),
            avatar,
            intro: '',
            type: DatasetTypeEnum.dataset,
            ...(sangforFileParseConfig && { sangforFileParseConfig })
          }
        ],
        { session, ordered: true }
      );

      // 2. Create permission
      await createResourceDefaultCollaborators({
        resource: dataset,
        resourceType: PerResourceTypeEnum.dataset,
        tmbId,
        session
      });

      // 3. Refresh avatar
      await getS3AvatarSource().refreshAvatar(avatar, undefined, session);

      // 4. Move temp files to dataset directory and create collections
      const bucket = new S3PrivateBucket();
      const auditDetails: TeamAuditDetail[] = [];

      for (const file of files) {
        if (!file.fileId.startsWith('temp/')) {
          return Promise.reject('Only temp files are supported');
        }

        const { fileKey: newKey } = getFileS3Key.dataset({
          datasetId: String(dataset._id),
          filename: file.name
        });

        await bucket.move({
          from: file.fileId,
          to: newKey
        });

        const { collectionId } = await createCollectionAndInsertData({
          dataset,
          createCollectionParams: {
            datasetId: dataset._id,
            teamId,
            tmbId,
            type: DatasetCollectionTypeEnum.file,
            name: file.name,
            fileId: newKey,
            metadata: {
              relatedImgId: newKey
            },
            trainingType: DatasetCollectionDataProcessModeEnum.chunk,
            chunkTriggerType: ChunkTriggerConfigTypeEnum.minSize,
            chunkTriggerMinSize: 1000,
            chunkSettingMode: ChunkSettingModeEnum.auto,
            chunkSplitMode: DataChunkSplitModeEnum.paragraph,
            chunkSize,
            indexSize,
            customPdfParse: false
          },
          session,
          audit: false,
          auditTaskId
        });
        auditDetails.push({
          resourceId: collectionId,
          resourceName: file.name,
          resourceType: 'collection',
          sourceType: 'file',
          sourceName: file.name,
          action: 'import',
          result: 'processing',
          processingParams: {
            trainingType: DatasetCollectionDataProcessModeEnum.chunk,
            chunkSize,
            indexSize
          }
        });
      }

      return {
        datasetId: dataset._id,
        name: dataset.name,
        avatar: dataset.avatar,
        vectorModel: {
          model: vectorModelData.model
        },
        auditDetails
      };
    });

    const { auditDetails, ...response } = result;

    // 事务提交后才写入导入事件：不会给失败的导入留下 processing 记录，
    // 也能拿到真实的 datasetId 和 collectionId；collectionName 存稳定枚举值，渲染时再翻译
    await addAuditLog({
      teamId,
      tmbId,
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      params: {
        datasetId: String(response.datasetId),
        datasetName: name,
        collectionName: 'dataset_files',
        sourceType: 'file',
        result: files.length === 0 ? 'success' : 'processing',
        insertLen: String(files.length),
        taskId: auditTaskId,
        details: auditDetails
      }
    }).catch((error) => {
      logger.warn('Dataset import audit create failed', { error, teamId, auditTaskId });
    });
    await refreshTrainingAuditTask(auditTaskId);

    // Track and audit log
    pushTrack.createDataset({
      type: DatasetTypeEnum.dataset,
      teamId,
      tmbId,
      uid: userId
    });

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.CREATE_DATASET,
        params: {
          datasetName: name,
          datasetType: getI18nDatasetType(DatasetTypeEnum.dataset)
        }
      });
    })();

    return CreateDatasetWithFilesResponseSchema.parse(response);
  } catch (error) {
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
