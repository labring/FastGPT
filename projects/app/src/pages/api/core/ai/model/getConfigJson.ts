import { NextAPI } from '@/service/middleware/entry';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { AIModelDocumentDataSchema } from '@fastgpt/global/core/ai/model/schema';
import {
  GetSystemModelConfigJsonResponseSchema,
  ImportedSystemModelSchema,
  type GetSystemModelConfigJsonResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

async function handler(req: ApiRequestProps): Promise<GetSystemModelConfigJsonResponse> {
  const actor = await authUserPer({ req, authToken: true });
  if (!actor.isRoot) throw ModelErrEnum.rootOnlyPermit;

  const models = await MongoAIModel.find({ scope: ModelScopeEnum.system }).lean();

  return GetSystemModelConfigJsonResponseSchema.parse(
    JSON.stringify(
      models.map((model) =>
        ImportedSystemModelSchema.parse({
          ...AIModelDocumentDataSchema.parse(model),
          modelId: String(model._id)
        })
      ),
      null,
      2
    )
  );
}

export default NextAPI(handler);
