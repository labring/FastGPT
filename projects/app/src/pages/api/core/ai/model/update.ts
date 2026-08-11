import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { findModelFromAlldata } from '@fastgpt/service/core/ai/model';
import {
  parsePersistedSystemModelConfig,
  updatedReloadSystemModel
} from '@fastgpt/service/core/ai/config/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateSystemModelBodySchema,
  UpdateSystemModelResponseSchema,
  type UpdateSystemModelBody,
  type UpdateSystemModelResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

export type updateBody = UpdateSystemModelBody;

async function handler(req: ApiRequestProps<updateBody>): Promise<UpdateSystemModelResponse> {
  await authSystemAdmin({ req });

  const { model, metadata = {} } = parseApiInput({
    req,
    bodySchema: UpdateSystemModelBodySchema
  }).body;

  const dbModel = await MongoSystemModel.findOne({ model }).lean();
  const modelData = findModelFromAlldata(model);

  const persistedMetadata = parsePersistedSystemModelConfig({
    model,
    metadata: {
      ...modelData, // system config
      ...dbModel?.metadata, // db config
      ...metadata // user config
    }
  });

  await MongoSystemModel.updateOne(
    { model },
    {
      model,
      metadata: persistedMetadata
    },
    {
      upsert: true
    }
  );

  await updatedReloadSystemModel();

  return UpdateSystemModelResponseSchema.parse(undefined);
}

export default NextAPI(handler);
