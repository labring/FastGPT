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
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { UserError } from '@fastgpt/global/common/error/utils';

async function handler(
  req: ApiRequestProps<CreateSystemModelBody>
): Promise<CreateSystemModelResponse> {
  await authSystemAdmin({ req });
  const { modelData, channelIds } = parseApiInput({
    req,
    bodySchema: CreateSystemModelBodySchema
  }).body;

  // 可提前识别的重名必须在 AI Proxy 写入前拒绝；数据库唯一索引继续作为并发兜底。
  const existingModel = await MongoAIModel.exists({
    scope: ModelScopeEnum.system,
    model: modelData.model
  });
  if (existingModel) {
    throw new UserError(`Model already exists: ${modelData.model}`);
  }

  await appendModelsToAIProxyChannels({ channelIds, models: [modelData.model] });

  const model = await MongoAIModel.create({
    ...modelData,
    isActive: modelData.isActive ?? false
  });
  await updatedReloadSystemModel();

  return CreateSystemModelResponseSchema.parse({ modelId: String(model._id) });
}

export default NextAPI(handler);
