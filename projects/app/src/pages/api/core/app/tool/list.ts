import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import {
  SystemToolListBodySchema,
  SystemToolListQuerySchema,
  SystemToolListResponseSchema
} from '@fastgpt/global/openapi/core/app/tool/list/dto';
import type {
  SystemToolListBodyType,
  SystemToolListQueryType,
  SystemToolListResponseType
} from '@fastgpt/global/openapi/core/app/tool/list/dto';
import { z } from 'zod';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { getSystemToolList } from '@fastgpt/service/core/app/tool/systemTool';

async function handler(
  req: ApiRequestProps<SystemToolListBodyType, SystemToolListQueryType>,
  res: ApiResponseType<SystemToolListResponseType>
): Promise<SystemToolListResponseType> {
  const body = SystemToolListBodySchema.parse(req.body);
  const query = SystemToolListQuerySchema.parse(req.query);

  const { teamId, tmbId, isRoot } = await authCert({ req, authToken: true });
  const { searchKey, tags } = req.body;

  const lang = getLocale(req);

  // Get user tags for auto-install logic
  const userDetail = await getUserDetail({ tmbId });
  const userTags = userDetail.tags || [];

  const tools = await getSystemToolList({
    op: 'or',
    sources: ['system', teamId],
    tags
  });

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
      if (getAll) return true;
      if (searchKey) {
        const regex = new RegExp(`${replaceRegChars(searchKey)}`, 'i');
        return regex.test(String(item.name)) || regex.test(String(item.intro || ''));
      }
      return item.parentId === formatParentId;
    });
  return {};
}

export default NextAPI(handler);
