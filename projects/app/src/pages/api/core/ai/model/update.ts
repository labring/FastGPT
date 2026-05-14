import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { findModelFromAlldata } from '@fastgpt/service/core/ai/model';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

export type updateBody = {
  model: string;
  metadata?: Record<string, any>;
};

async function handler(req: ApiRequestProps<updateBody>, res: ApiResponseType<any>) {
  await authSystemAdmin({ req });

  const metadata = req.body.metadata;
  let { model } = req.body;
  if (!model) return Promise.reject(new Error('model is required'));
  model = model.trim();

  const dbModel = await MongoSystemModel.findOne({ model }).lean();
  const modelData = findModelFromAlldata(model);

  const metadataConcat: Record<string, any> = {
    ...modelData, // system config
    ...dbModel?.metadata, // db config
    ...metadata // user config
  };
  delete metadataConcat.avatar;
  delete metadataConcat.isCustom;

  // delete deprecated fields
  delete metadataConcat.datasetProcess;
  delete metadataConcat.usedInClassify;
  delete metadataConcat.usedInExtractFields;
  delete metadataConcat.usedInToolCall;
  delete metadataConcat.useInEvaluation;
  // TODO: 这里应该是所有模型，而不是仅LLM，我再看看
  if (metadataConcat.type === ModelTypeEnum.llm && Array.isArray(metadataConcat.priceTiers)) {
    delete metadataConcat.charsPointsPrice;
    delete metadataConcat.inputPrice;
    delete metadataConcat.outputPrice;
  }

  // 强制赋值 model，避免脏的 metadata 覆盖真实 model
  metadataConcat.model = model;
  metadataConcat.name = metadataConcat?.name?.trim();

  // Delete null value
  Object.keys(metadataConcat).forEach((key) => {
    if (metadataConcat[key] === null || metadataConcat[key] === undefined) {
      delete metadataConcat[key];
    }
  });

  // 强制更新 defaultConfig 数据类型
  if ('defaultConfig' in metadataConcat && typeof metadataConcat.defaultConfig !== 'object') {
    metadataConcat.defaultConfig = {};
  }

  await MongoSystemModel.updateOne(
    { model },
    {
      model,
      metadata: metadataConcat
    },
    {
      upsert: true
    }
  );

  await updatedReloadSystemModel();

  return {};
}

export default NextAPI(handler);
