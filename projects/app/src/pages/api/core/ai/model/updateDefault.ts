import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { Types } from '@fastgpt/service/common/mongo';
import {
  UpdateDefaultModelBodySchema,
  UpdateDefaultModelResponseSchema,
  type UpdateDefaultModelBody,
  type UpdateDefaultModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AdminAuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { jsonRes } from '@fastgpt/service/common/response';
import { i18nT } from '@fastgpt/global/common/i18n/utils';

async function handler(
  req: ApiRequestProps<UpdateDefaultModelBody, any>,
  res: ApiResponseType<any>
): Promise<UpdateDefaultModelResponse> {
  const { tmbId, teamId } = await authSystemAdmin({ req });

  const {
    llmId,
    embeddingId,
    ttsId,
    sttId,
    rerankId,
    datasetTextLLMId,
    datasetImageLLMId,
    evaluationId
  } = UpdateDefaultModelBodySchema.parse(req.body);

  // Verify all model IDs to be set as default are public models
  const modelIds = [
    llmId,
    embeddingId,
    ttsId,
    sttId,
    rerankId,
    datasetTextLLMId,
    datasetImageLLMId,
    evaluationId
  ].filter(Boolean) as string[];

  if (modelIds.length > 0) {
    const models = await MongoSystemModel.find(
      {
        _id: { $in: modelIds.map((id) => new Types.ObjectId(id)) }
      },
      'isShared'
    ).lean();

    const privateModels = models.filter((m) => m.isShared !== true);
    if (privateModels.length > 0) {
      jsonRes(res, {
        code: 409,
        message: i18nT('account_model:model_must_be_public_to_set_default')
      });
      return UpdateDefaultModelResponseSchema.parse({});
    }
  }

  await mongoSessionRun(async (session) => {
    // Remove all default flags
    await MongoSystemModel.updateMany(
      {},
      {
        $unset: {
          isDefault: 1,
          isDefaultDatasetTextModel: 1,
          isDefaultDatasetImageModel: 1,
          isDefaultEvaluationModel: 1
        }
      },
      { session }
    );

    if (llmId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(llmId) },
        { $set: { isDefault: true } },
        { session }
      );
    }
    if (datasetTextLLMId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(datasetTextLLMId) },
        { $set: { isDefaultDatasetTextModel: true } },
        { session }
      );
    }
    if (datasetImageLLMId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(datasetImageLLMId) },
        { $set: { isDefaultDatasetImageModel: true } },
        { session }
      );
    }
    if (evaluationId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(evaluationId) },
        { $set: { isDefaultEvaluationModel: true } },
        { session }
      );
    }
    if (embeddingId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(embeddingId) },
        { $set: { isDefault: true } },
        { session }
      );
    }
    if (ttsId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(ttsId) },
        { $set: { isDefault: true } },
        { session }
      );
    }
    if (sttId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(sttId) },
        { $set: { isDefault: true } },
        { session }
      );
    }
    if (rerankId) {
      await MongoSystemModel.updateOne(
        { _id: new Types.ObjectId(rerankId) },
        { $set: { isDefault: true } },
        { session }
      );
    }
  });

  await updatedReloadSystemModel();

  (async () => {
    addAuditLog({
      teamId,
      tmbId,
      event: AdminAuditEventEnum.ADMIN_UPDATE_MODEL_DEFAULT
    });
  })();

  return UpdateDefaultModelResponseSchema.parse({});
}

export default NextAPI(handler);
