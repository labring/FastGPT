import { type NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { NextAPI } from '@/service/middleware/entry';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { NextApiResponse } from 'next';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getSystemToolsWithInstalled } from '@fastgpt/service/core/app/tool/controller';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';

export type GetSystemPluginTemplatesBody = {
  searchKey?: string;
  parentId?: ParentIdType;
  tags?: string[];
};

async function handler(
  req: ApiRequestProps<GetSystemPluginTemplatesBody>,
  _res: NextApiResponse<any>
): Promise<NodeTemplateListItemType[]> {
  const { teamId, isRoot } = await authCert({ req, authToken: true });
  const { searchKey, parentId, tags } = req.body;
  const formatParentId = parentId || null;
  const lang = getLocale(req);

  const tools = await getSystemToolsWithInstalled({ teamId, isRoot });

  return tools
    .filter((tool) => {
      if (tool.parentId) return true;
      return !!tool.installed;
    })
    .filter((tool) => {
      if (!tags || tags.length === 0) return true;
      return tool.tags?.some((tag) => tags.includes(tag));
    })
    .map<NodeTemplateListItemType>((tool) => ({
      ...tool,
      parentId: tool.parentId === undefined ? null : tool.parentId,
      templateType: tool.templateType ?? FlowNodeTemplateTypeEnum.other,
      flowNodeType: tool.isFolder ? FlowNodeTypeEnum.toolSet : FlowNodeTypeEnum.tool,
      name: parseI18nString(tool.name, lang),
      intro: parseI18nString(tool.intro ?? '', lang),
      instructions: parseI18nString(tool.userGuide ?? '', lang),
      toolDescription: tool.toolDescription,
      tags: tool.tags
    }))
    .filter((item) => {
      if (searchKey) {
        const regex = new RegExp(`${replaceRegChars(searchKey)}`, 'i');
        return regex.test(String(item.name)) || regex.test(String(item.intro || ''));
      }
      return item.parentId === formatParentId;
    });
}

export default NextAPI(handler);
