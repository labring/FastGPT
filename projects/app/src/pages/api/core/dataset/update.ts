import { NextAPI } from '@/service/middleware/entry';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import {
  DatasetAuditEventEnum,
  DatasetConfigAuditItemEnum,
  DatasetTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { type DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  UpdateDatasetBodySchema,
  type UpdateDatasetBody
} from '@fastgpt/global/openapi/core/dataset/api';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
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
import { addAuditLogs } from '@fastgpt/service/support/user/audit/util';
import { buildDatasetConfigAuditChanges } from '@fastgpt/service/core/dataset/audit';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';
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
 * 2. 若包含基础信息或模型配置，则校验管理员权限并更新。
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
  const { dataset, tmbId, teamId, isRoot } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: id,
    per: ManagePermissionVal
  });

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
   * 待写入的审计条目。
   *
   * 对象型配置（分块参数、网站抓取、第三方来源）会被拆成「字段路径」粒度，
   * 一次保存可能产生多条；标量配置固定一条。展示形态由 buildDatasetConfigAuditChanges 决定。
   */
  const configAuditLogs: Array<{
    changeItem: string;
    oldValue: string;
    newValue: string;
  }> = [];

  /**
   * 比较并登记一个配置项：未传、值相同都不记录，避免前端回传原值也产生日志。
   *
   * `enabled` 用于区分「没传这个字段」与「传了空值」，两者语义不同：
   * 前者是未修改，后者是一次真实的清空/置空操作。
   */
  const addConfigAudit = ({
    item,
    oldValue,
    newValue,
    enabled = true
  }: {
    item: DatasetConfigAuditItemEnum;
    oldValue: unknown;
    newValue: unknown;
    enabled?: boolean;
  }) => {
    if (!enabled) return;

    configAuditLogs.push(...buildDatasetConfigAuditChanges({ item, oldValue, newValue }));
  };

  /**
   * 解析审计展示用的模型名。
   *
   * 审计给使用者看，写模型 ID（一串 ObjectId）无法辨认，因此：
   * 1. 优先用模型配置的展示名；
   * 2. 模型刚被删掉 / 停用时查不到运行时数据，退回库里存的旧模型标识（历史 version 的可读值）；
   * 3. 旧数据连标识也没有时，显式写成「未知模型」，而不是把 ObjectId 露出来。
   */
  const resolveAuditModelName = ({
    reference,
    modelData,
    options
  }: {
    reference: { modelId?: string | null; model?: string | null };
    modelData?: { name?: string; model?: string; modelId?: string };
    options?: { type: 'llm'; vision: boolean };
  }): string => {
    if (modelData?.name) return modelData.name;

    // 当前引用不可用时，用模型目录里的历史数据拼出可读名
    const fallbackModel = modelHandle.findModelData(reference, options);
    if (fallbackModel?.name) return fallbackModel.name;

    // 旧名称可能是一个历史 model 标识（可读），但绝不能是 modelId
    if (reference.model && reference.model !== reference.modelId) return reference.model;

    return i18nT('common:UnKnow');
  };

  addConfigAudit({
    item: DatasetConfigAuditItemEnum.NAME,
    oldValue: dataset.name,
    newValue: name,
    enabled: Boolean(name)
  });
  addConfigAudit({
    item: DatasetConfigAuditItemEnum.INTRO,
    oldValue: dataset.intro,
    newValue: intro,
    enabled: intro !== undefined
  });
  addConfigAudit({
    item: DatasetConfigAuditItemEnum.AVATAR,
    oldValue: dataset.avatar,
    newValue: avatar,
    enabled: Boolean(avatar)
  });
  addConfigAudit({
    item: DatasetConfigAuditItemEnum.AGENT_MODEL,
    oldValue: resolveAuditModelName({
      reference: getDatasetModelReference(dataset, 'agent'),
      options: { type: 'llm', vision: false }
    }),
    newValue: agentModelData?.name,
    enabled: (agentModelId !== undefined || agentModel !== undefined) && !!agentModelData
  });
  addConfigAudit({
    item: DatasetConfigAuditItemEnum.VLM_MODEL,
    // 显式清空时 agentModelData 为 undefined，审计要能看出「从 A 变成空」
    oldValue: resolveAuditModelName({
      reference: getDatasetModelReference(dataset, 'vlm'),
      options: { type: 'llm', vision: true }
    }),
    newValue: clearVlmModel ? undefined : vlmModelData?.name,
    enabled:
      (vlmModelId !== undefined || vlmModel !== undefined) && (clearVlmModel || !!vlmModelData)
  });
  addConfigAudit({
    item: DatasetConfigAuditItemEnum.WEBSITE_CONFIG,
    oldValue: dataset.websiteConfig,
    newValue: websiteConfig,
    enabled: websiteConfig !== undefined
  });
  addConfigAudit({
    item: DatasetConfigAuditItemEnum.EXTERNAL_READ_URL,
    oldValue: dataset.externalReadUrl,
    newValue: externalReadUrl,
    enabled: externalReadUrl !== undefined
  });
  addConfigAudit({
    item: DatasetConfigAuditItemEnum.API_DATASET_SERVER,
    oldValue: dataset.apiDatasetServer,
    newValue: apiDatasetServer,
    enabled: apiDatasetServer !== undefined
  });
  addConfigAudit({
    item: DatasetConfigAuditItemEnum.AUTO_SYNC,
    oldValue: dataset.autoSync,
    newValue: autoSync,
    enabled: typeof autoSync === 'boolean'
  });
  addConfigAudit({
    item: DatasetConfigAuditItemEnum.CHUNK_SETTINGS,
    oldValue: dataset.chunkSettings,
    newValue: chunkSettings,
    enabled: rawChunkSettings !== undefined
  });
  addConfigAudit({
    item: DatasetConfigAuditItemEnum.FILE_PARSE_CONFIG,
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

  // 事务提交成功后才写审计：失败回滚的更新不应该出现在操作日志里。
  // 每个实际变化的配置项写一条日志，保留单项追溯能力，而不是把多个字段拼成一行。
  if (configAuditLogs.length > 0) {
    void addAuditLogs(
      configAuditLogs.map(({ changeItem, oldValue, newValue }) => ({
        tmbId,
        teamId,
        event: DatasetAuditEventEnum.DATASET_CONFIG_UPDATE,
        params: {
          datasetName: name ?? dataset.name,
          changeItem,
          oldValue,
          newValue
        }
      }))
    );
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
