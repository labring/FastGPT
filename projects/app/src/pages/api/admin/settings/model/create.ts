import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CreateSystemModelBodySchema,
  CreateSystemModelResponseSchema,
  type CreateSystemModelBody,
  type CreateSystemModelResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { appendModelsToAIProxyChannels } from '@fastgpt/service/thirdProvider/aiproxy/channel';

async function handler(
  req: ApiRequestProps<CreateSystemModelBody>
): Promise<CreateSystemModelResponse> {
  await authSystemAdmin({ req });
  const { modelData, channelIds } = parseApiInput({
    req,
    bodySchema: CreateSystemModelBodySchema
  }).body;

  await appendModelsToAIProxyChannels({ channelIds, models: [modelData.model] });

  const model = await MongoAIModel.create({
    ...modelData,
    isActive: modelData.isActive ?? false
  });
  await updatedReloadSystemModel();

  return CreateSystemModelResponseSchema.parse({ modelId: String(model._id) });
}

export default NextAPI(handler);
