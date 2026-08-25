import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { normalizeDatasetModelIds } from '@fastgpt/service/core/dataset/utils';
import { resolveModelId } from '@fastgpt/service/core/ai/compat/resolveModelId';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { authModels } from '@fastgpt/service/support/permission/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  UpdateDatasetBodySchema,
  type UpdateDatasetBody
} from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetTypeEnum, TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ClientSession } from 'mongoose';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  syncChildrenPermission,
  syncCollaborators
} from '@fastgpt/service/support/permission/inheritPermission';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { type DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  removeDatasetSyncJobScheduler,
  upsertDatasetSyncJobScheduler
} from '@fastgpt/service/core/dataset/datasetSync';
import { delDatasetRelevantData } from '@fastgpt/service/core/dataset/controller';
import { isEqual } from 'lodash-es';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import {
  assertModelUsable,
  getEmbeddingModel,
  getLLMModel,
  getVlmModel
} from '@fastgpt/service/core/ai/model/cache';
import { computedCollectionChunkSettings } from '@fastgpt/global/core/dataset/training/utils';
import { getResourceOwnedClbs } from '@fastgpt/service/support/permission/controller';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { isInternalAddress, PRIVATE_URL_TEXT } from '@fastgpt/service/common/system/utils';
import { checkMoveFolderDepth } from '@fastgpt/service/common/parentFolder/depth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

