import { NextAPI } from '@/service/middleware/entry';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
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
import { enqueueDatasetPermissionSync } from '@fastgpt/service/core/dataset/datasetPermissionSync';
import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { enableDatasetCollectionPermissions } from '@fastgpt/service/support/permission/collection/enable';
import { assertAuthModels } from '@fastgpt/service/support/permission/model/auth';
import { addAuditLogs } from '@fastgpt/service/support/user/audit/util';
import { buildDatasetConfigUpdatePatch } from '@fastgpt/service/core/dataset/audit/patch';
import { buildDatasetUpdateAuditLogs } from '@fastgpt/service/core/dataset/audit/config';
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

  const apiDatasetServerPatch =
    apiDatasetServer === undefined
      ? undefined
      : buildDatasetConfigUpdatePatch({
          currentValue: dataset.apiDatasetServer,
          patchValue: apiDatasetServer,
          rootPath: 'apiDatasetServer'
        });
  // 外部权限同步开启 ⇒ collection 权限必须开启：否则快照没有读者，同步结果等于白写。
  // 只经唯一入口 enableDatasetCollectionPermissions 开启，禁止直写开关（否则会出现
  // 「开关已开但 collection 尚无快照」的窗口，读路径会整库不可见）。
  // 未传 apiDatasetServer 时沿用库中配置，保证异常组合（permissionSync=true 但开关未开）能被顺带修复。
  const effectiveApiDatasetServer = (
    apiDatasetServer === undefined
      ? dataset.apiDatasetServer
      : apiDatasetServerPatch?.effectiveValue
  ) as ApiDatasetServerType | undefined;
  const needsEnableCollectionPermission =
    effectiveApiDatasetServer?.permissionSync === true &&
    dataset.collectionPermissionEnabled !== true;
  // 与「是否开启 collection 权限」解耦：开关早已打开但本次才开启托管时，同样需要补一轮全量。
  const shouldEnqueueFullSync =
    effectiveApiDatasetServer?.permissionSync === true &&
    (dataset.apiDatasetServer?.permissionSync !== true ||
      dataset.collectionPermissionEnabled !== true);
  const configAuditLogs = buildDatasetUpdateAuditLogs({
    dataset,
    modelHandle,
    update: {
      name,
      intro,
      avatar,
      agentModelId,
      agentModel,
      agentModelData,
      vlmModelId,
      vlmModel,
      vlmModelData,
      clearVlmModel,
      websiteConfig,
      externalReadUrl,
      apiDatasetServer: {
        enabled: apiDatasetServer !== undefined,
        value: apiDatasetServerPatch?.effectiveValue
      },
      autoSync,
      chunkSettings,
      chunkSettingsEnabled: rawChunkSettings !== undefined,
      fileParseConfig: sangforFileParseConfig
    }
  });

  const onUpdate = async (session: ClientSession) => {
    // 开启开关与全库物化必须同一事务提交，否则读路径会看到「已开启但未物化」的整库不可见状态。
    // 按设计顺序先开 collection 权限，再写 apiDatasetServer。
    if (needsEnableCollectionPermission) {
      await enableDatasetCollectionPermissions({ teamId, datasetId: String(id), session });
    }

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

    const apiDatasetParams = apiDatasetServerPatch?.updateFields ?? {};

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

  // 刚开启同步时补一轮全量：存量 collection 还没有任何外部快照。
  // 入队在提交后执行，避免事务回滚却把任务发出去。
  if (shouldEnqueueFullSync) {
    await enqueueDatasetPermissionSync({ datasetId: String(id) });
  }

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
