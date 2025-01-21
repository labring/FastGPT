import path from 'path';
import * as fs from 'fs';
import { SystemModelItemType } from './type.d';
import { getModelProvider } from '@fastgpt/global/core/ai/provider';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';

type FolderBaseType = `${ModelTypeEnum}`;

export const registerSystemModels = async () => {
  const getModelNameList = (base: FolderBaseType) => {
    const currentFileUrl = new URL(import.meta.url);
    const modelsPath = path.join(path.dirname(currentFileUrl.pathname), base);

    return fs.readdirSync(modelsPath) as string[];
  };

  global.systemModelList = [];

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
          fileContent.avatar = getModelProvider(fileContent.provider).avatar;
          fileContent.type = base;
          global.systemModelList.push(fileContent);
        })
      );
    })
  );
};
