import path from 'path';
import * as fs from 'fs';
import { SystemModelItemType } from '../type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { MongoSystemModel } from './schema';
import {
  LLMModelItemType,
  EmbeddingModelItemType,
  TTSModelType,
  STTModelType,
  ReRankModelItemType
} from '@fastgpt/global/core/ai/model.d';
import { debounce } from 'lodash';

type FolderBaseType = `${ModelTypeEnum}`;

export const loadSystemModels = async (init = false) => {
  const getModelNameList = (base: FolderBaseType) => {
    const currentFileUrl = new URL(import.meta.url);
    const modelsPath = path.join(path.dirname(currentFileUrl.pathname), base);

    return fs.readdirSync(modelsPath) as string[];
  };
  const pushModel = (model: SystemModelItemType) => {
    global.systemModelList.push(model);

    if (model.isActive) {
      global.systemActiveModelList.push(model);

      if (model.type === ModelTypeEnum.llm) {
        global.llmModelMap.set(model.model, model);
        global.llmModelMap.set(model.name, model);
      } else if (model.type === ModelTypeEnum.embedding) {
        global.embeddingModelMap.set(model.model, model);
        global.embeddingModelMap.set(model.name, model);
      } else if (model.type === ModelTypeEnum.tts) {
        global.ttsModelMap.set(model.model, model);
        global.ttsModelMap.set(model.name, model);
      } else if (model.type === ModelTypeEnum.stt) {
        global.sttModelMap.set(model.model, model);
        global.sttModelMap.set(model.name, model);
      } else if (model.type === ModelTypeEnum.rerank) {
        global.reRankModelMap.set(model.model, model);
        global.reRankModelMap.set(model.name, model);
      }
    }
  };

  if (!init && global.systemModelList && global.systemModelList.length > 0) return;

  const dbModels = await MongoSystemModel.find({}).lean();

  global.systemModelList = [];
  global.systemActiveModelList = [];
  global.llmModelMap = new Map<string, LLMModelItemType>();
  global.embeddingModelMap = new Map<string, EmbeddingModelItemType>();
  global.ttsModelMap = new Map<string, TTSModelType>();
  global.sttModelMap = new Map<string, STTModelType>();
  global.reRankModelMap = new Map<string, ReRankModelItemType>();

  const baseList: FolderBaseType[] = [
    ModelTypeEnum.llm,
    ModelTypeEnum.embedding,
    ModelTypeEnum.tts,
    ModelTypeEnum.stt,
    ModelTypeEnum.rerank
  ];

  // System model
  await Promise.all(
    baseList.map(async (base) => {
      const modelList = getModelNameList(base);
      const nameList = modelList.map((name) => `${base}/${name}`);

      await Promise.all(
        nameList.map(async (name) => {
          const fileContent = (await import(`./${name}`))?.default as SystemModelItemType;

          const dbModel = dbModels.find((item) => item.model === fileContent.model);

          const model: any = {
            ...fileContent,
            ...dbModel?.metadata,
            type: dbModel?.metadata?.type || base,
            isCustom: false
          };

          pushModel(model);
        })
      );
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

  console.log('Load models success', JSON.stringify(global.systemActiveModelList, null, 2));
};

export const watchSystemModelUpdate = () => {
  const changeStream = MongoSystemModel.watch();

  changeStream.on(
    'change',
    debounce(async () => {
      try {
        await loadSystemModels(true);
      } catch (error) {}
    }, 500)
  );
};
