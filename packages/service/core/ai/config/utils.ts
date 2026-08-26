import type { SystemDefaultModelType } from '../type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoSystemModel } from './schema';
import {
  type EmbeddingSystemModelDataType,
  type LLMSystemModelDataType,
  type RerankSystemModelDataType,
  type STTSystemModelDataType,
  type TTSSystemModelDataType,
  SystemModelDocumentDataSchema,
  SystemModelDataSchema,
  type SystemModelDataType,
  type SystemModelDocumentDataType
} from '@fastgpt/global/core/ai/model.schema';
import { debounce } from 'lodash-es';
import { getModelProvider } from '../../../core/app/provider/controller';
import { findModelData } from '../model';
import {
  reloadFastGPTConfigBuffer,
  updateFastGPTConfigBuffer
} from '../../../common/system/config/controller';
import { delay } from '@fastgpt/global/common/system/utils';
import { pluginClient } from '../../../thirdProvider/fastgptPlugin';
import { setCron } from '../../../common/system/cron';
import { preloadModelProviders } from '../../../core/app/provider/controller';
import { getLogger, LogCategories } from '../../../common/logger';
import { getRuntimeResolvedPriceTiers } from '@fastgpt/global/core/ai/pricing';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { flatModelToDocumentData, repairStoredSystemModels } from './repair';
import { clearAllMyModelsCache } from '../../../support/permission/model/controller';

/**
 * 生成可返回客户端的脱敏模型副本。系统模型对象还会被服务端请求链路复用，不能原地删除字段。
 */
export const desensitizeSystemModel = <T extends SystemModelDataType>(model: T): T => {
  return {
    ...model,
    config: {
      ...model.config,
      defaultSystemChatPrompt: undefined,
      fieldMap: undefined,
      defaultConfig: undefined,
      dbConfig: undefined,
      queryConfig: undefined
    },
    requestUrl: undefined,
    requestAuth: undefined
  } as T;
};

/**
 * 生成可返回客户端的系统默认模型配置。默认模型只表示系统配置，不代表当前用户具备使用权限。
 */
export const desensitizeSystemDefaultModels = (defaultModels: SystemDefaultModelType) => ({
  [ModelTypeEnum.llm]: defaultModels.llm && desensitizeSystemModel(defaultModels.llm),
  datasetTextLLM:
    defaultModels.datasetTextLLM && desensitizeSystemModel(defaultModels.datasetTextLLM),
  datasetImageLLM:
    defaultModels.datasetImageLLM && desensitizeSystemModel(defaultModels.datasetImageLLM),
  chatTitleLLM: defaultModels.chatTitleLLM && desensitizeSystemModel(defaultModels.chatTitleLLM),
  [ModelTypeEnum.embedding]:
    defaultModels.embedding && desensitizeSystemModel(defaultModels.embedding),
  [ModelTypeEnum.tts]: defaultModels.tts && desensitizeSystemModel(defaultModels.tts),
  [ModelTypeEnum.stt]: defaultModels.stt && desensitizeSystemModel(defaultModels.stt),
  [ModelTypeEnum.rerank]: defaultModels.rerank && desensitizeSystemModel(defaultModels.rerank)
});

/** 获取插件模型的 canonical 初始文档；加载器与迁移脚本共用同一套扁平字段分拣规则。 */
export const getPluginSystemModelDocuments = async (): Promise<SystemModelDocumentDataType[]> =>
  pluginClient.listModels().then((models) => models.map((model) => flatModelToDocumentData(model)));

