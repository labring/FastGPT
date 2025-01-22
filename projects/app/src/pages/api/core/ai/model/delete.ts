import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { delay } from '@fastgpt/global/common/system/utils';
import { findAIModel } from '@fastgpt/service/core/ai/model';

export type deleteQuery = {
  model: string;
};

export type deleteBody = {};

export type deleteResponse = {};

async function handler(
  req: ApiRequestProps<deleteBody, deleteQuery>,
  res: ApiResponseType<any>
): Promise<deleteResponse> {
  await authSystemAdmin({ req });

  const { model } = req.query;

  const modelData = findAIModel(model);

  if (!modelData) {
    return Promise.reject('Model not found');
  }

  if (!modelData.isCustom) {
    return Promise.reject('System model cannot be deleted');
  }

  await MongoSystemModel.deleteOne({ model });

  await delay(1000);

  return {};
}

export default NextAPI(handler);
