import { type NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import {
  GetSystemToolTemplatesBodySchema,
  GetSystemToolTemplatesResponseSchema,
  type GetSystemToolTemplatesBodyType
} from '@fastgpt/global/openapi/core/app/tool/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { PluginStatusEnum, type PluginStatusType } from '@fastgpt/global/core/plugin/type';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import {
  getTeamPluginSource,
  isDebugToolSource,
  isTeamPluginSource
} from '@fastgpt/global/core/app/tool/utils';
import {
  assertTeamPluginSourceAccess,
  getRawPluginIdFromSystemToolId,
  getTeamPluginPolicyMap,
  resolveTeamPluginList
} from '@fastgpt/service/core/plugin/teamPluginPolicy';

export type GetSystemPluginTemplatesBody = GetSystemToolTemplatesBodyType;

export async function handler(
  req: ApiRequestProps<GetSystemPluginTemplatesBody>
): Promise<NodeTemplateListItemType[]> {
  const { teamId, tmbId, isRoot } = await authCert({ req, authToken: true });
  const {
    body: { tags, parentId, searchKey, source }
  } = parseApiInput({
    req,
    bodySchema: GetSystemToolTemplatesBodySchema
  });
  const lang = getLocale(req);
  const searchRegex = getSearchRegex(searchKey);

  // Get user tags for auto-install logic
  const userDetail = await getUserDetail({ tmbId });
  const userTags = userDetail.tags || [];

  // const tools = await getSystemToolsWithInstalled({ teamId, isRoot, userTags });
  const systemToolRepo = SystemToolRepo.getInstance();
  if (parentId) {
    if (isTeamPluginSource(source)) {
      await assertTeamPluginSourceAccess({
        teamId,
        source,
        pluginId: getRawPluginIdFromSystemToolId(parentId)
      });
    }
    const parentSource = await getQuerySource({ source, tmbId });
    const parent = await systemToolRepo.getSystemToolDisplayInfoWithChildIcons({
      pluginId: parentId,
      lang,
      source: parentSource ?? 'system'
    });
    if (!isSelectableToolStatus(parent.status)) {
      return GetSystemToolTemplatesResponseSchema.parse([]);
    }

    const childTemplates =
      parent.children
        ?.filter((child) => isSelectableToolStatus(child.status))
        .map((child) => ({
          ...omitLegacyToolDescription(parent),
          templateType: FlowNodeTemplateTypeEnum.tools,
          isTool: true,
          // templateType: tool.isToolSet
          //   ? FlowNodeTemplateTypeEnum.tools
          //   : FlowNodeTemplateTypeEnum.other,
          flowNodeType: FlowNodeTypeEnum.tool,
          name: child.name,
          intro: child.description,
          id: `${parentId}/${child.id}`,
          source: isTeamPluginSource(source) ? source : parent.source,
          avatar: child.icon ?? parent.avatar,
          currentCost: child.currentCost,
          systemKeyCost: child.systemKeyCost,
          hasTokenFee: parent.hasTokenFee,
          status: child.status
        })) ?? [];

    return GetSystemToolTemplatesResponseSchema.parse(
      filterTemplatesBySearchKey(childTemplates, searchRegex)
    );
  }
  // no parentId, get all tools
  const debugSource = await getActiveDebugSource({ tmbId });
  const [tools, policyMap] = await Promise.all([
    systemToolRepo.getSystemToolList({
      lang,
      op: 'or',
      // 调试状态下追加 debug source，Agent/Workflow 仍保留生产环境插件可选。
      sources: ['system', getTeamPluginSource(teamId), ...(debugSource ? [debugSource] : [])],
      tags
    }),
    getTeamPluginPolicyMap(teamId)
  ]);

  const templates = resolveTeamPluginList({
    teamId,
    tools,
    policyMap,
    canManage: false
  })
    .sort((a, b) => Number(isDebugToolSource(b.source)) - Number(isDebugToolSource(a.source)))
    .filter((item) => {
      if (!isSelectableToolStatus(item.status)) return false;
      if (isRoot) return true;
      if (item.hideTags && item.hideTags.some((tag) => userTags.includes(tag))) return false;
      return true;
    })
    .map<NodeTemplateListItemType>((tool) => ({
      ...omitLegacyToolDescription(tool),
      templateType: FlowNodeTemplateTypeEnum.tools,
      isTool: true,
      flowNodeType: tool.isToolSet ? FlowNodeTypeEnum.toolSet : FlowNodeTypeEnum.tool,
      source: tool.source,
      name: tool.name,
      intro: tool.intro,
      instructions: tool.userGuide ?? '',
      tags: tool.tags
    }))
    .filter((item) => filterTemplateBySearchKey(item, searchRegex));

  return GetSystemToolTemplatesResponseSchema.parse(templates);
}

async function getActiveDebugSource({ tmbId, source }: { tmbId: string; source?: string }) {
  const status = await pluginClient.getDebugSessionStatus({ tmbId }).catch(() => undefined);

  if (
    status?.enabled &&
    (status.status === 'enabled' || status.status === 'connected') &&
    isDebugToolSource(status.source) &&
    (!source || status.source === source)
  ) {
    return status.source;
  }
}

async function getQuerySource({ source, tmbId }: { source?: string; tmbId: string }) {
  if (isTeamPluginSource(source)) return source;
  if (isDebugToolSource(source)) {
    return getActiveDebugSource({ tmbId, source });
  }
  return source;
}

export default NextAPI(handler);

function getSearchRegex(searchKey?: string) {
  const trimmedSearchKey = searchKey?.trim();
  if (!trimmedSearchKey) return;
  return new RegExp(replaceRegChars(trimmedSearchKey), 'i');
}

/**
 * Agent 工具选择列表只展示仍可新增配置的工具；旧应用中已选中的下线工具由节点/表单卡片继续显示状态。
 */
function isSelectableToolStatus(status?: PluginStatusType) {
  return status === undefined || status === PluginStatusEnum.Normal;
}

function filterTemplatesBySearchKey<T extends NodeTemplateListItemType>(
  templates: T[],
  searchRegex?: RegExp
) {
  if (!searchRegex) return templates;
  return templates.filter((item) => filterTemplateBySearchKey(item, searchRegex));
}

function filterTemplateBySearchKey(template: NodeTemplateListItemType, searchRegex?: RegExp) {
  if (!searchRegex) return true;

  return [template.name, template.intro, template.instructions, ...(template.tags ?? [])].some(
    (text) => searchRegex.test(String(text ?? ''))
  );
}

/** API 边界裁剪历史系统工具资源字段，兼容旧 provider 或数据库对象。 */
function omitLegacyToolDescription<T extends object>(value: T): T {
  const result = { ...value } as T & { toolDescription?: unknown };
  delete result.toolDescription;
  return result;
}
