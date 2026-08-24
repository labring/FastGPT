import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import { MongoTeamInstalledPlugin } from '@fastgpt/service/core/plugin/schema/teamInstalledPluginSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import {
  DeleteSystemToolQuerySchema,
  type DeleteSystemToolQueryType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type deletePluginQuery = DeleteSystemToolQueryType;

export type deletePluginBody = Record<string, never>;

export type deletePluginResponse = Record<string, never>;

async function handler(
  req: ApiRequestProps<deletePluginBody, deletePluginQuery>,
  _res: ApiResponseType<any>
): Promise<deletePluginResponse> {
  await authSystemAdmin({ req });

  const { toolId } = parseApiInput({ req, querySchema: DeleteSystemToolQuerySchema }).query;

  await mongoSessionRun(async (session) => {
    await MongoSystemTool.deleteOne({ pluginId: toolId }, { session });
    await MongoTeamInstalledPlugin.deleteMany({ pluginId: toolId }, { session });
  });
  return {};
}

export default NextAPI(handler);
