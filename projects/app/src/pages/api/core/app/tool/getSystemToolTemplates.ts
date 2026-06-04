import { type NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { NextAPI } from '@/service/middleware/entry';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';

export type GetSystemPluginTemplatesBody = {
  getAll?: boolean;
  searchKey?: string;
  parentId?: ParentIdType;
  tags?: string[];
};

export async function handler(
  req: ApiRequestProps<GetSystemPluginTemplatesBody>
): Promise<NodeTemplateListItemType[]> {
  const { teamId, tmbId, isRoot } = await authCert({ req, authToken: true });
  const { tags, parentId, searchKey } = req.body;
  const lang = getLocale(req);
  const searchRegex = getSearchRegex(searchKey);

  // Get user tags for auto-install logic
  const userDetail = await getUserDetail({ tmbId });
  const userTags = userDetail.tags || [];

  // const tools = await getSystemToolsWithInstalled({ teamId, isRoot, userTags });
  const systemToolRepo = SystemToolRepo.getInstance();
  if (parentId) {
    const parent = await systemToolRepo.getSystemToolDetail({
      pluginId: parentId,
      lang,
      source: 'system'
    });

    const childTemplates =
      parent.children?.map((child) => ({
        ...parent,
        templateType: FlowNodeTemplateTypeEnum.tools,
        // templateType: tool.isToolSet
        //   ? FlowNodeTemplateTypeEnum.tools
        //   : FlowNodeTemplateTypeEnum.other,
        flowNodeType: FlowNodeTypeEnum.tool,
        name: child.name,
        intro: child.description,
        toolDescription: child.toolDescription,
        id: `${parentId}/${child.id}`,
        avatar: child.icon ?? parent.avatar,
        currentCost: child.currentCost,
        systemKeyCost: child.systemKeyCost,
        hasTokenFee: parent.hasTokenFee
      })) ?? [];

    return filterTemplatesBySearchKey(childTemplates, searchRegex);
  }
  // no parentId, get all tools
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
      flowNodeType: tool.isToolSet ? FlowNodeTypeEnum.toolSet : FlowNodeTypeEnum.tool,
      name: tool.name,
      intro: tool.intro,
      instructions: tool.userGuide ?? '',
      toolDescription: tool.toolDescription,
      tags: tool.tags
    }))
    .filter((item) => filterTemplateBySearchKey(item, searchRegex));
}

export default NextAPI(handler);

function getSearchRegex(searchKey?: string) {
  const trimmedSearchKey = searchKey?.trim();
  if (!trimmedSearchKey) return;
  return new RegExp(replaceRegChars(trimmedSearchKey), 'i');
}

function filterTemplatesBySearchKey<T extends NodeTemplateListItemType>(
  templates: T[],
  searchRegex?: RegExp
) {
  if (!searchRegex) return templates;
  return templates.filter((item) => filterTemplateBySearchKey(item, searchRegex));
}

function filterTemplateBySearchKey(
  template: NodeTemplateListItemType & {
    toolDescription?: string;
  },
  searchRegex?: RegExp
) {
  if (!searchRegex) return true;

  return [
    template.name,
    template.intro,
    template.instructions,
    template.toolDescription,
    ...(template.tags ?? [])
  ].some((text) => searchRegex.test(String(text ?? '')));
}
