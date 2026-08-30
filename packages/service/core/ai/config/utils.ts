import type { SystemDefaultModelType } from '../type';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoAIModel } from './schema';
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
import { delay } from '@fastgpt/global/common/system/utils';
import { pluginClient } from '../../../thirdProvider/fastgptPlugin';
import { setCron } from '../../../common/system/cron';
import { preloadModelProviders } from '../../../core/app/provider/controller';
import { getLogger, LogCategories } from '../../../common/logger';
import { getRuntimeResolvedPriceTiers } from '@fastgpt/global/core/ai/pricing';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { flatModelToDocumentData } from './repair';
import { clearAllMyModelsCache } from '../../../support/permission/model/controller';
import { bootstrapAIModelsFromLegacy } from './legacy';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { findSystemDefaultModelIds } from '../defaultModel/entity';
import { MongoAIDefaultModel } from '../defaultModel/schema';

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

let modelTemplateSnapshot: SystemModelDocumentDataType[] | undefined;

/**
 * 拉取并校验完整插件模型模板，返回候选快照但不立即发布。
 * 候选模板会在数据库实例也成功加载后，与 active 模型缓存一起原子发布。
 */
export const refreshModelTemplates = async (): Promise<SystemModelDocumentDataType[]> => {
  return getPluginSystemModelDocuments();
};

/**
 * 当前版本的自动预装兼容策略：只物化插件中存在但数据库缺失的系统模型。
 * 模板消失不会在这里删除或停用实例；PR2 可将本函数替换为显式模板安装。
 */
export const syncPreinstalledSystemModels = async ({
  pluginDocuments
}: {
  pluginDocuments: SystemModelDocumentDataType[];
}) => {
  if (pluginDocuments.length === 0) return;

  await MongoAIModel.bulkWrite(
    pluginDocuments.map((document) => ({
      updateOne: {
        filter: { scope: ModelScopeEnum.system, model: document.model },
        update: { $setOnInsert: document },
        upsert: true
      }
    })),
    { ordered: false }
  );
};

/**
 * 只读取数据库安装实例并原子发布运行时模型快照，不执行插件请求、历史迁移或自动预装。
 */
