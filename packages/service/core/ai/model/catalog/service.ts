import type { SystemDefaultModelType } from '../../type';
import { getModelProviderMetadata, preloadModelProviders } from '../provider/controller';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  type EmbeddingModelDataType,
  type LLMModelDataType,
  type RerankModelDataType,
  type STTModelDataType,
  type TTSModelDataType,
  type AIModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import { getLogger, LogCategories } from '../../../../common/logger';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { readModelCatalogSnapshot, readModelCatalogRevision } from './entity';
import { withTimeout } from '@fastgpt/global/common/system/utils';
import { createModelHandle } from '../handle';
import { getCachedSystemModelHandle, publishSystemModelHandle } from '../cache';
import { desensitizeModel } from '../transform';
import { formatDbModelToRuntimeModel } from '../runtime';
import { resolveEffectiveDefaultModelIds } from '../default/resolve';

/**
 * 只读取数据库安装实例并原子发布运行时模型快照，不执行插件请求、历史迁移或自动预装。
 */
const publishInstalledModels = async ({ language = 'en' }: { language?: string } = {}) => {
  const _systemModelList: AIModelDataType[] = [];
  const _systemModelMap = new Map<string, AIModelDataType>();
  const _systemDefaultModel: SystemDefaultModelType = {};

  const pushModel = (modelData: AIModelDataType) => {
    _systemModelList.push(modelData);
    _systemModelMap.set(`id:${modelData.modelId}`, modelData);
    _systemModelMap.set(`model:${modelData.model}`, modelData);
  };

  try {
    const {
      models: dbModels,
      defaultModelIds: configuredDefaultModelIds,
      revision
    } = await readModelCatalogSnapshot({ scope: ModelScopeEnum.system });
    dbModels.forEach((dbModel) => {
      pushModel(formatDbModelToRuntimeModel(dbModel, { language, fallbackProvider: false }));
    });

    const _systemActiveModelList = _systemModelList.filter(
      (model) => model.isActive && (model.scope === ModelScopeEnum.system || !model.scope)
    );
    // 两类目录只在候选集合上不同，默认槽位和回退规则由同一解析器负责。
    const effectiveDefaults = resolveEffectiveDefaultModelIds({
      models: _systemActiveModelList,
      configuredDefaults: configuredDefaultModelIds
    });
    const resolveModel = <T extends AIModelDataType>(
      slot: keyof typeof effectiveDefaults,
      predicate: (model: AIModelDataType) => model is T
    ) => {
      const id = effectiveDefaults[slot];
      const model = id ? _systemModelMap.get('id:' + id) : undefined;
      return model && predicate(model) ? model : undefined;
    };
    _systemDefaultModel.llm = resolveModel(
      ModelTypeEnum.llm,
      (model): model is LLMModelDataType => model.type === ModelTypeEnum.llm
    );
    _systemDefaultModel.datasetTextLLM = resolveModel(
      'datasetTextLLM',
      (model): model is LLMModelDataType => model.type === ModelTypeEnum.llm
    );
    _systemDefaultModel.datasetImageLLM = resolveModel(
      'datasetImageLLM',
      (model): model is LLMModelDataType => model.type === ModelTypeEnum.llm
    );
    _systemDefaultModel.chatTitleLLM = resolveModel(
      'chatTitleLLM',
      (model): model is LLMModelDataType => model.type === ModelTypeEnum.llm
    );
    _systemDefaultModel.embedding = resolveModel(
      ModelTypeEnum.embedding,
      (model): model is EmbeddingModelDataType => model.type === ModelTypeEnum.embedding
    );
    _systemDefaultModel.tts = resolveModel(
      ModelTypeEnum.tts,
      (model): model is TTSModelDataType => model.type === ModelTypeEnum.tts
    );
    _systemDefaultModel.stt = resolveModel(
      ModelTypeEnum.stt,
      (model): model is STTModelDataType => model.type === ModelTypeEnum.stt
    );
    _systemDefaultModel.rerank = resolveModel(
      ModelTypeEnum.rerank,
      (model): model is RerankModelDataType => model.type === ModelTypeEnum.rerank
    );

    // 完整目录与内容版本一起发布，不暴露多次赋值的半成品。
    {
      const version = hashStr(
        JSON.stringify({
          schemaVersion: 1,
          // 模型顺序属于目录内容；安装实例变化后必须触发客户端缓存更新。
          models: _systemActiveModelList.map(desensitizeModel),
          providers: getModelProviderMetadata().providers,
          defaultModelIds: configuredDefaultModelIds
        })
      );
      publishSystemModelHandle(
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
    const requiredRevision = await readModelCatalogRevision({ scope: ModelScopeEnum.system });
    while (
      !getCachedSystemModelHandle() ||
      getCachedSystemModelHandle()!.revision < requiredRevision
    ) {
      await loadInstalledModels();
    }
  };

  try {
    modelRefresh ??= refresh().finally(() => {
      modelRefresh = undefined;
    });
    await withTimeout(modelRefresh, 5000, 'Model catalog refresh timed out');
  } catch (error) {
    const handle = getCachedSystemModelHandle();
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
  if (!refresh && getCachedSystemModelHandle()) return;

  try {
    await preloadModelProviders();
    await loadInstalledModels({
      language
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
