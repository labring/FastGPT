import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  UpdateDatasetBodySchema,
  type UpdateDatasetBody
} from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetTypeEnum, TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ClientSession } from 'mongoose';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
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

import { computedCollectionChunkSettings } from '@fastgpt/global/core/dataset/training/utils';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { isInternalAddress, PRIVATE_URL_TEXT } from '@fastgpt/service/common/system/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import { moveDataset } from '@/service/core/dataset/move';

/**
 * 更新知识库接口
 * 1. 若包含 parentId，则复用 moveDataset 服务完成鉴权、层级检查、权限继承与移动操作；
 * 2. 若包含基础信息或模型配置，则校验写权限并更新。
 */
async function handler(req: ApiRequestProps<UpdateDatasetBody>) {
  const {
    body: {
      id,
      parentId,
      name,
      avatar,
      intro,
      agentModelId,
      agentModel,
      vlmModelId,
      vlmModel,
      websiteConfig,
      externalReadUrl,
      apiDatasetServer,
      autoSync,
      sangforFileParseConfig,
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

  // 1. 移动分支：直接调用 moveDataset 统一服务
  if (parentId !== undefined) {
    await moveDataset({ req, id, parentId });
  }

  const hasOtherFields =
    name !== undefined ||
    avatar !== undefined ||
    intro !== undefined ||
    agentModelId !== undefined ||
    agentModel !== undefined ||
    vlmModelId !== undefined ||
    vlmModel !== undefined ||
    websiteConfig !== undefined ||
    externalReadUrl !== undefined ||
    apiDatasetServer !== undefined ||
    autoSync !== undefined ||
    sangforFileParseConfig !== undefined ||
    rawChunkSettings !== undefined;

  // 纯移动操作，无需执行后续属性更新
  if (!hasOtherFields) {
    return;
  }

  // 2. 基础属性更新
  const { dataset, permission, tmbId, teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: id,
    per: ReadPermissionVal
  });

  if (!permission.hasWritePer) {
    return Promise.reject(DatasetErrEnum.unAuthDataset);
  }

  const modelHandle = await getModelHandle();
  const chunkSettings = rawChunkSettings
    ? computedCollectionChunkSettings({
        ...rawChunkSettings,
        llmModel: modelHandle.getLLMModelData({
          modelId: dataset.agentModelId,
          model: dataset.agentModel
        }),
        vectorModel: modelHandle.getEmbeddingModelData({
          modelId: dataset.vectorModelId,
          model: dataset.vectorModel
        })
      })
    : undefined;

  const agentModelData = modelHandle.getLLMModelData(
    { modelId: agentModelId, model: agentModel },
    { optional: true }
  );
  // 新 ID（包括显式清空）优先，只有未传 ID 才兼容旧名称。
  const vlmReference = vlmModelId !== undefined ? { modelId: vlmModelId } : { model: vlmModel };
  const vlmValue = vlmModelId !== undefined ? vlmModelId : vlmModel;
  // undefined 表示不修改；显式 null/空字符串才是清空请求。
  const clearVlmModel = vlmValue !== undefined && isEmptyModelValue(vlmValue);
  const vlmModelData = modelHandle.getVlmModelData(vlmReference, { optional: true });

  updateTraining({
    teamId: dataset.teamId,
    datasetId: id,
    shouldReset: !!agentModelData
  });

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
        ...(name && { name }),
        ...(avatar && { avatar }),
        ...(agentModelData && { agentModelId: agentModelData.modelId }),
        ...(vlmModelData && { vlmModelId: vlmModelData.modelId }),
        // 旧名称也必须删除，否则兼容读取或旧版本会重新恢复已清空的视觉配置。
        ...(clearVlmModel && { $unset: { vlmModelId: '', vlmModel: '' } }),
        ...(websiteConfig && { websiteConfig }),
        ...(chunkSettings && { chunkSettings }),
        ...(intro !== undefined && { intro }),
        ...(externalReadUrl !== undefined && { externalReadUrl }),
        ...(typeof autoSync === 'boolean' && { autoSync }),
        // 传空对象等价于恢复全部开关默认值(读取层补全),旧文件已固化的解析结果不受影响
        ...(sangforFileParseConfig !== undefined && { sangforFileParseConfig }),
        ...apiDatasetParams,
        updateTime: new Date()
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
    logDatasetUpdate({ tmbId, teamId, dataset });
    return onUpdate(session);
  });
}
export default NextAPI(handler);

const updateTraining = async ({
  teamId,
  datasetId,
  shouldReset
}: {
  teamId: string;
  datasetId: string;
  shouldReset: boolean;
}) => {
  if (!shouldReset) return;

  await MongoDatasetTraining.updateMany(
    {
      teamId,
      datasetId,
      mode: { $in: [TrainingModeEnum.qa, TrainingModeEnum.auto] }
    },
    {
      $set: {
        retryCount: 3,
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
