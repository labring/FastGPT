import type {
  SystemDefaultModelType,
  SystemModelItemType,
  DefaultModelConfig,
  ModelTemplateType
} from './type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoSystemModel, MongoDefaultModel } from './schema';
import type {
  LLMModelItemType,
  EmbeddingModelItemType,
  TTSModelType,
  STTModelType,
  RerankModelItemType
} from '@fastgpt/global/core/ai/model/type';
import { normalizeLegacyModelDoc } from './normalize';
import { debounce } from 'lodash-es';
import { getModelProvider } from '../../app/provider/controller';
import {
  reloadFastGPTConfigBuffer,
  updateFastGPTConfigBuffer
} from '../../../common/system/config/controller';
import { delay } from '@fastgpt/global/common/system/utils';
import { pluginClient } from '../../../thirdProvider/fastgptPlugin';
import { setCron } from '../../../common/system/cron';
import { preloadModelProviders } from '../../app/provider/controller';
import { refreshVersionKey } from '../../../common/cache';
import { SystemCacheKeyEnum } from '../../../common/cache/type';
import { getLogger, LogCategories } from '../../../common/logger';
import { getRuntimeResolvedPriceTiers } from '@fastgpt/global/core/ai/pricing';

function fieldToKey(field: string): keyof SystemDefaultModelType {
  return field.replace('Id', '') as keyof SystemDefaultModelType;
}

/**
 * @deprecated — legacy-name compat index registration (hot-upgrade window,
 * contract release 移除). Keys = provider model 名 + 别名 name；first-wins：
 * 已注册的条目不覆盖，配合调用方排序（active/system 优先）实现确定性命中。
 */
function registerNameMap<T extends SystemModelItemType>(modelData: T, map: Map<string, T>): void {
  if (!map.has(modelData.model)) map.set(modelData.model, modelData);
  if (modelData.name && !map.has(modelData.name)) map.set(modelData.name, modelData);
}

/** Resolve system-wide defaults: explicit config → legacy isDefault* flags → first active isSystem model of same type */
function resolveSystemDefaults(
  sysConfig: DefaultModelConfig | null,
  systemModelIdMap: Map<string, SystemModelItemType>,
  systemActiveModelList: SystemModelItemType[]
): SystemDefaultModelType {
  const result: Record<string, SystemModelItemType> = {};

  const typeMap: Record<
    string,
    {
      type: ModelTypeEnum;
      filter?: (m: SystemModelItemType) => boolean;
      legacyFlag?: string;
    }
  > = {
    llmId: { type: ModelTypeEnum.llm, legacyFlag: 'isDefault' },
    embeddingId: { type: ModelTypeEnum.embedding, legacyFlag: 'isDefault' },
    ttsId: { type: ModelTypeEnum.tts, legacyFlag: 'isDefault' },
    sttId: { type: ModelTypeEnum.stt, legacyFlag: 'isDefault' },
    rerankId: { type: ModelTypeEnum.rerank, legacyFlag: 'isDefault' },
    datasetTextLLMId: { type: ModelTypeEnum.llm, legacyFlag: 'isDefaultDatasetTextModel' },
    datasetImageLLMId: {
      type: ModelTypeEnum.llm,
      filter: (m) => 'vision' in m && !!(m as unknown as { vision?: boolean }).vision,
      legacyFlag: 'isDefaultDatasetImageModel'
    },
    chatTitleLLMId: { type: ModelTypeEnum.llm, legacyFlag: 'isDefaultChatTitleModel' },
    helperBotLLMId: { type: ModelTypeEnum.llm, legacyFlag: 'isDefaultHelperBotModel' }
  };

  for (const [idField, { type, filter, legacyFlag }] of Object.entries(typeMap)) {
    const key = fieldToKey(idField);

    // 1. Explicit config
    const modelId = (sysConfig as Record<string, string | undefined>)?.[idField];
    if (modelId) {
      const model = systemModelIdMap.get(modelId);
      if (model?.isActive && (!filter || filter(model))) {
        result[key] = model;
        continue;
      }
    }

    // 2. Legacy isDefault* flags (hot-upgrade window — pre-migration data,
    //    default_models table not initialized yet); model must be isSystem +
    //    active + pass filter
    if (legacyFlag) {
      const legacyDefault = systemActiveModelList.find((m) => {
        if (m.type !== type) return false;
        if (!m.isSystem) return false;
        if (filter && !filter(m)) return false;
        return (m as unknown as Record<string, unknown>)[legacyFlag] === true;
      });
      if (legacyDefault) {
        result[key] = legacyDefault;
        continue;
      }
    }

    // 3. Fallback: first active isSystem model of matching type
    const fallback = systemActiveModelList.find((m) => {
      if (m.type !== type) return false;
      if (!m.isSystem) return false;
      if (filter && !filter(m)) return false;
      return true;
    });
    if (fallback) {
      result[key] = fallback;
    }
    // 4. Not found → undefined (do not set result[key])
  }

  return result as SystemDefaultModelType;
}

