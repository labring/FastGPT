import { type SystemModelItemType } from '../type';
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
import { getModelProvider } from '@fastgpt/global/core/ai/provider';
import { findModelFromAlldata } from '../model';
import {
  reloadFastGPTConfigBuffer,
  updateFastGPTConfigBuffer
} from '../../../common/system/config/controller';
import { delay } from '@fastgpt/global/common/system/utils';
import { pluginClient } from '../../../thirdProvider/fastgptPlugin';
import { setCron } from '../../../common/system/cron';

export const loadSystemModels = async (init = false) => {
  const pushModel = (model: SystemModelItemType) => {
    global.systemModelList.push(model);

    // Add default value
    if (model.type === ModelTypeEnum.llm) {
      model.datasetProcess = model.datasetProcess ?? true;
      model.usedInClassify = model.usedInClassify ?? true;
      model.usedInExtractFields = model.usedInExtractFields ?? true;
      model.usedInToolCall = model.usedInToolCall ?? true;
      model.useInEvaluation = model.useInEvaluation ?? true;
    }

    if (model.isActive) {
      global.systemActiveModelList.push(model);

      if (model.type === ModelTypeEnum.llm) {
        global.llmModelMap.set(model.model, model);
        global.llmModelMap.set(model.name, model);
        if (model.isDefault) {
          global.systemDefaultModel.llm = model;
        }
        if (model.isDefaultDatasetTextModel) {
          global.systemDefaultModel.datasetTextLLM = model;
        }
        if (model.isDefaultDatasetImageModel) {
          global.systemDefaultModel.datasetImageLLM = model;
        }
      } else if (model.type === ModelTypeEnum.embedding) {
        global.embeddingModelMap.set(model.model, model);
        global.embeddingModelMap.set(model.name, model);
        if (model.isDefault) {
          global.systemDefaultModel.embedding = model;
        }
      } else if (model.type === ModelTypeEnum.tts) {
        global.ttsModelMap.set(model.model, model);
        global.ttsModelMap.set(model.name, model);
        if (model.isDefault) {
          global.systemDefaultModel.tts = model;
        }
      } else if (model.type === ModelTypeEnum.stt) {
        global.sttModelMap.set(model.model, model);
        global.sttModelMap.set(model.name, model);
        if (model.isDefault) {
          global.systemDefaultModel.stt = model;
        }
      } else if (model.type === ModelTypeEnum.rerank) {
        global.reRankModelMap.set(model.model, model);
        global.reRankModelMap.set(model.name, model);
        if (model.isDefault) {
          global.systemDefaultModel.rerank = model;
        }
      }
    }
  };

  if (!init && global.systemModelList) return;

  global.systemModelList = [];
  global.systemActiveModelList = [];
  global.llmModelMap = new Map<string, LLMModelItemType>();
  global.embeddingModelMap = new Map<string, EmbeddingModelItemType>();
  global.ttsModelMap = new Map<string, TTSModelType>();
  global.sttModelMap = new Map<string, STTModelType>();
  global.reRankModelMap = new Map<string, RerankModelItemType>();
  // @ts-ignore
  global.systemDefaultModel = {};

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
    await Promise.all(
      systemModels.map(async (model) => {
        const mergeObject = (obj1: any, obj2: any) => {
          if (!obj1 && !obj2) return undefined;
          const formatObj1 = typeof obj1 === 'object' ? obj1 : {};
          const formatObj2 = typeof obj2 === 'object' ? obj2 : {};
          return { ...formatObj1, ...formatObj2 };
        };

        const dbModel = dbModels.find((item) => item.model === model.model);

        const modelData: any = {
          ...model,
          ...dbModel?.metadata,
          provider: getModelProvider(dbModel?.metadata?.provider || (model.provider as any)).id,
          type: dbModel?.metadata?.type || model.type,
          isCustom: false,

          ...(model.type === ModelTypeEnum.llm && dbModel?.metadata?.type === ModelTypeEnum.llm
            ? {
                maxResponse: model.maxTokens ?? dbModel?.metadata?.maxResponse ?? 1000,
                defaultConfig: mergeObject(model.defaultConfig, dbModel?.metadata?.defaultConfig),
                fieldMap: mergeObject(model.fieldMap, dbModel?.metadata?.fieldMap),
                maxTokens: undefined
              }
            : {})
        };
        pushModel(modelData);
      })
    );

    // Custom model(Not in system config)
    dbModels.forEach((dbModel) => {
      if (global.systemModelList.find((item) => item.model === dbModel.model)) return;

      pushModel({
        ...dbModel.metadata,
        isCustom: true
      });
    });

    // Default model check
    if (!global.systemDefaultModel.llm) {
      global.systemDefaultModel.llm = Array.from(global.llmModelMap.values())[0];
    }
    if (!global.systemDefaultModel.datasetTextLLM) {
      global.systemDefaultModel.datasetTextLLM = Array.from(global.llmModelMap.values()).find(
        (item) => item.datasetProcess
      );
    }
    if (!global.systemDefaultModel.datasetImageLLM) {
      global.systemDefaultModel.datasetImageLLM = Array.from(global.llmModelMap.values()).find(
        (item) => item.vision
      );
    }
    if (!global.systemDefaultModel.embedding) {
      global.systemDefaultModel.embedding = Array.from(global.embeddingModelMap.values())[0];
    }
    if (!global.systemDefaultModel.tts) {
      global.systemDefaultModel.tts = Array.from(global.ttsModelMap.values())[0];
    }
    if (!global.systemDefaultModel.stt) {
      global.systemDefaultModel.stt = Array.from(global.sttModelMap.values())[0];
    }
    if (!global.systemDefaultModel.rerank) {
      global.systemDefaultModel.rerank = Array.from(global.reRankModelMap.values())[0];
    }

    // Sort model list
    global.systemActiveModelList.sort((a, b) => {
      const providerA = getModelProvider(a.provider);
      const providerB = getModelProvider(b.provider);
      return providerA.order - providerB.order;
    });

    console.log(
      `Load models success, total: ${global.systemModelList.length}, active: ${global.systemActiveModelList.length}`,
      JSON.stringify(
        global.systemActiveModelList.map((item) => ({
          provider: item.provider,
          model: item.model,
          name: item.name
        })),
        null,
        2
      )
    );
  } catch (error) {
    console.error('Load models error', error);
    // @ts-ignore
    global.systemModelList = undefined;
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

  changeStream.on(
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
