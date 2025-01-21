import path from 'path';
import * as fs from 'fs';
import { SystemModelItemType } from '../type';
import { getModelProvider } from '@fastgpt/global/core/ai/provider';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { MongoSystemModel } from './schema';
import {
  LLMModelItemType,
  EmbeddingModelItemType,
  TTSModelType,
  STTModelType,
  ReRankModelItemType
} from '@fastgpt/global/core/ai/model.d';

type FolderBaseType = `${ModelTypeEnum}`;

export const loadSystemModels = async (init = false) => {
  if (!init && global.systemModelList && global.systemModelList.length > 0) return;

  const getModelNameList = (base: FolderBaseType) => {
    const currentFileUrl = new URL(import.meta.url);
    const modelsPath = path.join(path.dirname(currentFileUrl.pathname), base);

    return fs.readdirSync(modelsPath) as string[];
  };

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

  await Promise.all(
    baseList.map(async (base) => {
      const modelList = getModelNameList(base);
      const nameList = modelList.map((name) => `${base}/${name}`);

      await Promise.all(
        nameList.map(async (name) => {
          const fileContent = (await import(`./${name}`))?.default as SystemModelItemType;

          const dbModel = dbModels.find((item) => item.model === fileContent.model);
          const provider = dbModel?.metadata?.provider || fileContent.provider;

          const model: any = {
            ...fileContent,
            ...dbModel?.metadata,
            avatar: getModelProvider(provider).avatar,
            type: dbModel?.metadata?.type || base
          };

          global.systemModelList.push(model);

          if (base === ModelTypeEnum.llm) {
            global.llmModelMap.set(model.model, model);
            global.llmModelMap.set(model.name, model);
          } else if (base === ModelTypeEnum.embedding) {
            global.embeddingModelMap.set(model.model, model);
            global.embeddingModelMap.set(model.name, model);
          } else if (base === ModelTypeEnum.tts) {
            global.ttsModelMap.set(model.model, model);
            global.ttsModelMap.set(model.name, model);
          } else if (base === ModelTypeEnum.stt) {
            global.sttModelMap.set(model.model, model);
            global.sttModelMap.set(model.name, model);
          } else if (base === ModelTypeEnum.rerank) {
            global.reRankModelMap.set(model.model, model);
            global.reRankModelMap.set(model.name, model);
          }

          if (model.isActive) {
            global.systemActiveModelList.push(model);
          }
        })
      );
    })
  );

  console.log('Load models success', JSON.stringify(global.systemModelList, null, 2));
};

export const watchSystemModelUpdate = () => {
  const changeStream = MongoSystemModel.watch();

  changeStream.on('change', () => {
    loadSystemModels(true);
  });
};
