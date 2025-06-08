import path from 'path';
import * as fs from 'fs';
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
import {
  getModelProvider,
  type ModelProviderIdType,
  type ModelProviderType
} from '@fastgpt/global/core/ai/provider';
import { findModelFromAlldata } from '../model';
import {
  reloadFastGPTConfigBuffer,
  updateFastGPTConfigBuffer
} from '../../../common/system/config/controller';
import { delay } from '@fastgpt/global/common/system/utils';

const getModelConfigBaseUrl = () => {
  const currentFileUrl = new URL(import.meta.url);
  const filePath = decodeURIComponent(
    process.platform === 'win32'
      ? currentFileUrl.pathname.substring(1) // Remove leading slash on Windows
      : currentFileUrl.pathname
  );
  const modelsPath = path.join(path.dirname(filePath), 'provider');
  return modelsPath;
};

/* 
  TODO: 分优先级读取：
  1. 有外部挂载目录，则读取外部的
  2. 没有外部挂载目录，则读取本地的。然后试图拉取云端的进行覆盖。
*/
export const loadSystemModels = async (init = false) => {
  const pushModel = (model: SystemModelItemType) => {
    global.systemModelList.push(model);

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
    const dbModels = await MongoSystemModel.find({}).lean();

    // Load system model from local
    const modelsPath = getModelConfigBaseUrl();
    const providerList = await fs.promises.readdir(modelsPath);
    await Promise.all(
      providerList.map(async (name) => {
        const fileContent = (await import(`./provider/${name}`))?.default as {
          provider: ModelProviderIdType;
          list: SystemModelItemType[];
        };
        const mergeObject = (obj1: any, obj2: any) => {
          if (!obj1 && !obj2) return undefined;
          const formatObj1 = typeof obj1 === 'object' ? obj1 : {};
          const formatObj2 = typeof obj2 === 'object' ? obj2 : {};
          return { ...formatObj1, ...formatObj2 };
        };

        fileContent.list.forEach((fileModel) => {
          const dbModel = dbModels.find((item) => item.model === fileModel.model);

          const modelData: any = {
            ...fileModel,
            ...dbModel?.metadata,
            // @ts-ignore
            defaultConfig: mergeObject(fileModel.defaultConfig, dbModel?.metadata?.defaultConfig),
            // @ts-ignore
            fieldMap: mergeObject(fileModel.fieldMap, dbModel?.metadata?.fieldMap),
            provider: getModelProvider(dbModel?.metadata?.provider || fileContent.provider).id,
            type: dbModel?.metadata?.type || fileModel.type,
            isCustom: false
          };

          pushModel(modelData);
        });
      })
    );

    // Custom model
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

    console.log('Load models success', JSON.stringify(global.systemActiveModelList, null, 2));
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
  const fileContent = (await import(`./provider/${modelData.provider}`))?.default as {
    provider: ModelProviderType;
    list: SystemModelItemType[];
  };

  const config = fileContent.list.find((item) => item.model === model);

  if (!config) return Promise.reject('Model config is not found');

  return {
    ...config,
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