export const loadSystemModels = async (init = false, language = 'en') => {
  if (!init && global.systemModelList) return;

  const getPermissionCacheSignature = (models: SystemModelDataType[]) =>
    models
      .map((model) => `${model.modelId}:${model.model}`)
      .sort()
      .join('\n');
  const previousPermissionCacheSignature = global.systemActiveModelList
    ? getPermissionCacheSignature(global.systemActiveModelList)
    : undefined;

  try {
    await preloadModelProviders();
  } catch (error) {
    const logger = getLogger(LogCategories.MODULE.AI.CONFIG);
    logger.error('System model provider preload failed', { error });
    return Promise.reject(error);
  }

  const _systemModelList: SystemModelDataType[] = [];
  const _systemActiveModelList: SystemModelDataType[] = [];
  const _systemModelMap = new Map<string, SystemModelDataType>();
  const _systemDefaultModel: SystemDefaultModelType = {};

  if (!global.systemModelList) {
    global.systemModelList = [];
    global.systemActiveModelList = [];
    global.systemModelMap = new Map<string, SystemModelDataType>();
    global.systemDefaultModel = {};
  }

  const pushModel = (modelData: SystemModelDataType) => {
    _systemModelList.push(modelData);
    _systemModelMap.set(`id:${modelData.modelId}`, modelData);
    _systemModelMap.set(`model:${modelData.model}`, modelData);

    if (modelData.isActive) {
      _systemActiveModelList.push(modelData);

      if (modelData.type === ModelTypeEnum.llm) {
        modelData.priceTiers = getRuntimeResolvedPriceTiers(modelData);

        if (modelData.isDefault) {
          _systemDefaultModel.llm = modelData;
        }
        if (modelData.isDefaultDatasetTextModel) {
          _systemDefaultModel.datasetTextLLM = modelData;
        }
        if (modelData.isDefaultDatasetImageModel) {
          _systemDefaultModel.datasetImageLLM = modelData;
        }
        if (modelData.isDefaultChatTitleModel) {
          _systemDefaultModel.chatTitleLLM = modelData;
        }
      } else if (modelData.type === ModelTypeEnum.embedding) {
        if (modelData.isDefault) {
          _systemDefaultModel.embedding = modelData;
        }
      } else if (modelData.type === ModelTypeEnum.tts) {
        if (modelData.isDefault) {
          _systemDefaultModel.tts = modelData;
        }
      } else if (modelData.type === ModelTypeEnum.stt) {
        if (modelData.isDefault) {
          _systemDefaultModel.stt = modelData;
        }
      } else if (modelData.type === ModelTypeEnum.rerank) {
        if (modelData.isDefault) {
          _systemDefaultModel.rerank = modelData;
        }
      }
    }
  };

  try {
    const pluginDocuments = await getPluginSystemModelDocuments();

    // 先原地接管旧文档，再物化新增插件模型。旧文档没有 isSystem，若先按新结构 upsert，
    // 会创建同名记录并导致 repair 触发唯一索引冲突，或者被旧 model 唯一索引直接拒绝。
    const repairStats = await repairStoredSystemModels({ pluginDocuments });
    if (repairStats.repaired > 0) {
      getLogger(LogCategories.MODULE.AI.CONFIG).warn('System model documents repaired', {
        scanned: repairStats.scanned,
        unchanged: repairStats.unchanged,
        repaired: repairStats.repaired
      });
    }
    if (repairStats.deleted > 0) {
      getLogger(LogCategories.MODULE.AI.CONFIG).warn('Invalid system model documents deleted', {
        deleted: repairStats.deleted,
        models: repairStats.deletedModels
      });
    }

    // repair 后，同名历史记录已具有 canonical 结构；按系统模型条件更新可稳定复用原 `_id`。
    // 仅当插件引入了数据库中不存在的新模型时，upsert 才会插入新文档。
    if (pluginDocuments.length > 0) {
      await MongoSystemModel.bulkWrite(
        pluginDocuments.map((document) => ({
          updateOne: {
            filter: { isSystem: true, model: document.model },
            update: { $setOnInsert: document },
            upsert: true
          }
        })),
        { ordered: false }
      );
    }

    const dbModels = await MongoSystemModel.find({}).lean();
    const pluginDocumentMap = new Map(pluginDocuments.map((model) => [model.model, model]));

    dbModels.forEach((dbModel) => {
      const dbDocument = SystemModelDocumentDataSchema.parse(dbModel);
      const pluginDocument = pluginDocumentMap.get(dbDocument.model);

      // 只对 config 做插件默认值合并；数据库公共字段始终具有最终解释权。
      const mergedDocument = SystemModelDocumentDataSchema.parse({
        ...(pluginDocument ?? {}),
        ...dbDocument,
        config: {
          ...(pluginDocument?.config ?? {}),
          ...dbDocument.config
        }
      });
      const provider = getModelProvider(mergedDocument.provider, language);
      const runtimeModel = SystemModelDataSchema.parse({
        ...mergedDocument,
        modelId: String(dbModel._id),
        provider: provider.id,
        avatar: provider.avatar,
        isCustom: !pluginDocument
      });

      pushModel(runtimeModel);
    });

    // Sort model list
    _systemActiveModelList.sort((a, b) => {
      const providerA = getModelProvider(a.provider, language);
      const providerB = getModelProvider(b.provider, language);
      return providerA.order - providerB.order;
    });

    // Default model check
    {
      if (!_systemDefaultModel.llm) {
        _systemDefaultModel.llm = _systemActiveModelList.find(
          (model): model is LLMSystemModelDataType => model.type === ModelTypeEnum.llm
        );
      }
      if (!_systemDefaultModel.datasetTextLLM) {
        _systemDefaultModel.datasetTextLLM = _systemDefaultModel.llm;
      }
      if (!_systemDefaultModel.datasetImageLLM) {
        _systemDefaultModel.datasetImageLLM = _systemActiveModelList.find(
          (model): model is LLMSystemModelDataType =>
            model.type === ModelTypeEnum.llm && !!model.config.vision
        );
      }
      if (!_systemDefaultModel.embedding) {
        _systemDefaultModel.embedding = _systemActiveModelList.find(
          (model): model is EmbeddingSystemModelDataType => model.type === ModelTypeEnum.embedding
        );
      }
      if (!_systemDefaultModel.tts) {
        _systemDefaultModel.tts = _systemActiveModelList.find(
          (model): model is TTSSystemModelDataType => model.type === ModelTypeEnum.tts
        );
      }
      if (!_systemDefaultModel.stt) {
        _systemDefaultModel.stt = _systemActiveModelList.find(
          (model): model is STTSystemModelDataType => model.type === ModelTypeEnum.stt
        );
      }
      if (!_systemDefaultModel.rerank) {
        _systemDefaultModel.rerank = _systemActiveModelList.find(
          (model): model is RerankSystemModelDataType => model.type === ModelTypeEnum.rerank
        );
      }
    }

    const nextPermissionCacheSignature = getPermissionCacheSignature(_systemActiveModelList);
    if (
      previousPermissionCacheSignature === undefined ||
      previousPermissionCacheSignature !== nextPermissionCacheSignature
    ) {
      // 只有会改变成员可用模型 ID 的变更才失效缓存，避免五分钟定时刷新退化成固定清缓存。
      await clearAllMyModelsCache();
    }

    // Set global value
    {
      global.systemModelList = _systemModelList;
      global.systemActiveModelList = _systemActiveModelList;
      global.systemModelMap = _systemModelMap;
      global.systemDefaultModel = _systemDefaultModel;
    }

    const logger = getLogger(LogCategories.MODULE.AI.CONFIG);
    logger.debug('System models loaded', {
      total: _systemModelList.length,
      active: _systemActiveModelList.length
    });
  } catch (error) {
    const logger = getLogger(LogCategories.MODULE.AI.CONFIG);
    logger.error('System models load failed', { error });

    return Promise.reject(error);
  }
};

