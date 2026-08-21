import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import {
  getTeamPluginSource,
  isDebugToolSource,
  isTeamPluginSource
} from '@fastgpt/global/core/app/tool/utils';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type {
  FlowNodeTemplateType,
  NodeTemplateListItemType
} from '@fastgpt/global/core/workflow/type/node';
import { PluginStatusEnum, type PluginStatusType } from '@fastgpt/global/core/plugin/type';
import pLimit from 'p-limit';
import { getUserDetail } from '../../../../support/user/controller';
import { pluginClient } from '../../../../thirdProvider/fastgptPlugin';
import { getClientToolPreviewNode } from '../utils/client';
import {
  assertTeamPluginSourceAccess,
  getRawPluginIdFromSystemToolId,
  getTeamPluginPolicyMap,
  resolveTeamPluginList
} from '../../../plugin/teamPluginPolicy';
import { SystemToolRepo } from './systemTool.repo';

export type AuthorizedSystemToolListItem = NodeTemplateListItemType & { source: string };

export type AuthorizedSystemToolTemplate = {
  toolId: string;
  source: string;
  template: FlowNodeTemplateType;
};

type SystemToolCapabilityContext = {
  teamId: string;
  tmbId: string;
  isRoot: boolean;
  lang: localeType;
};

type SystemToolTemplateListParams = SystemToolCapabilityContext & {
  tags?: string[];
  parentId?: string;
  searchKey?: string;
  source?: string;
};

const getSearchRegex = (searchKey?: string) => {
  const trimmedSearchKey = searchKey?.trim();
  if (!trimmedSearchKey) return;
  return new RegExp(replaceRegChars(trimmedSearchKey), 'i');
};

/** Agent 工具选择列表只展示仍可新增配置的工具。 */
const isSelectableToolStatus = (status?: PluginStatusType) =>
  status === undefined || status === PluginStatusEnum.Normal;

const filterTemplateBySearchKey = (
  template: NodeTemplateListItemType & { toolDescription?: string },
  searchRegex?: RegExp
) => {
  if (!searchRegex) return true;
  return [
    template.name,
    template.intro,
    template.instructions,
    template.toolDescription,
    ...(template.tags ?? [])
  ].some((text) => searchRegex.test(String(text ?? '')));
};

const getActiveDebugSource = async ({ tmbId, source }: { tmbId: string; source?: string }) => {
  const status = await pluginClient.getDebugSessionStatus({ tmbId }).catch(() => undefined);
  if (
    status?.enabled &&
    (status.status === 'enabled' || status.status === 'connected') &&
    isDebugToolSource(status.source) &&
    (!source || status.source === source)
  ) {
    return status.source;
  }
};

/**
 * 按当前 Web 规则返回用户可选择的系统工具目录。
 * source 是模板身份的一部分，调用方不得只按 toolId 去重。
 */
const getSystemToolTemplateList = async ({
  teamId,
  tmbId,
  isRoot,
  lang,
  userTags,
  tags,
  parentId,
  searchKey,
  source
}: SystemToolTemplateListParams & { userTags: string[] }): Promise<
  AuthorizedSystemToolListItem[]
> => {
  const systemToolRepo = SystemToolRepo.getInstance();
  const searchRegex = getSearchRegex(searchKey);

  if (parentId) {
    if (isTeamPluginSource(source)) {
      await assertTeamPluginSourceAccess({
        teamId,
        source,
        pluginId: getRawPluginIdFromSystemToolId(parentId)
      });
    }
    const parentSource = isDebugToolSource(source)
      ? await getActiveDebugSource({ tmbId, source })
      : source;
    const parent = await systemToolRepo.getSystemToolDisplayInfoWithChildIcons({
      pluginId: parentId,
      lang,
      source: parentSource ?? 'system'
    });
    if (!isSelectableToolStatus(parent.status)) return [];

    return (
      parent.children
        ?.filter((child) => isSelectableToolStatus(child.status))
        .map<AuthorizedSystemToolListItem>((child) => ({
          ...parent,
          templateType: FlowNodeTemplateTypeEnum.tools,
          flowNodeType: FlowNodeTypeEnum.tool,
          name: child.name,
          intro: child.description,
          toolDescription: child.toolDescription,
          id: `${parentId}/${child.id}`,
          source: isTeamPluginSource(source) ? source : parent.source,
          avatar: child.icon ?? parent.avatar,
          currentCost: child.currentCost,
          systemKeyCost: child.systemKeyCost,
          hasTokenFee: parent.hasTokenFee,
          status: child.status
        }))
        .filter((item) => filterTemplateBySearchKey(item, searchRegex)) ?? []
    );
  }

  const debugSource = await getActiveDebugSource({ tmbId });
  const [tools, policyMap] = await Promise.all([
    systemToolRepo.getSystemToolList({
      lang,
      op: 'or',
      sources: ['system', getTeamPluginSource(teamId), ...(debugSource ? [debugSource] : [])],
      tags
    }),
    getTeamPluginPolicyMap(teamId)
  ]);

  return resolveTeamPluginList({
    teamId,
    tools,
    policyMap,
    canManage: false
  })
    .sort((a, b) => Number(isDebugToolSource(b.source)) - Number(isDebugToolSource(a.source)))
    .filter((item) => {
      if (!isSelectableToolStatus(item.status)) return false;
      if (isRoot) return true;
      return !item.hideTags?.some((tag) => userTags.includes(tag));
    })
    .map<AuthorizedSystemToolListItem>((tool) => ({
      ...tool,
      templateType: FlowNodeTemplateTypeEnum.tools,
      flowNodeType: tool.isToolSet ? FlowNodeTypeEnum.toolSet : FlowNodeTypeEnum.tool,
      source: tool.source,
      name: tool.name,
      intro: tool.intro,
      instructions: tool.userGuide ?? '',
      toolDescription: tool.toolDescription,
      tags: tool.tags
    }))
    .filter((item) => filterTemplateBySearchKey(item, searchRegex));
};

export const listAuthorizedSystemToolTemplates = async (
  params: SystemToolTemplateListParams
): Promise<AuthorizedSystemToolListItem[]> => {
  const userDetail = await getUserDetail({ tmbId: params.tmbId });
  return getSystemToolTemplateList({
    ...params,
    userTags: userDetail.tags ?? []
  });
};

/** 为 Workflow Builder 生成当前请求可用的完整脱敏系统工具模板。 */
export const getAuthorizedSystemToolTemplateCatalog = async (
  context: SystemToolCapabilityContext
): Promise<AuthorizedSystemToolTemplate[]> => {
  const userDetail = await getUserDetail({ tmbId: context.tmbId });
  const userTags = userDetail.tags ?? [];
  const topLevelTemplates = await getSystemToolTemplateList({ ...context, userTags });
  const childTemplateGroups = await Promise.all(
    topLevelTemplates
      .filter((item) => item.flowNodeType === FlowNodeTypeEnum.toolSet)
      .map((item) =>
        getSystemToolTemplateList({
          ...context,
          userTags,
          parentId: item.id,
          source: item.source
        })
      )
  );
  const templates = [...topLevelTemplates, ...childTemplateGroups.flat()];
  const uniqueTemplates = [
    ...new Map(templates.map((item) => [`${item.source}\u0000${item.id}`, item])).values()
  ];
  const limit = pLimit(8);

  return Promise.all(
    uniqueTemplates.map((item) =>
      limit(async () => ({
        toolId: item.id,
        source: item.source,
        template: await getClientToolPreviewNode({
          appId: item.id,
          source: item.source,
          getLatestVersion: true,
          lang: context.lang
        })
      }))
    )
  );
};
