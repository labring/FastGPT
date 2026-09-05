import { ensureModelCatalogReady } from '@fastgpt/service/core/ai/config/runtime';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { SystemModelDocumentDataSchema } from '@fastgpt/global/core/ai/model.schema';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import {
  GetSystemModelConfigJsonResponseSchema,
  ImportedSystemModelSchema,
  type GetSystemModelConfigJsonResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

async function handler(req: ApiRequestProps): Promise<GetSystemModelConfigJsonResponse> {
  await authSystemAdmin({ req });
  await ensureModelCatalogReady();
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
