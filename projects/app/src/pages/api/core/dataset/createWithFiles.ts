import { NextAPI } from '@/service/middleware/entry';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { type DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
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
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  getDefaultEmbeddingModel,
  getDefaultLLMModel,
  getDefaultVLMModel,
  getEmbeddingModelById
} from '@fastgpt/service/core/ai/model';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { checkTeamDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { assertModelAvailable, authModel } from '@fastgpt/service/support/permission/model/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { getFileS3Key } from '@fastgpt/service/common/s3/utils';

async function handler(req: ApiRequestProps): Promise<CreateDatasetWithFilesResponse> {
  const { datasetParams, files } = CreateDatasetWithFilesBodySchema.parse(req.body);
  const {
    parentId,
    name,
    avatar,
    vectorModelId = getDefaultEmbeddingModel()?.id,
    agentModelId = getDefaultLLMModel()?.id,
    vlmModelId: rawVlmModelId
  } = datasetParams;

  // vlmModelId: null=不使用, undefined=取默认值, string=指定模型
  const vlmModelId = rawVlmModelId === null ? undefined : rawVlmModelId ?? getDefaultVLMModel()?.id;

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

  await Promise.all([
    authModel({
      req,
      authToken: true,
      authApiKey: true,
      modelId: vectorModelId!,
      per: ReadPermissionVal
    }).then(({ model }) => {
      assertModelAvailable(model, { type: ModelTypeEnum.embedding });
    }),
    authModel({
      req,
      authToken: true,
      authApiKey: true,
      modelId: agentModelId!,
      per: ReadPermissionVal
    }).then(({ model }) => {
      assertModelAvailable(model, { type: ModelTypeEnum.llm });
    }),
    vlmModelId
      ? authModel({
          req,
          authToken: true,
          authApiKey: true,
          modelId: vlmModelId,
          per: ReadPermissionVal
        }).then(({ model }) => {
          assertModelAvailable(model, { type: ModelTypeEnum.llm, requireVision: true });
        })
      : undefined
  ]);

  // check limit
  await checkTeamDatasetLimit(teamId);

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
            vectorModelId,
            agentModelId,
            vlmModelId,
            avatar,
            intro: '',
            type: DatasetTypeEnum.dataset
          }
        ],
        { session, ordered: true }
      );

      // 2. Create permission
      await MongoResourcePermission.insertOne({
        teamId,
        tmbId,
        resourceId: dataset._id,
        permission: OwnerRoleVal,
        resourceType: PerResourceTypeEnum.dataset
      });

      // 3. Refresh avatar
      await getS3AvatarSource().refreshAvatar(avatar, undefined, session);

      // 4. Move temp files to dataset directory and create collections
      const bucket = new S3PrivateBucket();

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

        await createCollectionAndInsertData({
          dataset: dataset as unknown as DatasetSchemaType,
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
        vectorModel: getEmbeddingModelById(dataset.vectorModelId)
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
