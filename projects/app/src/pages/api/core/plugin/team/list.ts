import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  TeamPluginListItemSchema,
  type GetTeamSystemPluginListQueryType,
  type GetTeamSystemPluginListResponseType
} from '@fastgpt/global/openapi/core/plugin/team/api';
import { getSystemTools } from '@fastgpt/service/core/app/plugin/controller';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeamInstalledPlugin } from '@fastgpt/service/core/app/plugin/teamInstalledPluginSchema';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';

export type listQuery = GetTeamSystemPluginListQueryType;

export type listBody = {};

export type listResponse = GetTeamSystemPluginListResponseType;

async function handler(
  req: ApiRequestProps<listBody, listQuery>,
  res: ApiResponseType<any>
): Promise<listResponse> {
  const type = req.query.type;
  const lang = getLocale(req);

  const { teamId, isRoot } = await authCert({ req, authToken: true });

  if (type === 'tool') {
    const [tools, { installedSet, uninstalledSet }] = await Promise.all([
      getSystemTools().then((res) => res.filter((item) => !item.parentId)),
      MongoTeamInstalledPlugin.find({ teamId, pluginType: 'tool' }, 'pluginId installed')
        .lean()
        .then((res) => {
          const installedSet = new Set<string>();
          const uninstalledSet = new Set<string>();
          res.forEach((item) => {
            if (item.installed) {
              installedSet.add(item.pluginId);
            } else {
              uninstalledSet.add(item.pluginId);
            }
          });
          return { installedSet, uninstalledSet };
        })
    ]);

    return tools
      .map((tool) => {
        const installed = (() => {
          if (installedSet.has(tool.id)) {
            return true;
          }
          if (isRoot && !uninstalledSet.has(tool.id)) {
            return true;
          }
          return false;
        })();
        return TeamPluginListItemSchema.parse({
          ...tool,
          name: parseI18nString(tool.name, lang),
          intro: parseI18nString(tool.intro, lang),
          installed
        });
      })
      .filter((tool) => {
        // All installed plugins are returned
        if (tool.installed) return true;
        if (tool.status !== PluginStatusEnum.Normal) return false;
        return true;
      });
  }

  return [];
}

export default NextAPI(handler);
