import { NextAPI } from '@/service/middleware/entry';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelPriceTierSchema } from '@fastgpt/global/core/ai/model/schema';
import {
  GetSystemModelConfigJsonResponseSchema,
  ImportedSystemModelSchema,
  type GetSystemModelConfigJsonResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { formatDbModelToDocumentData } from '@fastgpt/service/core/ai/model/transform';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

async function handler(req: ApiRequestProps): Promise<GetSystemModelConfigJsonResponse> {
  const actor = await authUserPer({ req, authToken: true });
  if (!actor.isRoot) throw ModelErrEnum.rootOnlyPermit;

  const models = await MongoAIModel.find({ scope: ModelScopeEnum.system }).lean();

  // JSON 保存会整批替换配置。旧上限尚未回填时，运行时视图缺失上限，无法安全往返。
  const finiteBoundSchema = ModelPriceTierSchema.shape.maxInputTokensK.unwrap();
  const hasPendingTierBounds = models.some(
    (model) =>
      model.type === ModelTypeEnum.llm &&
      Array.isArray(model.pricing?.tiers) &&
      model.pricing.tiers.some(
        (tier) =>
          tier !== null &&
          typeof tier === 'object' &&
          'maxInputTokens' in tier &&
          !finiteBoundSchema.safeParse(tier.maxInputTokensK).success
      )
  );
  if (hasPendingTierBounds) {
    throw new UserError(
      'Finish the model pricing migration in System Upgrade before exporting model configuration.'
    );
  }

  return GetSystemModelConfigJsonResponseSchema.parse(
    JSON.stringify(
      models.map((model) =>
        ImportedSystemModelSchema.parse({
          ...formatDbModelToDocumentData(model),
          modelId: String(model._id)
        })
      ),
      null,
      2
    )
  );
}

export default NextAPI(handler);