/** 根据稳定模型 ID 恢复内置插件模板；自定义模型没有可恢复的模板。 */
export const getSystemModelConfig = async (
  modelId: string
): Promise<SystemModelDocumentDataType> => {
  const modelData = findModelData({ modelId });
  if (!modelData) return Promise.reject(ModelErrEnum.unExist);
  if (modelData.isCustom) return Promise.reject('Custom model not data');

  // Read file
  const modelDefaultConfig = await getPluginSystemModelDocuments().then((models) =>
    models.find((item) => item.model === modelData.model)
  );
  if (!modelDefaultConfig) return Promise.reject(ModelErrEnum.unExist);

  return {
    ...modelDefaultConfig,
    provider: modelData.provider
  };
};

export const watchSystemModelUpdate = () => {
  const changeStream = MongoSystemModel.watch();

  return changeStream.on(
    'change',
    debounce(async () => {
      try {
        // Main node will reload twice
        await loadSystemModels(true);
        // All node reaload buffer
        await reloadFastGPTConfigBuffer();
      } catch {}
    }, 500)
  );
};

// 更新完模型后，需要重载缓存
export const updatedReloadSystemModel = async () => {
  // 1. 更新模型（所有节点都会触发）
  await loadSystemModels(true);
  // 2. 更新缓存（仅主节点触发）；成员模型缓存由 loadSystemModels 按 active 签名变化失效。
  await updateFastGPTConfigBuffer();
  // 3. 延迟1秒，等待其他节点刷新
  await delay(1000);
};
export const cronRefreshModels = async () => {
  setCron('*/5 * * * *', async () => {
    // 1. 更新模型（所有节点都会触发）
    await loadSystemModels(true);
    // 2. 更新缓存（仅主节点触发）
    await updateFastGPTConfigBuffer();
  });
};
