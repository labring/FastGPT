import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { PluginGetAccessTokenBodySchema } from '@fastgpt/global/openapi/plugin/api';
import type {
  PluginGetAccessTokenBodyType,
  PluginGetAccessTokenResponseType
} from '@fastgpt/global/openapi/plugin/api';
import { authPluginToken } from '@fastgpt/service/support/permission/auth/plugin';
import { generatePluginAccessToken } from '@fastgpt/service/support/permission/auth/pluginAccessToken';

async function handler(
  req: ApiRequestProps<PluginGetAccessTokenBodyType>,
  res: ApiResponseType<PluginGetAccessTokenResponseType>
): Promise<PluginGetAccessTokenResponseType> {
  await authPluginToken({ req });
  const { tmbId, teamId, toolId } = PluginGetAccessTokenBodySchema.parse(req.body);

  const accessToken = generatePluginAccessToken({ tmbId, teamId, toolId });

  return {
    accessToken
  };
}

export default NextAPI(handler);
