import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/types';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { findModelFromAlldata } from '@fastgpt/service/core/ai/model';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';

export type deleteQuery = {
  model: string;
};

export type deleteBody = Record<string, never>;

export type deleteResponse = Record<string, never>;

async function handler(
  req: ApiRequestProps<deleteBody, deleteQuery>,
  _res: ApiResponseType<any>
): Promise<deleteResponse> {
  await authSystemAdmin({ req });

  const { model } = req.query;

  const modelData = findModelFromAlldata(model);

  if (!modelData) {
    return Promise.reject('Model not found');
  }

  if (!modelData.isCustom) {
    return Promise.reject('System model cannot be deleted');
  }

  await MongoSystemModel.deleteOne({ model });

  await updatedReloadSystemModel();

  return {};
}

export default NextAPI(handler);
