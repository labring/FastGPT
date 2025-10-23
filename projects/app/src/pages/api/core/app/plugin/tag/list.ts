import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginTag } from '@fastgpt/service/core/app/plugin/pluginTagSchema';
import type { PluginTagSchemaType } from '@fastgpt/service/core/app/plugin/type';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export type GetPluginTagListQuery = {};

export type GetPluginTagListBody = {};

export type GetPluginTagListResponse = PluginTagSchemaType[];

async function handler(
  req: ApiRequestProps<GetPluginTagListBody, GetPluginTagListQuery>,
  res: ApiResponseType<any>
): Promise<GetPluginTagListResponse> {
  await authCert({ req, authToken: true });

  return await MongoPluginTag.find().sort({ tagOrder: 1 }).lean();
}

export default NextAPI(handler);