export const loadInstalledModels = async ({
  pluginDocuments = modelTemplateSnapshot,
  language = 'en'
}: {
  pluginDocuments?: SystemModelDocumentDataType[];
  language?: string;
} = {}) => {
  if (!pluginDocuments) {
    return Promise.reject(new Error('Model template snapshot is not initialized'));
  }

  const getPermissionCacheSignature = (models: SystemModelDataType[]) =>
    models
      .map((model) => `${model.modelId}:${model.model}`)
      .sort()
      .join('\n');
  const previousPermissionCacheSignature = global.systemActiveModelList
    ? getPermissionCacheSignature(global.systemActiveModelList)
    : undefined;

  const _systemModelList: SystemModelDataType[] = [];
  const _systemActiveModelList: SystemModelDataType[] = [];
  const _systemModelMap = new Map<string, SystemModelDataType>();
  const _systemDefaultModel: SystemDefaultModelType = {};

  const pushModel = (modelData: SystemModelDataType) => {
    _systemModelList.push(modelData);
    _systemModelMap.set(`id:${modelData.modelId}`, modelData);
    _systemModelMap.set(`model:${modelData.model}`, modelData);

    if (modelData.isActive) {
      _systemActiveModelList.push(modelData);

      if (modelData.type === ModelTypeEnum.llm) {
        modelData.priceTiers = getRuntimeResolvedPriceTiers(modelData);
      }
    }
  };

  try {
    const [dbModels, configuredDefaultModelIds] = await Promise.all([
      MongoAIModel.find({ scope: ModelScopeEnum.system }).lean(),
      findSystemDefaultModelIds()
    ]);
    const pluginDocumentMap = new Map(pluginDocuments.map((model) => [model.model, model]));

    dbModels.forEach((dbModel) => {
      const dbDocument = SystemModelDocumentDataSchema.parse(dbModel);
      const pluginDocument = pluginDocumentMap.get(dbDocument.model);

      const provider = getModelProvider(dbDocument.provider, language);
      const runtimeModel = SystemModelDataSchema.parse({
        ...dbDocument,
        modelId: String(dbModel._id),
        provider: provider.id,
        avatar: provider.avatar,
        isCustom: !pluginDocument
      });

      pushModel(runtimeModel);
    });

    // 默认配置只保存稳定 ID。无效配置留给成员目录按类型回退，不再读取模型布尔字段修复。
    const configuredModel = <T extends SystemModelDataType>(
      modelId: string | undefined,
      predicate: (model: SystemModelDataType) => model is T
    ) => {
      const model = modelId ? _systemModelMap.get(`id:${modelId}`) : undefined;
      return model?.isActive && predicate(model) ? model : undefined;
    };
    _systemDefaultModel.llm = configuredModel<LLMSystemModelDataType>(
      configuredDefaultModelIds.llm,
      (model): model is LLMSystemModelDataType => model.type === ModelTypeEnum.llm
    );
    _systemDefaultModel.datasetTextLLM = configuredModel<LLMSystemModelDataType>(
      configuredDefaultModelIds.datasetTextLLM,
      (model): model is LLMSystemModelDataType => model.type === ModelTypeEnum.llm
    );
    _systemDefaultModel.datasetImageLLM = configuredModel<LLMSystemModelDataType>(
      configuredDefaultModelIds.datasetImageLLM,
      (model): model is LLMSystemModelDataType =>
        model.type === ModelTypeEnum.llm && !!model.config.vision
    );
    _systemDefaultModel.chatTitleLLM = configuredModel<LLMSystemModelDataType>(
      configuredDefaultModelIds.chatTitleLLM,
      (model): model is LLMSystemModelDataType => model.type === ModelTypeEnum.llm
    );
    _systemDefaultModel.embedding = configuredModel<EmbeddingSystemModelDataType>(
      configuredDefaultModelIds.embedding,
      (model): model is EmbeddingSystemModelDataType => model.type === ModelTypeEnum.embedding
    );
    _systemDefaultModel.tts = configuredModel<TTSSystemModelDataType>(
      configuredDefaultModelIds.tts,
      (model): model is TTSSystemModelDataType => model.type === ModelTypeEnum.tts
    );
    _systemDefaultModel.stt = configuredModel<STTSystemModelDataType>(
      configuredDefaultModelIds.stt,
      (model): model is STTSystemModelDataType => model.type === ModelTypeEnum.stt
    );
    _systemDefaultModel.rerank = configuredModel<RerankSystemModelDataType>(
      configuredDefaultModelIds.rerank,
      (model): model is RerankSystemModelDataType => model.type === ModelTypeEnum.rerank
    );

    // Plugin 数组是内置模型展示顺序的唯一来源；MongoDB 自然顺序不具备业务语义。
    const pluginModelOrder = new Map(pluginDocuments.map((model, index) => [model.model, index]));
    _systemActiveModelList.sort((a, b) => {
      const orderA = pluginModelOrder.get(a.model);
      const orderB = pluginModelOrder.get(b.model);
      if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
      if (orderA !== undefined) return -1;
      if (orderB !== undefined) return 1;
      return a.modelId.localeCompare(b.modelId);
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
      modelTemplateSnapshot = pluginDocuments;
      global.systemModelList = _systemModelList;
      global.systemActiveModelList = _systemActiveModelList;
      global.systemModelMap = _systemModelMap;
      global.systemDefaultModel = _systemDefaultModel;
      global.systemConfiguredDefaultModelIds = configuredDefaultModelIds;
      global.systemModelCatalogVersion = hashStr(
        JSON.stringify({
          schemaVersion: 1,
          // 模型顺序属于目录内容；plugin 调整顺序后必须触发客户端缓存更新。
          models: _systemActiveModelList.map(desensitizeSystemModel),
          providers: global.ModelProviderRawCache,
          defaultModelIds: configuredDefaultModelIds
        })
      );
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

/**
 * 编排模型启动或模板热刷新。插件刷新仍是启动前置条件；首次启动会先发布 ai_models 当前快照，
 * 再同步执行旧表迁移、自动预装和最终缓存刷新。任一步失败都会向启动链路抛错并终止进程。
 */
export const loadSystemModels = async (refresh = false, language = 'en') => {
  if (!refresh && global.systemModelList) return;

  try {
    await preloadModelProviders();
    const pluginDocuments = await refreshModelTemplates();
    if (!global.systemModelList) {
      await loadInstalledModels({ pluginDocuments, language });
      const result = await bootstrapAIModelsFromLegacy({ pluginDocuments });
      await syncPreinstalledSystemModels({ pluginDocuments });
      await loadInstalledModels({ pluginDocuments, language });
      getLogger(LogCategories.MODULE.AI.CONFIG).info('AI model bootstrap completed', result);
      return;
    }

    await syncPreinstalledSystemModels({ pluginDocuments });
    await loadInstalledModels({ pluginDocuments, language });
  } catch (error) {
    getLogger(LogCategories.MODULE.AI.CONFIG).error('System models orchestration failed', {
      error
    });
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
  const changeStream = MongoAIModel.watch();

  return changeStream.on(
    'change',
    debounce(async () => {
      try {
        // 数据库事件只重建安装实例快照，不触发插件请求、repair 或自动预装。
        await loadInstalledModels();
      } catch {}
    }, 500)
  );
};

/** 默认模型配置变化时只重建模型目录，不推进 getInitData 版本。 */
export const watchSystemDefaultModelUpdate = () => {
  const changeStream = MongoAIDefaultModel.watch();

  return changeStream.on(
    'change',
    debounce(async () => {
      try {
        await loadInstalledModels();
      } catch {}
    }, 500)
  );
};

// 更新完模型后，需要重载缓存
export const updatedReloadSystemModel = async ({
  pluginDocuments
}: {
  pluginDocuments?: SystemModelDocumentDataType[];
} = {}) => {
  const templates = pluginDocuments ?? (await refreshModelTemplates());
  // 管理员写入后只重建安装实例快照，不隐式执行全量预装。
  await loadInstalledModels({ pluginDocuments: templates });
  // 模型目录拥有独立版本，不能污染 getInitData.bufferId。
  // 延迟1秒，等待其他节点通过 change stream 刷新。
  await delay(1000);
};
export const cronRefreshModels = async () => {
  setCron('*/5 * * * *', async () => {
    // 模板刷新成功后才执行自动预装和运行时快照发布；失败时保留旧快照。
    await loadSystemModels(true);
  });
};
