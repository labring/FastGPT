import { NextAPI } from '@/service/middleware/entry';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import {
  DatasetTypeEnum,
  DatasetCollectionDataProcessModeEnum,
  ChunkTriggerConfigTypeEnum,
  ChunkSettingModeEnum,
  DataChunkSplitModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  CreateDatasetBodySchema,
  CreateDatasetResponseSchema,
  type CreateDatasetResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import {
  adaptiveAdjustConfig,
  logAdaptiveAdjustments
} from '@fastgpt/service/core/dataset/collection/adaptiveConfig';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  getDefaultDatasetModel,
  getDefaultEmbeddingModel,
  getDefaultVLMModel,
  getEmbeddingModelById,
  getLLMModelById
} from '@fastgpt/service/core/ai/model';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { checkTeamDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import {
  addDatasetSyncJob,
  upsertDatasetSyncJobScheduler
} from '@fastgpt/service/core/dataset/datasetSync';

async function handler(req: ApiRequestProps): Promise<CreateDatasetResponse> {
  const {
    parentId,
    name,
    intro,
    type = DatasetTypeEnum.dataset,
    avatar,
    vectorModelId = getDefaultEmbeddingModel()?.id,
    agentModelId = getDefaultDatasetModel()?.id,
    vlmModelId: rawVlmModelId,
    apiDatasetServer,
    websiteConfig,
    autoSync
  } = CreateDatasetBodySchema.parse(req.body);

  // vlmModelId: null=不使用, undefined=取默认值, string=指定模型
  const vlmModelId = rawVlmModelId === null ? undefined : rawVlmModelId ?? getDefaultVLMModel()?.id;

  // auth
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

  // check model valid
  const vectorModelStore = getEmbeddingModelById(vectorModelId);
  const agentModelStore = getLLMModelById(agentModelId);

  const skipVecModelCheckTypes = new Set([DatasetTypeEnum.structureDocument]);
  const skipLMCheckTypes = new Set([DatasetTypeEnum.database, DatasetTypeEnum.structureDocument]);

  if (!skipVecModelCheckTypes.has(type) && !vectorModelStore) {
    return Promise.reject(`System not embedding model`);
  }
  if (!skipLMCheckTypes.has(type) && !agentModelStore) {
    return Promise.reject(`System not llm model`);
  }

  // check limit
  await checkTeamDatasetLimit(teamId);

  // Compute chunkSettings from systemEnv for website and API datasets
  let chunkSettings: Record<string, any> | undefined;

  if (type === DatasetTypeEnum.websiteDataset || apiDatasetServer) {
    const linkImportConfig = global.systemEnv?.customLinkImport;
    const targetMode = linkImportConfig?.defaultActivateMode || 'default';
    const importMode = linkImportConfig?.modes?.find(
      (m: any) => m.name === targetMode && m.enabled !== false
    );

    if (importMode) {
      const { adjustedEnhanceConfig, adjustments } = adaptiveAdjustConfig({
        dataset: { agentModelId, vlmModelId } as any,
        modeConfig: importMode
      });
      logAdaptiveAdjustments('new_dataset', adjustments);

      chunkSettings = {
        imageIndex: adjustedEnhanceConfig.imageIndex ?? false,
        autoIndexes: adjustedEnhanceConfig.autoIndexes ?? true,
        hypeIndexes: adjustedEnhanceConfig.hypeIndexes ?? false,
        trainingType:
          importMode?.chunkConfig?.trainingType === 'qa'
            ? DatasetCollectionDataProcessModeEnum.qa
            : DatasetCollectionDataProcessModeEnum.chunk,
        chunkTriggerType:
          importMode?.chunkConfig?.chunkTriggerType || ChunkTriggerConfigTypeEnum.minSize,
        chunkTriggerMinSize: importMode?.chunkConfig?.chunkTriggerMinSize ?? 1000,
        chunkSettingMode: importMode?.chunkConfig?.chunkSettingMode || ChunkSettingModeEnum.auto,
        chunkSplitMode: importMode?.chunkConfig?.chunkSplitMode || DataChunkSplitModeEnum.size,
        chunkSize: importMode?.chunkConfig?.chunkSize ?? 1024,
        indexSize: importMode?.chunkConfig?.indexSize ?? 512,
        chunkSplitter: importMode?.chunkConfig?.chunkSplitter || undefined,
        autoIndexesPrompt: importMode?.promptConfig?.autoIndexesPrompt || '',
        hypeIndexPrompt: importMode?.promptConfig?.hypeIndexPrompt || ''
      };
    }
  }

  const datasetId = await mongoSessionRun(async (session) => {
    const [dataset] = await MongoDataset.create(
      [
        {
          ...parseParentIdInMongo(parentId),
          name,
          intro,
          teamId,
          tmbId,
          ...(!skipVecModelCheckTypes.has(type) && { vectorModelId }),
          agentModelId,
          vlmModelId,
          avatar,
          type,
          apiDatasetServer,
          ...(websiteConfig && { websiteConfig }),
          ...(typeof autoSync === 'boolean' && { autoSync }),
          ...(chunkSettings && { chunkSettings })
        }
      ],
      { session, ordered: true }
    );

    await MongoResourcePermission.insertOne({
      teamId,
      tmbId,
      resourceId: dataset._id,
      permission: OwnerRoleVal,
      resourceType: PerResourceTypeEnum.dataset
    });

    await getS3AvatarSource().refreshAvatar(avatar, undefined, session);

    return dataset._id;
  });

  if (autoSync) {
    await upsertDatasetSyncJobScheduler({ datasetId: String(datasetId) });
  }

  // Website dataset: trigger first sync immediately after creation
  if (type === DatasetTypeEnum.websiteDataset && websiteConfig?.url) {
    addDatasetSyncJob({ datasetId: String(datasetId) });
  }

  pushTrack.createDataset({
    type,
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
        datasetType: getI18nDatasetType(type)
      }
    });
  })();

  return CreateDatasetResponseSchema.parse(datasetId);
}
export default NextAPI(handler);
