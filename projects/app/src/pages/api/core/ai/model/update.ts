import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { getModelById } from '@fastgpt/service/core/ai/model';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authModel } from '@fastgpt/service/support/permission/model/auth';

export type updateQuery = {};

export type updateBody = {
  id: string;
  metadata?: Record<string, any>;
  isShared?: boolean;
};

export type updateResponse = {};

async function handler(
  req: ApiRequestProps<updateBody, updateQuery>,
  res: ApiResponseType<any>
): Promise<updateResponse> {
  const { id, metadata, isShared } = req.body;
  const { model: modelItem } = await authModel({
    req,
    authToken: true,
    authApiKey: true,
    modelId: id,
    per: WritePermissionVal
  });

  const dbModel = await MongoSystemModel.findById(modelItem.id).lean();
  if (!dbModel) return Promise.reject(new Error('Model not found'));
  const _id = dbModel._id;

  if (metadata && Object.keys(metadata).length > 0) {
    const metadataConcat: Record<string, any> = {
      ...getModelById(String(_id)), // system config from memory
      ...dbModel.metadata, // db config
      ...metadata // user config
    };
    delete metadataConcat.avatar;
    delete metadataConcat.isCustom;

    delete metadataConcat.datasetProcess;
    delete metadataConcat.usedInClassify;
    delete metadataConcat.usedInExtractFields;
    delete metadataConcat.usedInToolCall;
    delete metadataConcat.useInEvaluation;

    if (metadataConcat.type === 'llm' && Array.isArray(metadataConcat.priceTiers)) {
      delete metadataConcat.charsPointsPrice;
      delete metadataConcat.inputPrice;
      delete metadataConcat.outputPrice;
    }

    metadataConcat.model = dbModel.model;
    metadataConcat.name = metadataConcat?.name?.trim();

    Object.keys(metadataConcat).forEach((key) => {
      if (metadataConcat[key] === null || metadataConcat[key] === undefined) {
        delete metadataConcat[key];
      }
    });

    await MongoSystemModel.updateOne(
      { _id },
      {
        $set: {
          metadata: metadataConcat,
          ...(isShared !== undefined ? { isShared } : {})
        }
      }
    );
  } else if (isShared !== undefined) {
    await MongoSystemModel.updateOne({ _id }, { $set: { isShared } });
  }

  await updatedReloadSystemModel();

  return {};
}

export default NextAPI(handler);
