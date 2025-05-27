import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { type PaginationProps, type PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { splitCombineToolId } from '@fastgpt/service/core/app/plugin/controller';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import { getSystemPluginTemplates } from '@fastgpt/plugins/register';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { Types } from '@fastgpt/service/common/mongo';

export type getToolVersionListProps = PaginationProps<{
  toolId?: string;
}>;

export type getToolVersionResponse = PaginationResponse<{
  _id: string;
  versionName: string;
}>;

async function handler(
  req: ApiRequestProps<getToolVersionListProps>,
  _res: NextApiResponse<any>
): Promise<getToolVersionResponse> {
  const { toolId } = req.body;
  const { offset, pageSize } = parsePaginationRequest(req);

  if (!toolId) {
    return {
      total: 0,
      list: []
    };
  }

  const { source, pluginId: formatToolId } = splitCombineToolId(toolId);

  // Auth
  const appId = await (async () => {
    if (source === PluginSourceEnum.personal) {
      const { app } = await authApp({
        appId: formatToolId,
        req,
        per: ReadPermissionVal,
        authToken: true
      });
      return app._id;
    } else {
      const item = getSystemPluginTemplates().find((plugin) => plugin.id === formatToolId);
      if (!item) return Promise.reject(PluginErrEnum.unAuth);
      return item.associatedPluginId;
    }
  })();

  if (!appId || !Types.ObjectId.isValid(appId)) {
    return {
      total: 0,
      list: []
    };
  }

  const match = {
    appId,
    isPublish: true
  };

  const [result, total] = await Promise.all([
    await MongoAppVersion.find(match, 'versionName')
      .sort({
        time: -1
      })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoAppVersion.countDocuments(match)
  ]);

  return {
    total,
    list: result
  };
}

export default NextAPI(handler);