// 更新知识库接口
// 包括如下功能：
// 1. 更新应用的信息（包括名称，类型，头像，介绍等）
// 2. 更新数据库的配置信息
// 3. 移动知识库
// 操作权限：
// 1. 更新信息和配置编排需要有知识库的写权限
// 2. 移动应用需要有
//  (1) 父目录的管理权限
//  (2) 目标目录的管理权限
//  (3) 如果从根目录移动或移动到根目录，需要有团队的应用创建权限
async function handler(req: ApiRequestProps<UpdateDatasetBody>) {
  const {
    body: {
      id,
      parentId,
      name,
      avatar,
      intro,
      vectorModelId,
      agentModelId,
      vlmModelId,
      // ⚠️ 热升级兼容：legacy provider 模型名，`*ModelId ?? legacy`（getter 按名解析）
      vectorModel,
      agentModel,
      vlmModel,
      websiteConfig,
      externalReadUrl,
      apiDatasetServer,
      autoSync,
      chunkSettings: rawChunkSettings
    }
  } = parseApiInput({
    req,
    bodySchema: UpdateDatasetBodySchema
  });

  if (websiteConfig?.url) {
    if (await isInternalAddress(websiteConfig.url)) {
      return Promise.reject(PRIVATE_URL_TEXT);
    }
  }

  const isMove = parentId !== undefined;

  const {
    dataset: rawDataset,
    permission,
    tmbId,
    teamId
  } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: id,
    per: ReadPermissionVal
  });
  // ⚠️ 热升级兼容：legacy-only dataset 回填 canonical 字段（getter 按名解析）
  const dataset = normalizeDatasetModelIds(rawDataset);
  const resolvedVectorModelId =
    vectorModelId ?? (vectorModel ? resolveModelId(vectorModel, teamId) : undefined);
  const resolvedAgentModelId =
    agentModelId ?? (agentModel ? resolveModelId(agentModel, teamId) : undefined);
  const resolvedVlmModelId =
    vlmModelId ?? (vlmModel ? resolveModelId(vlmModel, teamId) : undefined);

  // Model permission: reject unauthorized models in updated dataset fields (design AUTH-TC12)
  const modelIdsToAuth = [resolvedVectorModelId, resolvedAgentModelId, resolvedVlmModelId].filter(
    (m): m is string => typeof m === 'string' && !!m
  );
  if (modelIdsToAuth.length > 0) {
    await authModels({
      req,
      authToken: true,
      authApiKey: true,
      modelIds: modelIdsToAuth,
      per: ReadPermissionVal
    });

    assertModelUsable(getEmbeddingModel(resolvedVectorModelId ?? dataset.vectorModelId ?? ''));
    assertModelUsable(getLLMModel(resolvedAgentModelId ?? dataset.agentModelId ?? ''));
    const targetVlmModelId = resolvedVlmModelId ?? dataset.vlmModelId;
    if (targetVlmModelId) {
      assertModelUsable(getVlmModel(targetVlmModelId));
    }
  }

  let targetName = '';

  const chunkSettings = rawChunkSettings
    ? computedCollectionChunkSettings({
        ...rawChunkSettings,
        llmModel: getLLMModel(dataset.agentModelId),
        vectorModel: getEmbeddingModel(dataset.vectorModelId)
      })
    : undefined;

  if (isMove) {
    if (parentId) {
      // move to a folder, check the target folder's permission
      const { dataset: targetDataset } = await authDataset({
        req,
        authToken: true,
        authApiKey: true,
        datasetId: parentId,
        per: ManagePermissionVal
      });
      targetName = targetDataset.name;
    } else {
      targetName = 'root';
    }
    if (dataset.parentId) {
      // move from a folder, check the (old) folder's permission
      await authDataset({
        req,
        authToken: true,
        authApiKey: true,
        datasetId: dataset.parentId,
        per: ManagePermissionVal
      });
    }
    if (parentId === null || !dataset.parentId) {
      // move to root or move from root
      await authUserPer({
        req,
        authToken: true,
        per: TeamDatasetCreatePermissionVal
      });
    }
  } else {
    // is not move
    if (!permission.hasWritePer) return Promise.reject(DatasetErrEnum.unAuthDataset);
  }

  if (isMove) {
    await checkMoveFolderDepth({
      resourceId: id,
      targetParentId: parentId,
      teamId: dataset.teamId,
      model: MongoDataset,
      isFolderType: (type) => type === DatasetTypeEnum.folder
    });
  }

  // Reset pending QA training records only when the agent model actually
  // changed — unconditional resets would revive permanently-failed tasks on
  // every save (rename, move, chunk settings…).
  if (resolvedAgentModelId && dataset.agentModelId !== resolvedAgentModelId) {
    updateTraining({ teamId: dataset.teamId, datasetId: id });
  }

  const onUpdate = async (session: ClientSession) => {
    // Website dataset update chunkSettings, need to clean up dataset
    if (
      dataset.type === DatasetTypeEnum.websiteDataset &&
      chunkSettings &&
      dataset.chunkSettings &&
      !isEqual(
        {
          imageIndex: dataset.chunkSettings.imageIndex,
          autoIndexes: dataset.chunkSettings.autoIndexes,
          trainingType: dataset.chunkSettings.trainingType,
          chunkSettingMode: dataset.chunkSettings.chunkSettingMode,
          chunkSplitMode: dataset.chunkSettings.chunkSplitMode,
          chunkSize: dataset.chunkSettings.chunkSize,
          chunkSplitter: dataset.chunkSettings.chunkSplitter,
          indexSize: dataset.chunkSettings.indexSize,
          qaPrompt: dataset.chunkSettings.qaPrompt
        },
        {
          imageIndex: chunkSettings.imageIndex,
          autoIndexes: chunkSettings.autoIndexes,
          trainingType: chunkSettings.trainingType,
          chunkSettingMode: chunkSettings.chunkSettingMode,
          chunkSplitMode: chunkSettings.chunkSplitMode,
          chunkSize: chunkSettings.chunkSize,
          chunkSplitter: chunkSettings.chunkSplitter,
          indexSize: chunkSettings.indexSize,
          qaPrompt: chunkSettings.qaPrompt
        }
      )
    ) {
      await delDatasetRelevantData({ datasets: [dataset], session });
    }

    const apiDatasetParams = (() => {
      if (!apiDatasetServer) return {};

      const flattenObjectWithConditions = (
        obj: any,
        prefix = 'apiDatasetServer'
      ): Record<string, any> => {
        const result: Record<string, any> = {};

        if (!obj || typeof obj !== 'object') return result;

        Object.keys(obj).forEach((key) => {
          const value = obj[key];
          const newKey = prefix ? `${prefix}.${key}` : key;

          if (typeof value === 'object' && !Array.isArray(value)) {
            // Recursively flatten nested objects
            Object.assign(result, flattenObjectWithConditions(value, newKey));
          } else {
            // Add non-empty primitive values
            result[newKey] = value;
          }
        });

        return result;
      };
      return flattenObjectWithConditions(apiDatasetServer);
    })();

    await MongoDataset.findByIdAndUpdate(
      id,
      {
        ...parseParentIdInMongo(parentId),
        ...(name && { name }),
        ...(avatar && { avatar }),
        ...(resolvedAgentModelId && { agentModelId: resolvedAgentModelId }),
        ...(resolvedVlmModelId && { vlmModelId: resolvedVlmModelId }),
        ...(resolvedVectorModelId && { vectorModelId: resolvedVectorModelId }),
        ...(websiteConfig && { websiteConfig }),
        ...(chunkSettings && { chunkSettings }),
        ...(intro !== undefined && { intro }),
        ...(externalReadUrl !== undefined && { externalReadUrl }),
        ...(isMove && { inheritPermission: true }),
        ...(typeof autoSync === 'boolean' && { autoSync }),
        ...apiDatasetParams
      },
      { session }
    );

    await updateSyncSchedule({
      dataset,
      autoSync
    });

    await getS3AvatarSource().refreshAvatar(avatar, dataset.avatar, session);
  };

  await mongoSessionRun(async (session) => {
    if (isMove) {
      const parentClbs = await getResourceOwnedClbs({
        teamId: dataset.teamId,
        resourceId: parentId,
        resourceType: PerResourceTypeEnum.dataset,
        session
      });

      await syncCollaborators({
        teamId: dataset.teamId,
        resourceId: id,
        resourceType: PerResourceTypeEnum.dataset,
        collaborators: parentClbs,
        session
      });

      await syncChildrenPermission({
        resource: dataset,
        resourceType: PerResourceTypeEnum.dataset,
        resourceModel: MongoDataset,
        folderTypeList: [DatasetTypeEnum.folder],
        collaborators: parentClbs,
        session
      });
      logDatasetMove({ tmbId, teamId, dataset, targetName });
      return onUpdate(session);
    } else {
      logDatasetUpdate({ tmbId, teamId, dataset });
      return onUpdate(session);
    }
  });
}
export default NextAPI(handler);