async function loadDefaultModels(
  systemModelIdMap: Map<string, SystemModelItemType>,
  systemActiveModelList: SystemModelItemType[]
): Promise<SystemDefaultModelType> {
  const sysConfig = await MongoDefaultModel.findOne({}).lean();
  return resolveSystemDefaults(sysConfig, systemModelIdMap, systemActiveModelList);
}

export const loadSystemModels = async (init = false, language = 'en') => {
  if (!init && global.systemModelList) return;

  try {
    await preloadModelProviders();
  } catch (error) {
    const logger = getLogger(LogCategories.MODULE.AI.CONFIG);
    logger.error('System model provider preload failed', { error });
    return Promise.reject(error);
  }

  const _systemModelList: SystemModelItemType[] = [];
  const _systemModelIdMap = new Map<string, SystemModelItemType>();
  const _systemModelNameMap = new Map<string, SystemModelItemType>();
  const _llmModelIdMap = new Map<string, LLMModelItemType>();
  const _embeddingModelIdMap = new Map<string, EmbeddingModelItemType>();
  const _ttsModelIdMap = new Map<string, TTSModelType>();
  const _sttModelIdMap = new Map<string, STTModelType>();
  const _reRankModelIdMap = new Map<string, RerankModelItemType>();

  // @deprecated — legacy-name compat indexes (hot-upgrade window, contract
  // release 移除). key = provider model 名/别名 name；同一名多个文档时
  // isActive=true 优先、isSystem=true 优先、deterministic first-wins（按 _id 序）。
  const _llmModelNameMap = new Map<string, LLMModelItemType>();
  const _embeddingModelNameMap = new Map<string, EmbeddingModelItemType>();
  const _ttsModelNameMap = new Map<string, TTSModelType>();
  const _sttModelNameMap = new Map<string, STTModelType>();
  const _reRankModelNameMap = new Map<string, RerankModelItemType>();

  try {
    // Fetch DB models and plugin models in parallel
    const [dbModels, pluginModels] = await Promise.all([
      MongoSystemModel.find({}).lean(),
      pluginClient
        .listModels()
        .then((res) => res)
        .catch(() => [])
    ]);

    // ═══ Plugin models → modelTemplateCache (NOT pushed to model maps) ═══
    const _modelTemplateCache: ModelTemplateType[] = pluginModels.map((m) => {
      // Plugin models have a discriminated union type; extract the optional fields safely
      const pm = m as unknown as Record<string, unknown>;
      return {
        provider: getModelProvider(m.provider, language).id,
        model: m.model,
        name: m.name,
        avatar: getModelProvider(m.provider, language).avatar,
        type: m.type as ModelTypeEnum,
        defaultConfig: pm.defaultConfig as ModelTemplateType['defaultConfig'],
        fieldMap: pm.fieldMap as ModelTemplateType['fieldMap'],
        maxContext: pm.maxContext as ModelTemplateType['maxContext'],
        maxResponse: pm.maxResponse as ModelTemplateType['maxResponse'],
        vision: pm.vision as ModelTemplateType['vision'],
        functionCall: pm.functionCall as ModelTemplateType['functionCall'],
        reasoning: pm.reasoning as ModelTemplateType['reasoning'],
        toolChoice: pm.toolChoice as ModelTemplateType['toolChoice'],
        voices: pm.voices as ModelTemplateType['voices']
      } as ModelTemplateType;
    });

    // ═══ DB models → modelId-keyed maps + name compat indexes ═══
    // 1. Normalize each doc (flat & legacy metadata schemas converge here —
    //    legacy isDefault* 等标记保留，供 resolveSystemDefaults 读取)
    // 2. Sort for the name indexes: active first, then isSystem first, then
    //    _id ascending — deterministic first-wins where an active system model
    //    always shadows any other same-name model.
    // 3. Iterate once, filling both the id-keyed maps and the name indexes.
    const modelDataList = dbModels.map((dbModel) => {
      const normalized = normalizeLegacyModelDoc(
        dbModel as unknown as Record<string, unknown>
      ) as unknown as SystemModelItemType;
      const modelData = {
        ...normalized,
        id: String(dbModel._id)
      } as unknown as SystemModelItemType;

      // System models are platform-wide and must not carry team/creator (design §2.2).
      // Write-side (create/updateWithJson) already omits tmbId/teamId for system models;
      // this strip remains as a runtime safety net for legacy documents.
      if (modelData.isSystem) {
        modelData.tmbId = undefined;
        modelData.teamId = undefined;
      }

      return modelData;
    });

    for (const modelData of modelDataList) {
      _systemModelList.push(modelData);
      _systemModelIdMap.set(modelData.id, modelData);

      if (modelData.type === ModelTypeEnum.llm) {
        modelData.priceTiers = getRuntimeResolvedPriceTiers(modelData);
        _llmModelIdMap.set(modelData.id, modelData);
      } else if (modelData.type === ModelTypeEnum.embedding) {
        _embeddingModelIdMap.set(modelData.id, modelData);
      } else if (modelData.type === ModelTypeEnum.tts) {
        _ttsModelIdMap.set(modelData.id, modelData);
      } else if (modelData.type === ModelTypeEnum.stt) {
        _sttModelIdMap.set(modelData.id, modelData);
      } else if (modelData.type === ModelTypeEnum.rerank) {
        _reRankModelIdMap.set(modelData.id, modelData);
      }
    }

    // Sort only the compatibility index source. Keep systemModelList in DB order.
    const nameIndexModels = modelDataList.slice().sort((a, b) => {
      const aActive = a.isActive !== false ? 1 : 0;
      const bActive = b.isActive !== false ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      const aSystem = a.isSystem ? 1 : 0;
      const bSystem = b.isSystem ? 1 : 0;
      if (aSystem !== bSystem) return bSystem - aSystem;
      return a.id < b.id ? -1 : 1;
    });
    for (const modelData of nameIndexModels) {
      registerNameMap(modelData, _systemModelNameMap);
      if (modelData.type === ModelTypeEnum.llm) {
        registerNameMap(modelData, _llmModelNameMap);
      } else if (modelData.type === ModelTypeEnum.embedding) {
        registerNameMap(modelData, _embeddingModelNameMap);
      } else if (modelData.type === ModelTypeEnum.tts) {
        registerNameMap(modelData, _ttsModelNameMap);
      } else if (modelData.type === ModelTypeEnum.stt) {
        registerNameMap(modelData, _sttModelNameMap);
      } else if (modelData.type === ModelTypeEnum.rerank) {
        registerNameMap(modelData, _reRankModelNameMap);
      }
    }

    // ═══ Active models ═══
    const _systemActiveModelList = _systemModelList.filter((m) => m.isActive);

    // Sort by provider order
    _systemActiveModelList.sort((a, b) => {
      const providerA = getModelProvider(a.provider, language);
      const providerB = getModelProvider(b.provider, language);
      return providerA.order - providerB.order;
    });

    // ═══ Load default models from default_models table ═══
    const _systemDefaultModel = await loadDefaultModels(_systemModelIdMap, _systemActiveModelList);

    // ═══ Assign to global ═══
    global.systemModelList = _systemModelList;
    global.systemModelIdMap = _systemModelIdMap;
    global.systemModelNameMap = _systemModelNameMap;
    global.llmModelIdMap = _llmModelIdMap;
    global.embeddingModelIdMap = _embeddingModelIdMap;
    global.ttsModelIdMap = _ttsModelIdMap;
    global.sttModelIdMap = _sttModelIdMap;
    global.reRankModelIdMap = _reRankModelIdMap;
    // @deprecated — name 兼容索引同步赋值（热升级窗口期，contract release 移除）
    global.llmModelNameMap = _llmModelNameMap;
    global.embeddingModelNameMap = _embeddingModelNameMap;
    global.ttsModelNameMap = _ttsModelNameMap;
    global.sttModelNameMap = _sttModelNameMap;
    global.reRankModelNameMap = _reRankModelNameMap;
    global.systemActiveModelList = _systemActiveModelList;
    global.systemDefaultModel = _systemDefaultModel;
    global.modelTemplateCache = _modelTemplateCache;

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

export const watchSystemModelUpdate = () => {
  const changeStream = MongoSystemModel.watch();

  return changeStream.on(
    'change',
    debounce(async () => {
      try {
        await loadSystemModels(true);
        await reloadFastGPTConfigBuffer();
        await refreshVersionKey(SystemCacheKeyEnum.modelPermission, '*');
      } catch (error) {
        const logger = getLogger(LogCategories.MODULE.AI.CONFIG);
        logger.error('System model change stream handler failed', { error });
      }
    }, 500)
  );
};

/** Reload model caches when the singleton system-default document changes. */
export const watchSystemDefaultModelUpdate = () => {
  const changeStream = MongoDefaultModel.watch();

  return changeStream.on(
    'change',
    debounce(async () => {
      try {
        await loadSystemModels(true);
        await reloadFastGPTConfigBuffer();
        await refreshVersionKey(SystemCacheKeyEnum.modelPermission, '*');
      } catch (error) {
        const logger = getLogger(LogCategories.MODULE.AI.CONFIG);
        logger.error('System default model change stream handler failed', { error });
      }
    }, 500)
  );
};

export const updatedReloadSystemModel = async () => {
  await loadSystemModels(true);
  await updateFastGPTConfigBuffer();
  await refreshVersionKey(SystemCacheKeyEnum.modelPermission, '*');
  await delay(1000);
};

export const cronRefreshModels = async () => {
  setCron('*/5 * * * *', async () => {
    await loadSystemModels(true);
    await updateFastGPTConfigBuffer();
  });
};
