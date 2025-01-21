import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { delay } from '@fastgpt/global/common/system/utils';

export type updateQuery = {};

export type updateBody = {
  model: string;
  metadata?: Record<string, any>;
};

export type updateResponse = {};

async function handler(
  req: ApiRequestProps<updateBody, updateQuery>,
  res: ApiResponseType<any>
): Promise<updateResponse> {
  await authSystemAdmin({ req });

  const { model, metadata } = req.body;

  const dbModel = await MongoSystemModel.findOne({ model }).lean();

  await MongoSystemModel.updateOne(
    { model },
    {
      model,
      metadata: { ...dbModel?.metadata, ...metadata }
    },
    {
      upsert: true
    }
  );

  await delay(1000);

  return {};
}

export default NextAPI(handler);
