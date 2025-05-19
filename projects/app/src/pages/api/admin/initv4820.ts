import { readConfigData } from '@/service/common/system';
import { NextAPI } from '@/service/middleware/entry';
import {
  getFastGPTConfigFromDB,
  updateFastGPTConfigBuffer
} from '@fastgpt/service/common/system/config/controller';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextApiRequest, NextApiResponse } from 'next';
import json5 from 'json5';
import { FastGPTConfigFileType } from '@fastgpt/global/common/system/types';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { loadSystemModels } from '@fastgpt/service/core/ai/config/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';

/* 
  简单版迁移：直接升级到最新镜像，会去除 MongoDatasetData 里的索引。直接执行这个脚本。
  无缝迁移：
    1. 移动 User 表中的 avatar 字段到 TeamMember 表中。
*/
async function handler(req: NextApiRequest, res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  // load config
  const [{ config: dbConfig }, fileConfig] = await Promise.all([
    getFastGPTConfigFromDB(),
    readConfigData('config.json')
  ]);
  const fileRes = json5.parse(fileConfig) as FastGPTConfigFileType;

  const llmModels = dbConfig.llmModels || fileRes.llmModels || [];
  const vectorModels = dbConfig.vectorModels || fileRes.vectorModels || [];
  const reRankModels = dbConfig.reRankModels || fileRes.reRankModels || [];
  const audioSpeechModels = dbConfig.audioSpeechModels || fileRes.audioSpeechModels || [];
  const whisperModel = dbConfig.whisperModel || fileRes.whisperModel;

  const list = [
    ...llmModels.map((item) => ({
      ...item,
      type: ModelTypeEnum.llm
    })),
    ...vectorModels.map((item) => ({
      ...item,
      type: ModelTypeEnum.embedding
    })),
    ...reRankModels.map((item) => ({
      ...item,
      type: ModelTypeEnum.rerank
    })),
    ...audioSpeechModels.map((item) => ({
      ...item,
      type: ModelTypeEnum.tts
    })),
    {
      ...whisperModel,
      type: ModelTypeEnum.stt
    }
  ];

  for await (const item of list) {
    try {
      await MongoSystemModel.updateOne(
        { model: item.model },
        { $set: { model: item.model, metadata: { ...item, isActive: true } } },
        { upsert: true }
      );
    } catch (error) {
      console.log(error);
    }
  }

  await loadSystemModels(true);
  await updateFastGPTConfigBuffer();

  return { success: true };
}

export default NextAPI(handler);
