import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { Types } from '@fastgpt/service/common/mongo';

export type updateDefaultQuery = {};

export type updateDefaultBody = {
  llmId?: string;
  embeddingId?: string;
  ttsId?: string;
  sttId?: string;
  rerankId?: string;
  datasetTextLLMId?: string;
  datasetImageLLMId?: string;
  evaluationId?: string;
};

export type updateDefaultResponse = {};

async function handler(
  req: ApiRequestProps<updateDefaultBody, updateDefaultQuery>,
  res: ApiResponseType<any>
): Promise<updateDefaultResponse> {
  await authSystemAdmin({ req });

  const {
    llmId,
    embeddingId,
    ttsId,
    sttId,
    rerankId,
    datasetTextLLMId,
    datasetImageLLMId,
    evaluationId
  } = req.body;

  await mongoSessionRun(async (session) => {
    // Remove all default flags
    await MongoSystemModel.updateMany(
      {},
      {
        $unset: {
          'metadata.isDefault': 1,
          'metadata.isDefaultDatasetTextModel': 1,
          'metadata.isDefaultDatasetImageModel': 1,
          'metadata.isDefaultEvaluationModel': 1
        }
      },
      { session }
    );

    if (llmId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(llmId) },
        { $set: { 'metadata.isDefault': true } },
        { session }
      );
    }
    if (datasetTextLLMId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(datasetTextLLMId) },
        { $set: { 'metadata.isDefaultDatasetTextModel': true } },
        { session }
      );
    }
    if (datasetImageLLMId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(datasetImageLLMId) },
        { $set: { 'metadata.isDefaultDatasetImageModel': true } },
        { session }
      );
    }
    if (evaluationId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(evaluationId) },
        { $set: { 'metadata.isDefaultEvaluationModel': true } },
        { session }
      );
    }
    if (embeddingId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(embeddingId) },
        { $set: { 'metadata.isDefault': true } },
        { session }
      );
    }
    if (ttsId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(ttsId) },
        { $set: { 'metadata.isDefault': true } },
        { session }
      );
    }
    if (sttId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(sttId) },
        { $set: { 'metadata.isDefault': true } },
        { session }
      );
    }
    if (rerankId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(rerankId) },
        { $set: { 'metadata.isDefault': true } },
        { session }
      );
    }
  });

  await updatedReloadSystemModel();

  return {};
}

export default NextAPI(handler);
