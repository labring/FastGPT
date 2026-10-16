import { randomUUID } from 'node:crypto';
import { NextAPI } from '@/service/middleware/entry';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import {
  ChunkSettingModeEnum,
  ChunkTriggerConfigTypeEnum,
  DataChunkSplitModeEnum,
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  DatasetTypeEnum
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
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';

import { getErrText } from '@fastgpt/global/common/error/utils';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { isAuthorizedTempFileS3Key } from '@fastgpt/service/common/s3/sources/temp/key';
import { getFileS3Key } from '@fastgpt/service/common/s3/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { startDatasetImportAudit } from '@fastgpt/service/core/dataset/audit';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { getAuthorizedModelIds } from '@fastgpt/service/support/permission/model/auth';
import { checkTeamDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { refreshTrainingAuditTask } from '@fastgpt/service/core/dataset/training/audit';
import type { TeamAuditDetail } from '@fastgpt/global/support/user/audit/type';
import { addAuditLog, getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';

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

  const { teamId, tmbId, userId, isRoot } = parentId
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

  const modelHandle = await getTeamModelHandle({ teamId });
  const authorizedIds = await getAuthorizedModelIds({
    actor: { teamId, tmbId, isRoot },
    handle: modelHandle
  });
  const vectorModelData =
    modelHandle.getModelData(
      { modelId: vectorModelId },
      { type: 'embedding', optional: true, authorizedIds }
    ) ?? modelHandle.getDefaultModelData('embedding', { authorizedIds });
  const agentModelData =
    modelHandle.getModelData(
      { modelId: agentModelId },
      { type: 'llm', optional: true, authorizedIds }
    ) ?? modelHandle.getDefaultModelData('llm', { authorizedIds });
  // 与普通创建入口一致：显式“不设置”必须保持禁用，只有省略参数才继承系统默认（无权限默认 VLM 自动降级为 undefined）。
  const vlmModelData =
    vlmModelId === undefined
      ? modelHandle.getDefaultModelData('datasetImageLLM', { authorizedIds })
      : modelHandle.getModelData(
          { modelId: vlmModelId },
          { type: 'llm', vision: true, optional: true, authorizedIds }
        );

  // check limit
  await checkTeamDatasetLimit(teamId);

  // fileId 由客户端传入，必须先绑定到当前团队，避免把其他团队的临时对象移入本团队。
  for (const file of files) {
    if (!isAuthorizedTempFileS3Key({ key: file.fileId, teamId })) {
      return Promise.reject(CommonErrEnum.unAuthFileKey);
    }
  }

  const auditTaskId = randomUUID();
  const chunkSize = 1024;
  const indexSize = 512;
  // 提前分配并复用 datasetId，使事务回滚后写入的失败审计仍能关联本次创建尝试。
  const datasetId = new Types.ObjectId();
  const pendingAuditDetails: TeamAuditDetail[] = files.map((file) => ({
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
  }));
  const failedAuditDetails = pendingAuditDetails.map((detail) => ({
    ...detail,
    result: 'failed'
  }));

  // 审计主记录必须早于创建 dataset/collection/训练任务的事务落库；事务结束后只做 CAS 更新。
  const importAudit = await startDatasetImportAudit({
    taskId: auditTaskId,
    teamId,
    tmbId,
    datasetId: String(datasetId),
    datasetName: name,
    collectionName: 'dataset_files',
    sourceType: 'file',
    insertLen: String(files.length),
    details: pendingAuditDetails
  });

  /** 事务失败后的审计是旁路写入，不能覆盖文件导入的原始异常。 */
  const writeFailedImportAudit = async (error: unknown) => {
    await importAudit.finish({
      result: 'failed',
      insertLen: String(files.length),
      successCount: '0',
      failedCount: String(files.length),
      sourceFailedCount: String(files.length),
      failureReason: getErrText(error),
      details: failedAuditDetails
    });
  };

  const result = await mongoSessionRun(async (session) => {
    // 1. Create dataset
    const [dataset] = await MongoDataset.create(
      [
        {
          _id: datasetId,
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
  }).catch(async (error) => {
    // Mongo 事务整体回滚后没有成功事件可供训练队列收口，CAS 收口预先创建的主审计为 terminal failed。
    await writeFailedImportAudit(error);
    throw error;
  });

  const { auditDetails, ...response } = result;

  // 事务提交后只通过 CAS 回填真实 collectionId 和 sourceFinished，避免训练任务先完成时丢失主审计。
  await importAudit.finish({
    result: files.length === 0 ? 'success' : 'processing',
    insertLen: String(files.length),
    successCount: String(files.length),
    failedCount: '0',
    sourceFailedCount: '0',
    details: auditDetails
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
}

export default NextAPI(handler);
