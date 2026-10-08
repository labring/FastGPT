import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { authModelUse } from '@fastgpt/service/support/permission/model/controller';
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
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { getFileS3Key } from '@fastgpt/service/common/s3/utils';
import { isAuthorizedTempFileS3Key } from '@fastgpt/service/common/s3/sources/temp/key';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

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

  const modelHandle = await getModelHandle({ teamId });
  const rawVectorModelData =
    modelHandle.getEmbeddingModelData({ modelId: vectorModelId }, { optional: true }) ??
    modelHandle.getDefaultModelData('embedding');
  const rawAgentModelData =
    modelHandle.getLLMModelData({ modelId: agentModelId }, { optional: true }) ??
    modelHandle.getDefaultModelData('llm');
  // 与普通创建入口一致：显式“不设置”必须保持禁用，只有省略参数才继承系统默认。
  const explicitVlm = vlmModelId !== undefined;
  const rawVlmModelData =
    vlmModelId === undefined
      ? modelHandle.getDefaultModelData('datasetImageLLM')
      : modelHandle.getVlmModelData({ modelId: vlmModelId }, { optional: true });

  const [vectorModelData, agentModelData, vlmModelData] = await Promise.all([
    authModelUse({ modelId: rawVectorModelData.modelId, tmbId, teamId }),
    authModelUse({ modelId: rawAgentModelData.modelId, tmbId, teamId }),
    rawVlmModelData
      ? authModelUse({
          modelId: rawVlmModelData.modelId,
          tmbId,
          teamId,
          optional: !explicitVlm
        })
      : Promise.resolve(undefined)
  ]);

  // check limit
  await checkTeamDatasetLimit(teamId);

  // fileId 由客户端传入，必须先绑定到当前团队，避免把其他团队的临时对象移入本团队。
  for (const file of files) {
    if (!isAuthorizedTempFileS3Key({ key: file.fileId, teamId })) {
      return Promise.reject(CommonErrEnum.unAuthFileKey);
    }
  }

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

      for (const file of files) {
        const { fileKey: newKey } = getFileS3Key.dataset({
          datasetId: String(dataset._id),
          filename: file.name
        });

        await bucket.move({
          from: file.fileId,
          to: newKey
        });

        await createCollectionAndInsertData({
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
            chunkSize: 1024,
            indexSize: 512,
            customPdfParse: false
          },
          session
        });
      }

      return {
        datasetId: dataset._id,
        name: dataset.name,
        avatar: dataset.avatar,
        vectorModel: {
          model: vectorModelData.model
        }
      };
    });

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

    return CreateDatasetWithFilesResponseSchema.parse(result);
  } catch (error) {
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
