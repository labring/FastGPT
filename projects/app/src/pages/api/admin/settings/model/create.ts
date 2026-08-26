import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import {
  refreshModelTemplates,
  updatedReloadSystemModel
} from '@fastgpt/service/core/ai/config/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CreateSystemModelBodySchema,
  CreateSystemModelResponseSchema,
  type CreateSystemModelBody,
  type CreateSystemModelResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

async function handler(
  req: ApiRequestProps<CreateSystemModelBody>
): Promise<CreateSystemModelResponse> {
  await authSystemAdmin({ req });
  const { modelData } = parseApiInput({ req, bodySchema: CreateSystemModelBodySchema }).body;

  // 插件不可用时不提交数据库更新，保持数据库与当前运行时 active 集合一致。
  const pluginDocuments = await refreshModelTemplates();
  const model = await MongoSystemModel.create(modelData);
  await updatedReloadSystemModel({ pluginDocuments });

  return CreateSystemModelResponseSchema.parse({ modelId: String(model._id) });
}

export default NextAPI(handler);
