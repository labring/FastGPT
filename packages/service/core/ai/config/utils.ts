import type { SystemDefaultModelType, SystemModelItemType } from '../type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { MongoSystemModel } from './schema';
import {
  type LLMModelItemType,
  type EmbeddingModelItemType,
  type TTSModelType,
  type STTModelType,
  type RerankModelItemType
} from '@fastgpt/global/core/ai/model.d';
import { debounce } from 'lodash';
import { getModelProvider } from '../../../core/app/provider/controller';
import { findModelFromAlldata } from '../model';
import {
  reloadFastGPTConfigBuffer,
  updateFastGPTConfigBuffer
} from '../../../common/system/config/controller';
import { delay } from '@fastgpt/global/common/system/utils';
import { pluginClient } from '../../../thirdProvider/fastgptPlugin';
import { setCron } from '../../../common/system/cron';
import { preloadModelProviders } from '../../../core/app/provider/controller';
import { refreshVersionKey } from '../../../common/cache';
import { SystemCacheKeyEnum } from '../../../common/cache/type';

export const loadSystemModels = async (init = false, language = 'en') => {
  if (!init && global.systemModelList) return;

  try {
    await preloadModelProviders();
  } catch (error) {
    console.log('Load systen model error, please check fastgpt-plugin', error);
    return Promise.reject(error);
  }

  let _systemModelList: SystemModelItemType[] = [];
  let _systemActiveModelList: SystemModelItemType[] = [];
  let _llmModelMap = new Map<string, LLMModelItemType>();
  let _embeddingModelMap = new Map<string, EmbeddingModelItemType>();
  let _ttsModelMap = new Map<string, TTSModelType>();
  let _sttModelMap = new Map<string, STTModelType>();
  let _reRankModelMap = new Map<string, RerankModelItemType>();
  let _systemDefaultModel: SystemDefaultModelType = {};

  if (!global.systemModelList) {
    global.systemModelList = [];
    global.systemActiveModelList = [];
    global.llmModelMap = new Map<string, LLMModelItemType>();
    global.embeddingModelMap = new Map<string, EmbeddingModelItemType>();
    global.ttsModelMap = new Map<string, TTSModelType>();
    global.sttModelMap = new Map<string, STTModelType>();
    global.reRankModelMap = new Map<string, RerankModelItemType>();
    global.systemDefaultModel = {};
    global.systemActiveDesensitizedModels = [];
  }

  const pushModel = (model: SystemModelItemType) => {
    _systemModelList.push(model);

    // Add default value
    if (model.type === ModelTypeEnum.llm) {
      model.datasetProcess = model.datasetProcess ?? true;
      model.usedInClassify = model.usedInClassify ?? true;
      model.usedInExtractFields = model.usedInExtractFields ?? true;
      model.usedInToolCall = model.usedInToolCall ?? true;
      model.useInEvaluation = model.useInEvaluation ?? true;
    }

    if (model.isActive) {
      _systemActiveModelList.push(model);

      if (model.type === ModelTypeEnum.llm) {
        _llmModelMap.set(model.model, model);
        _llmModelMap.set(model.name, model);
        if (model.isDefault) {
          _systemDefaultModel.llm = model;
        }
        if (model.isDefaultDatasetTextModel) {
          _systemDefaultModel.datasetTextLLM = model;
        }
        if (model.isDefaultDatasetImageModel) {
          _systemDefaultModel.datasetImageLLM = model;
        }
      } else if (model.type === ModelTypeEnum.embedding) {
        _embeddingModelMap.set(model.model, model);
        _embeddingModelMap.set(model.name, model);
        if (model.isDefault) {
          _systemDefaultModel.embedding = model;
        }
      } else if (model.type === ModelTypeEnum.tts) {
        _ttsModelMap.set(model.model, model);
        _ttsModelMap.set(model.name, model);
        if (model.isDefault) {
          _systemDefaultModel.tts = model;
        }
      } else if (model.type === ModelTypeEnum.stt) {
        _sttModelMap.set(model.model, model);
        _sttModelMap.set(model.name, model);
        if (model.isDefault) {
          _systemDefaultModel.stt = model;
        }
      } else if (model.type === ModelTypeEnum.rerank) {
        _reRankModelMap.set(model.model, model);
        _reRankModelMap.set(model.name, model);
        if (model.isDefault) {
          _systemDefaultModel.rerank = model;
        }
      }
    }
  };

  try {
    // Get model from db and plugin
    const [dbModels, systemModels] = await Promise.all([
      MongoSystemModel.find({}).lean(),
      pluginClient.model.list().then((res) => {
        if (res.status === 200) return res.body;
        console.error('Get fastGPT plugin model error');
        return [];
      })
    ]);

    // Load system model from local
    systemModels.forEach((model) => {
      const mergeObject = (obj1: any, obj2: any) => {
        if (!obj1 && !obj2) return undefined;
        const formatObj1 = typeof obj1 === 'object' ? obj1 : {};
        const formatObj2 = typeof obj2 === 'object' ? obj2 : {};
        return { ...formatObj1, ...formatObj2 };
      };

      const dbModel = dbModels.find((item) => item.model === model.model);
      const provider = getModelProvider(dbModel?.metadata?.provider || model.provider, language);

      const modelData: any = {
        ...model,
        ...dbModel?.metadata,
        provider: provider.id,
        avatar: provider.avatar,
        type: dbModel?.metadata?.type || model.type,
        isCustom: false,

        ...(model.type === ModelTypeEnum.llm && {
          maxResponse: model.maxTokens || 4000
        }),

        ...(model.type === ModelTypeEnum.llm && dbModel?.metadata?.type === ModelTypeEnum.llm
          ? {
              maxResponse: dbModel?.metadata?.maxResponse ?? model.maxTokens ?? 4000,
              defaultConfig: mergeObject(model.defaultConfig, dbModel?.metadata?.defaultConfig),
              fieldMap: mergeObject(model.fieldMap, dbModel?.metadata?.fieldMap),
              maxTokens: undefined
            }
          : {})
      };
      pushModel(modelData);
    });

    // Custom model(Not in system config)
    dbModels.forEach((dbModel) => {
      if (_systemModelList.find((item) => item.model === dbModel.model)) return;

      pushModel({
        ...dbModel.metadata,
        isCustom: true
      });
    });

    // Default model check
    {
      if (!_systemDefaultModel.llm) {
        _systemDefaultModel.llm = Array.from(_llmModelMap.values())[0];
      }
      if (!_systemDefaultModel.datasetTextLLM) {
        _systemDefaultModel.datasetTextLLM = Array.from(_llmModelMap.values()).find(
          (item) => item.datasetProcess
        );
      }
      if (!_systemDefaultModel.datasetImageLLM) {
        _systemDefaultModel.datasetImageLLM = Array.from(_llmModelMap.values()).find(
          (item) => item.vision
        );
      }
      if (!_systemDefaultModel.embedding) {
        _systemDefaultModel.embedding = Array.from(_embeddingModelMap.values())[0];
      }
      if (!_systemDefaultModel.tts) {
        _systemDefaultModel.tts = Array.from(_ttsModelMap.values())[0];
      }
      if (!_systemDefaultModel.stt) {
        _systemDefaultModel.stt = Array.from(_sttModelMap.values())[0];
      }
      if (!_systemDefaultModel.rerank) {
        _systemDefaultModel.rerank = Array.from(_reRankModelMap.values())[0];
      }
    }

    // Sort model list
    _systemActiveModelList.sort((a, b) => {
      const providerA = getModelProvider(a.provider, language);
      const providerB = getModelProvider(b.provider, language);
      return providerA.order - providerB.order;
    });

    // Set global value
    {
      global.systemModelList = _systemModelList;
      global.systemActiveModelList = _systemActiveModelList;
      global.llmModelMap = _llmModelMap;
      global.embeddingModelMap = _embeddingModelMap;
      global.ttsModelMap = _ttsModelMap;
      global.sttModelMap = _sttModelMap;
      global.reRankModelMap = _reRankModelMap;
      global.systemDefaultModel = _systemDefaultModel;
      global.systemActiveDesensitizedModels = _systemActiveModelList.map((model) => ({
        ...model,
        defaultSystemChatPrompt: undefined,
        fieldMap: undefined,
        defaultConfig: undefined,
        weight: undefined,
        dbConfig: undefined,
        queryConfig: undefined,
        requestUrl: undefined,
        requestAuth: undefined
      })) as SystemModelItemType[];
    }

    console.log(
      JSON.stringify(
        _systemActiveModelList.map((item) => ({
          provider: item.provider,
          model: item.model,
          name: item.name
        })),
        null,
        2
      ),
      `Load models success, total: ${_systemModelList.length}, active: ${_systemActiveModelList.length}`
    );
  } catch (error) {
    console.error('Load models error', error);

    return Promise.reject(error);
  }
};

export const getSystemModelConfig = async (model: string): Promise<SystemModelItemType> => {
  const modelData = findModelFromAlldata(model);
  if (!modelData) return Promise.reject('Model is not found');
  if (modelData.isCustom) return Promise.reject('Custom model not data');

  // Read file
  const modelDefaulConfig = await pluginClient.model.list().then((res) => {
    if (res.status === 200) {
      return res.body.find((item) => item.model === model) as SystemModelItemType;
    }

    return Promise.reject('Can not get model config from plugin');
  });

  return {
    ...modelDefaulConfig,
    provider: modelData.provider,
    isCustom: false
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
      } catch (error) {}
    }, 500)
  );
};

// 更新完模型后，需要重载缓存
export const updatedReloadSystemModel = async () => {
  // 1. 更新模型（所有节点都会触发）
  await loadSystemModels(true);
  // 2. 更新缓存（仅主节点触发）
  await updateFastGPTConfigBuffer();
  await refreshVersionKey(SystemCacheKeyEnum.modelPermission, '*');
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
