import { NextAPI } from '@/service/middleware/entry';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { type DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  UpdateDatasetBodySchema,
  type UpdateDatasetBody
} from '@fastgpt/global/openapi/core/dataset/api';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { delDatasetRelevantData } from '@fastgpt/service/core/dataset/controller';
import {
  removeDatasetSyncJobScheduler,
  upsertDatasetSyncJobScheduler
} from '@fastgpt/service/core/dataset/datasetSync';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { assertAuthModels } from '@fastgpt/service/support/permission/model/auth';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { isEqual } from 'lodash-es';
import { type ClientSession } from 'mongoose';

import { moveDataset } from '@/service/core/dataset/move';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import { computedCollectionChunkSettings } from '@fastgpt/global/core/dataset/training/utils';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { isInternalAddress, PRIVATE_URL_TEXT } from '@fastgpt/service/common/system/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

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
  const { dataset, permission, tmbId, teamId, isRoot } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: id,
    per: ReadPermissionVal
  });

  if (!permission.hasWritePer) {
    return Promise.reject(DatasetErrEnum.unAuthDataset);
  }

  const modelHandle = await getTeamModelHandle({ teamId });
  const chunkSettings = rawChunkSettings
    ? computedCollectionChunkSettings({
        ...rawChunkSettings,
        llmModel: modelHandle.getModelData(
          {
            modelId: dataset.agentModelId,
            model: dataset.agentModel
          },
          { type: 'llm' }
        ),
        vectorModel: modelHandle.getModelData(
          {
            modelId: dataset.vectorModelId,
            model: dataset.vectorModel
          },
          { type: 'embedding' }
        )
      })
    : undefined;

  const agentModelData = modelHandle.getModelData(
    { modelId: agentModelId, model: agentModel },
    { type: 'llm', optional: true }
  );
  // 新 ID（包括显式清空）优先，只有未传 ID 才兼容旧名称。
  const vlmReference = vlmModelId !== undefined ? { modelId: vlmModelId } : { model: vlmModel };
  const vlmValue = vlmModelId !== undefined ? vlmModelId : vlmModel;
  // undefined 表示不修改；显式 null/空字符串才是清空请求。
  const clearVlmModel = vlmValue !== undefined && isEmptyModelValue(vlmValue);
  const vlmModelData = modelHandle.getModelData(vlmReference, {
    type: 'llm',
    vision: true,
    optional: true
  });
  const selectedModels = [agentModelData, vlmModelData].filter((model) => model !== undefined);
  await assertAuthModels({
    actor: { teamId, tmbId, isRoot },
    modelIds: selectedModels.map((model) => model.modelId),
    action: 'use',
    handle: modelHandle
  });

  /**
   * 将配置变更整理成通用审计 metadata；敏感来源配置只保留结构并脱敏，不把 token、secret 等写入操作日志。
   * 这里不展开前端详情结构，保持已有审计列表的字符串字段兼容。
   */
  const configChanges: Array<{ item: string; oldValue: string; newValue: string }> = [];
  const stringifyAuditValue = (value: unknown, fieldName?: string): string => {
    const sensitiveKey = /(token|secret|password|apikey|apiKey|accessToken|privateKey)/i;
    const sanitize = (input: unknown, key?: string): unknown => {
      if (key && sensitiveKey.test(key)) return '[REDACTED]';
      if (Array.isArray(input)) return input.map((item) => sanitize(item));
      if (input && typeof input === 'object') {
        return Object.fromEntries(
          Object.entries(input).map(([childKey, childValue]) => [
            childKey,
            sanitize(childValue, childKey)
          ])
        );
      }
      return input;
    };

    if (value === undefined || value === null || value === '') return '-';
    if (typeof value === 'string') return value;

    try {
      return JSON.stringify(sanitize(value, fieldName));
    } catch {
      return String(value);
    }
  };
  const addConfigChange = ({
    item,
    oldValue,
    newValue,
    enabled = true
  }: {
    item: string;
    oldValue: unknown;
    newValue: unknown;
    enabled?: boolean;
  }) => {
    if (!enabled || isEqual(oldValue, newValue)) return;
    configChanges.push({
      item,
      oldValue: stringifyAuditValue(oldValue, item),
      newValue: stringifyAuditValue(newValue, item)
    });
  };

  addConfigChange({
    item: 'name',
    oldValue: dataset.name,
    newValue: name,
    enabled: Boolean(name)
  });
  addConfigChange({
    item: 'intro',
    oldValue: dataset.intro,
    newValue: intro,
    enabled: intro !== undefined
  });
  addConfigChange({
    item: 'avatar',
    oldValue: dataset.avatar,
    newValue: avatar,
    enabled: Boolean(avatar)
  });
  addConfigChange({
    item: 'agentModel',
    oldValue: dataset.agentModelId ?? dataset.agentModel,
    newValue: agentModelData?.modelId,
    enabled: (agentModelId !== undefined || agentModel !== undefined) && !!agentModelData
  });
  addConfigChange({
    item: 'vlmModel',
    oldValue: dataset.vlmModelId ?? dataset.vlmModel,
    newValue: clearVlmModel ? undefined : vlmModelData?.modelId,
    enabled:
      (vlmModelId !== undefined || vlmModel !== undefined) && (clearVlmModel || !!vlmModelData)
  });
  addConfigChange({
    item: 'websiteConfig',
    oldValue: dataset.websiteConfig,
    newValue: websiteConfig,
    enabled: websiteConfig !== undefined
  });
  addConfigChange({
    item: 'externalReadUrl',
    oldValue: dataset.externalReadUrl,
    newValue: externalReadUrl,
    enabled: externalReadUrl !== undefined
  });
  addConfigChange({
    item: 'apiDatasetServer',
    oldValue: dataset.apiDatasetServer,
    newValue: apiDatasetServer,
    enabled: apiDatasetServer !== undefined
  });
  addConfigChange({
    item: 'autoSync',
    oldValue: dataset.autoSync,
    newValue: autoSync,
    enabled: typeof autoSync === 'boolean'
  });
  addConfigChange({
    item: 'chunkSettings',
    oldValue: dataset.chunkSettings,
    newValue: chunkSettings,
    enabled: rawChunkSettings !== undefined
  });
  addConfigChange({
    item: 'sangforFileParseConfig',
    oldValue: dataset.sangforFileParseConfig,
    newValue: sangforFileParseConfig,
    enabled: sangforFileParseConfig !== undefined
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

  await mongoSessionRun((session) => onUpdate(session));

  if (configChanges.length > 0) {
    await addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_DATASET_CONFIG,
      params: {
        datasetId: String(dataset._id),
        datasetName: name ?? dataset.name,
        changeItems: configChanges.map((change) => change.item).join('、'),
        oldValues: configChanges.map((change) => change.oldValue).join('、'),
        newValues: configChanges.map((change) => change.newValue).join('、')
      }
    });
  }
}
export default NextAPI(handler);

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
