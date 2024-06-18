import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { httpApiSchema2Plugins } from '@fastgpt/global/core/app/httpPlugin/utils';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { onCreateApp, type CreateAppBody } from '../create';
import { AppSchema } from '@fastgpt/global/core/app/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

export type createHttpPluginQuery = {};

export type createHttpPluginBody = Omit<CreateAppBody, 'type' | 'modules' | 'edges'> & {
  intro?: string;
  pluginData: AppSchema['pluginData'];
};

export type createHttpPluginResponse = {};

async function handler(
  req: ApiRequestProps<createHttpPluginBody, createHttpPluginQuery>,
  res: ApiResponseType<any>
): Promise<createHttpPluginResponse> {
  const { parentId, name, intro, avatar, pluginData } = req.body;

  if (!name || !pluginData) {
    return Promise.reject('缺少参数');
  }

  const { teamId, tmbId } = await authUserPer({ req, authToken: true, per: WritePermissionVal });

  await mongoSessionRun(async (session) => {
    // create http plugin folder
    const httpPluginIid = await onCreateApp({
      parentId,
      name,
      avatar,
      intro,
      teamId,
      tmbId,
      type: AppTypeEnum.httpPlugin,
      pluginData,
      session
    });

    // compute children plugins
    const childrenPlugins = await httpApiSchema2Plugins({
      parentId: httpPluginIid,
      apiSchemaStr: pluginData.apiSchemaStr,
      customHeader: pluginData.customHeaders
    });

    // create children plugins
    for await (const item of childrenPlugins) {
      await onCreateApp({
        ...item,
        teamId,
        tmbId,
        session
      });
    }
  });

  return {};
}

export default NextAPI(handler);
