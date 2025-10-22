import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginTag } from '@fastgpt/service/core/app/plugin/pluginTagSchema';
import type { PluginTagSchemaType } from '@fastgpt/service/core/app/plugin/type';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';

export type GetPluginTagListQuery = {};

export type GetPluginTagListBody = {};

export type GetPluginTagListResponse = PluginTagSchemaType[];

async function handler(
  req: ApiRequestProps<GetPluginTagListBody, GetPluginTagListQuery>,
  res: ApiResponseType<any>
): Promise<GetPluginTagListResponse> {
  await authSystemAdmin({ req });

  return await MongoPluginTag.find().sort({ tagOrder: 1 }).lean();
}

export default NextAPI(handler);
