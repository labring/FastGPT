import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { type GetPluginTagListResponse } from '@fastgpt/global/openapi/core/plugin/toolTag/api';

export type GetPluginTagListQuery = {};

export type GetPluginTagListBody = {};

async function handler(
  req: ApiRequestProps<GetPluginTagListBody, GetPluginTagListQuery>,
  res: ApiResponseType<any>
): Promise<GetPluginTagListResponse> {
  await authCert({ req, authToken: true });

  return await MongoPluginToolTag.find().sort({ tagOrder: 1 }).lean();
}

export default NextAPI(handler);
