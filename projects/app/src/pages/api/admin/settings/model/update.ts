import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import {
  refreshModelTemplates,
  updatedReloadSystemModel
} from '@fastgpt/service/core/ai/config/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateSystemModelBodySchema,
  type UpdateSystemModelBody
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';

async function handler(req: ApiRequestProps<UpdateSystemModelBody>): Promise<void> {
  await authSystemAdmin({ req });
  const { modelId, modelData } = parseApiInput({
    req,
    bodySchema: UpdateSystemModelBodySchema
  }).body;

  // 插件不可用时不提交数据库更新，保持数据库与当前运行时 active 集合一致。
  const pluginDocuments = await refreshModelTemplates();
  const result = await MongoAIModel.updateOne(
    { _id: modelId, scope: ModelScopeEnum.system },
    { $set: modelData }
  );
  if (result.matchedCount !== 1) return Promise.reject(ModelErrEnum.unExist);

  await updatedReloadSystemModel({ pluginDocuments });
}

export default NextAPI(handler);
