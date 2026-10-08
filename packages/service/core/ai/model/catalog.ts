import type { SystemDefaultModelType } from '../type';
import {
  getModelProviderMetadata,
  getModelProvider,
  preloadModelProviders
} from './provider/controller';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  type EmbeddingSystemModelDataType,
  type LLMSystemModelDataType,
  type RerankSystemModelDataType,
  type STTSystemModelDataType,
  type TTSSystemModelDataType,
  SystemModelDataSchema,
  SystemModelDocumentDataSchema,
  type SystemModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import { getLogger, LogCategories } from '../../../common/logger';
import { getRuntimeResolvedPriceTiers } from '@fastgpt/global/core/ai/model/pricing';
import { clearAllMyModelsCache } from '../../../support/permission/model/cache';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { readSystemModelSnapshot, readSystemModelRevision } from './entity';
import { withTimeout } from '@fastgpt/global/common/system/utils';
import { createModelHandle, getCachedModelHandle, publishModelHandle } from './handle';
import { desensitizeSystemModel } from './transform';

/**
 * 只读取数据库安装实例并原子发布运行时模型快照，不执行插件请求、历史迁移或自动预装。
 */
const publishInstalledModels = async ({
  language = 'en',
  skipPermissionCacheInvalidation = false
}: {
  language?: string;
  /** 启动阶段只发布初始快照，避免重启时删除仍然有效的成员目录缓存。 */
  skipPermissionCacheInvalidation?: boolean;
} = {}) => {
  const getPermissionCacheSignature = (models: SystemModelDataType[]) =>
    models
      .filter((model) => model.scope === ModelScopeEnum.system || !model.scope)
      .map((model) => `${model.modelId}:${model.model}`)
      .sort()
      .join('\n');
  const previousHandle = getCachedModelHandle();
  const previousPermissionCacheSignature = previousHandle
    ? getPermissionCacheSignature(previousHandle.getActiveModels())
    : undefined;

  const _systemModelList: SystemModelDataType[] = [];
  const _systemModelMap = new Map<string, SystemModelDataType>();
  const _systemDefaultModel: SystemDefaultModelType = {};

  const pushModel = (modelData: SystemModelDataType) => {
    _systemModelList.push(modelData);
    _systemModelMap.set(`id:${modelData.modelId}`, modelData);
    _systemModelMap.set(`model:${modelData.model}`, modelData);

    // 管理列表包含停用模型，统一解析价格可避免旧字段或单档双零在列表中显示错误。
    if (modelData.type === ModelTypeEnum.llm) {
      modelData.priceTiers = getRuntimeResolvedPriceTiers(modelData);
    }
  };

  try {
    const {
      models: dbModels,
      defaultModelIds: configuredDefaultModelIds,
      revision
    } = await readSystemModelSnapshot();
    const dbDocuments = dbModels.map((dbModel) => SystemModelDocumentDataSchema.parse(dbModel));

    dbModels.forEach((dbModel, index) => {
      const dbDocument = dbDocuments[index];

      const provider = getModelProvider(dbDocument.provider, language);
      const runtimeModel = SystemModelDataSchema.parse({
        ...dbDocument,
        modelId: String(dbModel._id),
        provider: provider.id,
        avatar: provider.avatar
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

    // Active 列表沿用 MongoDB 的新建时间倒序；系统级默认模型和公共目录版本只计算系统模型。
    const _systemActiveModelList = _systemModelList.filter(
      (model) => model.isActive && (model.scope === ModelScopeEnum.system || !model.scope)
    );

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

    const nextPermissionCacheSignature = getPermissionCacheSignature(
      _systemModelList.filter((model) => model.isActive)
    );
    if (
      !skipPermissionCacheInvalidation &&
      previousPermissionCacheSignature !== undefined &&
      previousPermissionCacheSignature !== nextPermissionCacheSignature
    ) {
      // 只有已发布快照中的模型身份发生变化才失效缓存；首次启动没有可比较的旧快照。
      await clearAllMyModelsCache();
    }

    // 完整目录与内容版本一起发布，不暴露多次赋值的半成品。
    {
      const version = hashStr(
        JSON.stringify({
          schemaVersion: 1,
          // 模型顺序属于目录内容；安装实例变化后必须触发客户端缓存更新。
          models: _systemActiveModelList.map(desensitizeSystemModel),
          providers: getModelProviderMetadata().providers,
          defaultModelIds: configuredDefaultModelIds
        })
      );
      publishModelHandle(
        createModelHandle({
          models: _systemModelList,
          defaultModels: _systemDefaultModel,
          configuredDefaultModelIds,
          revision,
          version
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

let modelReload: Promise<void> | undefined;

/** 同一进程只允许一个加载器发布目录，避免慢的旧加载覆盖较新的快照。 */
export const loadInstalledModels = (options?: Parameters<typeof publishInstalledModels>[0]) => {
  if (!modelReload) {
    modelReload = publishInstalledModels(options).finally(() => {
      modelReload = undefined;
    });
  }
  return modelReload;
};

let modelRefresh: Promise<void> | undefined;

/**
 * 尽力读取最新目录，版本检查与快照加载总共最多等待 5 秒。
 * 失败或超时沿用已成功发布的本地快照（包括空目录）；首次加载没有快照时仍报错。
 * race 不取消底层加载，迟到的完整快照仍可正常发布，不能伪造修订号或清空旧缓存。
 */
export const refreshModelHandle = async () => {
  const refresh = async () => {
    const requiredRevision = await readSystemModelRevision();
    while (!getCachedModelHandle() || getCachedModelHandle()!.revision < requiredRevision) {
      await loadInstalledModels();
    }
  };

  try {
    modelRefresh ??= refresh().finally(() => {
      modelRefresh = undefined;
    });
    await withTimeout(modelRefresh, 5000, 'Model catalog refresh timed out');
  } catch (error) {
    const handle = getCachedModelHandle();
    if (!handle) throw error;
    getLogger(LogCategories.MODULE.AI.CONFIG).warn(
      'Using local model catalog after refresh failure',
      {
        error,
        revision: handle.revision
      }
    );
  }
};

/**
 * 启动依赖 Plugin Provider 元数据；模板 listModels 不参与已安装实例的加载和运行。
 * 历史模型迁移由阻塞升级任务负责。
 */
export const loadSystemModels = async (refresh = false, language = 'en') => {
  if (!refresh && getCachedModelHandle()) return;

  try {
    const isInitialLoad = !getCachedModelHandle();
    await preloadModelProviders();
    await loadInstalledModels({
      language,
      skipPermissionCacheInvalidation: isInitialLoad
    });
  } catch (error) {
    getLogger(LogCategories.MODULE.AI.CONFIG).error('System models orchestration failed', {
      error
    });
    return Promise.reject(error);
  }
};

/** 写入已提交后尽力刷新本节点，失败保留诊断；后续模型读屏障负责重试，不能误报写入失败。 */
export const updatedReloadSystemModel = async () => {
  await refreshModelHandle().catch((error) => {
    getLogger(LogCategories.MODULE.AI.CONFIG).warn(
      'Model write committed; catalog refresh pending',
      { error }
    );
  });
};
