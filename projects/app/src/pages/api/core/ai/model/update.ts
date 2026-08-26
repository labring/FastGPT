import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateSystemModelBodySchema,
  UpdateSystemModelResponseSchema,
  type UpdateSystemModelBody,
  type UpdateSystemModelResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

export type updateBody = UpdateSystemModelBody;

async function handler(req: ApiRequestProps<updateBody>): Promise<UpdateSystemModelResponse> {
  await authSystemAdmin({ req });

  const { modelId, modelData: persistedDocument } = parseApiInput({
    req,
    bodySchema: UpdateSystemModelBodySchema
  }).body;

  // 管理员可更新尚未加载到运行时缓存的停用模型，因此以持久化记录判定 modelId 是否存在。
  if (modelId && !(await MongoSystemModel.exists({ _id: modelId }))) {
    return Promise.reject(ModelErrEnum.unExist);
  }

  const modelFilter = modelId ? { _id: modelId } : { model: persistedDocument.model };

  await MongoSystemModel.updateOne(
    modelFilter,
    {
      $set: persistedDocument
    },
    {
      upsert: !modelId
    }
  );

  await updatedReloadSystemModel();

  return UpdateSystemModelResponseSchema.parse(undefined);
}

export default NextAPI(handler);
