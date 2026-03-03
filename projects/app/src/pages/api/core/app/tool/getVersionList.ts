import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { type PaginationProps, type PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { getSystemToolByIdAndVersionId } from '@fastgpt/service/core/app/tool/controller';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { Types } from '@fastgpt/service/common/mongo';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { getMCPParentId } from '@fastgpt/global/core/app/tool/mcpTool/utils';

export type getToolVersionListProps = PaginationProps<{
  pluginId?: string;
}>;

export type getToolVersionResponse = PaginationResponse<{
  _id: string;
  versionName: string;
}>;

async function handler(
  req: ApiRequestProps<getToolVersionListProps>,
  _res: NextApiResponse<any>
): Promise<getToolVersionResponse> {
  const { pluginId } = req.body;
  const { offset, pageSize } = parsePaginationRequest(req);

  if (!pluginId) {
    return {
      total: 0,
      list: []
    };
  }

  const { source, pluginId: formatPluginId } = splitCombineToolId(pluginId);

  // System tool plugin
  if (source === AppToolSourceEnum.systemTool) {
    const item = await getSystemToolByIdAndVersionId(formatPluginId);

    return {
      total: 0,
      list:
        item.versionList?.map((item) => ({
          _id: item.value,
          versionName: item.value
        })) || []
    };
  }

  // Workflow plugin
  const appId = await (async () => {
    if (source === AppToolSourceEnum.personal || source === AppToolSourceEnum.mcp) {
      const appId = getMCPParentId(formatPluginId);
      const { app } = await authApp({
        appId,
        req,
        per: ReadPermissionVal,
        authToken: true
      });
      return app._id;
    } else {
      const item = await getSystemToolByIdAndVersionId(formatPluginId);
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
