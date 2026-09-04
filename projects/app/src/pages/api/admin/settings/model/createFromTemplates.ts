import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import {
  refreshModelTemplates,
  updatedReloadSystemModel
} from '@fastgpt/service/core/ai/config/utils';
import { appendModelsToAIProxyChannels } from '@fastgpt/service/thirdProvider/aiproxy/channel';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  CreateSystemModelsFromTemplatesBodySchema,
  CreateSystemModelsFromTemplatesResponseSchema,
  type CreateSystemModelsFromTemplatesBody,
  type CreateSystemModelsFromTemplatesResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

/**
 * 使用提交时的最新 Plugin 模板批量创建系统模型。
 *
 * 渠道绑定先于 MongoDB 事务执行；渠道全部成功后，模型文档在单个事务中全成全败。
 * 跨 AI Proxy 与 MongoDB 的部分失败不回滚，符合当前已确认的容错语义。
 */
async function handler(
  req: ApiRequestProps<CreateSystemModelsFromTemplatesBody>
): Promise<CreateSystemModelsFromTemplatesResponse> {
  await authSystemAdmin({ req });
  const { templates, channelIds } = parseApiInput({
    req,
    bodySchema: CreateSystemModelsFromTemplatesBodySchema
  }).body;

  const latestTemplates = await refreshModelTemplates();
  const latestTemplateMap = new Map(
    latestTemplates.map((template) => [`${template.type}:${template.model}`, template])
  );
  const selectedTemplates = templates.map((reference) => {
    const key = `${reference.type}:${reference.model}`;
    const template = latestTemplateMap.get(key);
    if (!template) throw new UserError(`Model template no longer exists: ${key}`);
    return template;
  });

  const existingModels = await MongoAIModel.find({
    scope: ModelScopeEnum.system,
    model: { $in: selectedTemplates.map(({ model }) => model) }
  })
    .select({ model: 1 })
    .lean();
  const existingModelNames = new Set(existingModels.map((model) => model.model));
  const modelsToCreate = selectedTemplates
    .filter((template) => !existingModelNames.has(template.model))
    .map((template) => ({ ...template, isActive: false }));

  await appendModelsToAIProxyChannels({
    channelIds,
    models: modelsToCreate.map((model) => model.model)
  });

  const createdModels = await mongoSessionRun(async (session) => {
    if (modelsToCreate.length === 0) return [];
    return MongoAIModel.insertMany(modelsToCreate, { session });
  });

  await updatedReloadSystemModel();

  return CreateSystemModelsFromTemplatesResponseSchema.parse({
    models: createdModels.map((model) => ({
      modelId: String(model._id),
      type: model.type,
      model: model.model
    }))
  });
}

export default NextAPI(handler);
