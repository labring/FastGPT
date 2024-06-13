import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { httpApiSchema2Plugins } from '@fastgpt/global/core/app/httpPlugin/utils';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { CreateAppBody } from '../create';
import { AppSchema } from '@fastgpt/global/core/app/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { createHttpPluginChildren } from '@fastgpt/service/core/app/controller';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';

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
    const [{ _id: httpPluginIid }] = await MongoApp.create(
      [
        {
          ...parseParentIdInMongo(parentId),
          avatar,
          name,
          intro,
          teamId,
          tmbId,
          type: AppTypeEnum.httpPlugin,
          version: 'v2',
          pluginData
        }
      ],
      { session }
    );

    // compute children plugins
    const childrenPlugins = await httpApiSchema2Plugins({
      parentId: httpPluginIid,
      apiSchemaStr: pluginData.apiSchemaStr,
      customHeader: pluginData.customHeaders
    });

    // create children plugins
    await Promise.all(
      childrenPlugins.map((item) =>
        createHttpPluginChildren({
          ...item,
          teamId,
          tmbId,
          session
        })
      )
    );
  });

  return {};
}

export default NextAPI(handler);
