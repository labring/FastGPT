import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelScopeOperation } from '@fastgpt/service/support/permission/model/controller';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { SystemModelDocumentDataSchema } from '@fastgpt/global/core/ai/model/schema';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import {
  GetSystemModelConfigJsonResponseSchema,
  ImportedSystemModelSchema,
  type GetSystemModelConfigJsonResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(req: ApiRequestProps): Promise<GetSystemModelConfigJsonResponse> {
  await authModelScopeOperation({ req, channelType: 'system' });

  const models = await MongoAIModel.find({ scope: ModelScopeEnum.system }).lean();

  return GetSystemModelConfigJsonResponseSchema.parse(
    JSON.stringify(
      models.map((model) =>
        ImportedSystemModelSchema.parse({
          ...SystemModelDocumentDataSchema.parse(model),
          modelId: String(model._id)
        })
      ),
      null,
      2
    )
  );
}

export default NextAPI(handler);