/**
 * Reset retry state of pending QA training records after the dataset's agent
 * model changed, so they get picked up again with the new model. The training
 * record schema has no `model` field and nothing consumes one — only
 * retryCount/lockTime are meaningful here.
 */
const updateTraining = async ({ teamId, datasetId }: { teamId: string; datasetId: string }) => {
  await MongoDatasetTraining.updateMany(
    {
      teamId,
      datasetId,
      mode: { $in: [TrainingModeEnum.qa, TrainingModeEnum.auto] }
    },
    {
      $set: {
        retryCount: 5,
        lockTime: new Date('2000/1/1')
      }
    }
  );
};

const updateSyncSchedule = async ({
  dataset,
  autoSync
}: {
  dataset: DatasetSchemaType;
  autoSync?: boolean;
}) => {
  if (typeof autoSync !== 'boolean') return;

  // Update all collection nextSyncTime
  if (autoSync) {
    // upsert Job Scheduler
    return upsertDatasetSyncJobScheduler({ datasetId: dataset._id });
  } else {
    // remove Job Scheduler
    return removeDatasetSyncJobScheduler(dataset._id);
  }
};

const logDatasetMove = ({
  tmbId,
  teamId,
  dataset,
  targetName
}: {
  tmbId: string;
  teamId: string;
  dataset: any;
  targetName: string;
}) => {
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.MOVE_DATASET,
      params: {
        datasetName: dataset.name,
        targetFolderName: targetName,
        datasetType: getI18nDatasetType(dataset.type)
      }
    });
  })();
};

const logDatasetUpdate = ({
  tmbId,
  teamId,
  dataset
}: {
  tmbId: string;
  teamId: string;
  dataset: any;
}) => {
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_DATASET,
      params: {
        datasetName: dataset.name,
        datasetType: getI18nDatasetType(dataset.type)
      }
    });
  })();
};
