import { type NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { NextAPI } from '@/service/middleware/entry';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { NextApiResponse } from 'next';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';

export type GetSystemPluginTemplatesBody = {
  getAll?: boolean;
  searchKey?: string;
  parentId?: ParentIdType;
  tags?: string[];
};

async function handler(
  req: ApiRequestProps<GetSystemPluginTemplatesBody>,
  _res: NextApiResponse<any>
): Promise<NodeTemplateListItemType[]> {
  const { teamId, tmbId, isRoot } = await authCert({ req, authToken: true });
  const { tags } = req.body;
  const lang = getLocale(req);

  // Get user tags for auto-install logic
  const userDetail = await getUserDetail({ tmbId });
  const userTags = userDetail.tags || [];

  // const tools = await getSystemToolsWithInstalled({ teamId, isRoot, userTags });
  const systemToolRepo = SystemToolRepo.getInstance();
  const tools = await systemToolRepo.getSystemToolList({
    lang,
    sources: ['system', teamId],
    tags
  });

  return tools
    .filter((item) => {
      if (isRoot) return true;
      if (item.hideTags && item.hideTags.some((tag) => userTags.includes(tag))) return false;
      return true;
    })
    .map<NodeTemplateListItemType>((tool) => ({
      ...tool,
      templateType: FlowNodeTemplateTypeEnum.tools,
      // templateType: tool.isToolSet
      //   ? FlowNodeTemplateTypeEnum.tools
      //   : FlowNodeTemplateTypeEnum.other,
      flowNodeType: tool.isToolSet ? FlowNodeTypeEnum.toolSet : FlowNodeTypeEnum.tool,
      name: tool.name,
      intro: tool.intro,
      instructions: tool.userGuide ?? '',
      toolDescription: tool.toolDescription,
      tags: tool.tags
    }));
}

export default NextAPI(handler);
