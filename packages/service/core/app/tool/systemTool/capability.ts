import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { selectPluginText } from '@fastgpt/global/common/i18n/utils';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { isToolNotExistError } from '@fastgpt/global/core/app/utils';
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
  resolveTeamPluginList,
  type TeamPluginListItem
} from '../../../plugin/teamPluginPolicy';
import { SystemToolRepo } from './systemTool.repo';
import { getLogger, LogCategories } from '../../../../common/logger';
import { withTiming } from '../../../../common/logger/timing';

const logger = getLogger(LogCategories.MODULE.APP.TOOL);
const getTimedUserDetail = withTiming(
  {
    logger,
    message: 'System tool templates stage finished',
    properties: ({ tmbId }) => ({ stage: 'user.detail', tmbId })
  },
  getUserDetail
);

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

/** 按请求语言检索插件元数据，与 Web 工具列表保持同一套多语言匹配规则。 */
const filterTemplateBySearchKey = ({
  template,
  searchRegex,
  lang
}: {
  template: NodeTemplateListItemType;
  searchRegex?: RegExp;
  lang: localeType;
}) => {
  if (!searchRegex) return true;
  return [
    selectPluginText(template.name, lang),
    selectPluginText(template.intro, lang),
    template.instructions,
    ...(template.tags ?? [])
  ].some((text) => searchRegex.test(String(text ?? '')));
};

const getActiveDebugSource = async ({ tmbId, source }: { tmbId: string; source?: string }) => {
  /** 调试通道不可用时保持原有降级结果，计时包含完整查询与降级过程。 */
  function loadDebugSession(params: { tmbId: string }) {
    return pluginClient.getDebugSessionStatus(params).catch(() => undefined);
  }
  const getDebugSessionStatus = withTiming(
    {
      logger,
      message: 'System tool templates stage finished',
      properties: ({ tmbId }) => ({ stage: 'plugin.debugSessionStatus', tmbId })
    },
    loadDebugSession
  );
  const status = await getDebugSessionStatus({ tmbId });

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

    /** 父工具不可选时整组隐藏，否则保留可选且匹配搜索条件的子工具。 */
    function filterChildTemplates(
      parent: Awaited<ReturnType<SystemToolRepo['getSystemToolDisplayInfoWithChildIcons']>>
    ): AuthorizedSystemToolListItem[] {
      if (!isSelectableToolStatus(parent.status)) return [];

      return (
        parent.children
          ?.filter((child) => isSelectableToolStatus(child.status))
          .map<AuthorizedSystemToolListItem>((child) => ({
            ...parent,
            templateType: FlowNodeTemplateTypeEnum.tools,
            isTool: true,
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
          }))
          .filter((template) => filterTemplateBySearchKey({ template, searchRegex, lang })) ?? []
      );
    }
    const filterChildren = withTiming(
      {
        logger,
        message: 'System tool templates stage finished',
        properties: (parent) => ({
          stage: 'templates.filter',
          teamId,
          parentId,
          inputCount: parent.children?.length ?? 0
        }),
        summary: (items) => ({ outputCount: items.length })
      },
      filterChildTemplates
    );
    return filterChildren(parent);
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

  /** 调试来源优先，保持同一来源内的原有顺序。 */
  function sortBySource(tools: TeamPluginListItem[]) {
    return tools.sort(
      (a, b) => Number(isDebugToolSource(b.source)) - Number(isDebugToolSource(a.source))
    );
  }

  /** 按状态、用户隐藏标签和搜索条件生成可选模板；root 只跳过隐藏标签限制。 */
  function filterSelectableTemplates(tools: TeamPluginListItem[]): AuthorizedSystemToolListItem[] {
    return tools
      .filter((item) => {
        if (!isSelectableToolStatus(item.status)) return false;
        if (isRoot) return true;
        return !item.hideTags?.some((tag) => userTags.includes(tag));
      })
      .map<AuthorizedSystemToolListItem>((tool) => ({
        ...tool,
        templateType: FlowNodeTemplateTypeEnum.tools,
        isTool: true,
        flowNodeType: tool.isToolSet ? FlowNodeTypeEnum.toolSet : FlowNodeTypeEnum.tool,
        source: tool.source,
        name: tool.name,
        intro: tool.intro,
        instructions: tool.userGuide ?? '',
        tags: tool.tags
      }))
      .filter((template) => filterTemplateBySearchKey({ template, searchRegex, lang }));
  }

  const resolvePermissions = withTiming(
    {
      logger,
      message: 'System tool templates stage finished',
      properties: ({ tools }) => ({
        stage: 'templates.resolvePermissions',
        teamId,
        inputCount: tools.length
      }),
      summary: (items) => ({ outputCount: items.length })
    },
    resolveTeamPluginList
  );
  const sortTemplates = withTiming(
    {
      logger,
      message: 'System tool templates stage finished',
      properties: (tools) => ({ stage: 'templates.sort', teamId, toolCount: tools.length })
    },
    sortBySource
  );
  const filterTemplates = withTiming(
    {
      logger,
      message: 'System tool templates stage finished',
      properties: (tools) => ({ stage: 'templates.filter', teamId, inputCount: tools.length }),
      summary: (items) => ({ outputCount: items.length })
    },
    filterSelectableTemplates
  );

  // 来源策略解析、排序和过滤分别计时，调用处保留原有顺序。
  const authorizedTools = resolvePermissions({ teamId, tools, policyMap, canManage: false });
  const sortedTools = sortTemplates(authorizedTools);
  return filterTemplates(sortedTools);
};

export const listAuthorizedSystemToolTemplates = async (
  params: SystemToolTemplateListParams
): Promise<AuthorizedSystemToolListItem[]> => {
  const userDetail = await getTimedUserDetail({ tmbId: params.tmbId });
  return getSystemToolTemplateList({
    ...params,
    userTags: userDetail.tags ?? []
  });
};

/**
 * 为 Workflow Builder 生成当前请求可用的完整脱敏系统工具模板。
 * 列表与详情之间可能发生卸载或权限变更，单个失效候选不阻断其他工具；服务异常仍向上抛出。
 */
export const getAuthorizedSystemToolTemplateCatalog = async (
  context: SystemToolCapabilityContext
): Promise<AuthorizedSystemToolTemplate[]> => {
  /** 仅忽略明确的资源失效，避免将连接失败等服务异常误判为工具不可用。 */
  const loadAvailableTool = async <T>(load: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await load();
    } catch (error) {
      const code = error instanceof Error ? error.message : error;
      if (
        code === PluginErrEnum.unExist ||
        code === PluginErrEnum.unAuth ||
        code === AppErrEnum.unExist ||
        code === AppErrEnum.unAuthApp ||
        isToolNotExistError(code)
      ) {
        return;
      }
      throw error;
    }
  };

  const userDetail = await getUserDetail({ tmbId: context.tmbId });
  const userTags = userDetail.tags ?? [];
  const topLevelTemplates = await getSystemToolTemplateList({ ...context, userTags });
  const templateGroups = await Promise.all(
    topLevelTemplates.map((item) =>
      loadAvailableTool(async () => {
        const children =
          item.flowNodeType === FlowNodeTypeEnum.toolSet
            ? await getSystemToolTemplateList({
                ...context,
                userTags,
                parentId: item.id,
                source: item.source
              })
            : [];
        return { item, children };
      })
    )
  );
  const templates = [
    ...templateGroups.flatMap((group) => (group ? [group.item] : [])),
    ...templateGroups.flatMap((group) => group?.children ?? [])
  ];
  const uniqueTemplates = [
    ...new Map(templates.map((item) => [`${item.source}\u0000${item.id}`, item])).values()
  ];
  const limit = pLimit(8);

  const loadedTemplates = await Promise.all(
    uniqueTemplates.map((item) =>
      limit(async () => {
        const template = await loadAvailableTool(() =>
          getClientToolPreviewNode({
            appId: item.id,
            teamId: context.teamId,
            source: item.source,
            getLatestVersion: true,
            lang: context.lang
          })
        );
        if (
          !template ||
          !isSelectableToolStatus(template.status) ||
          !isSelectableToolStatus(template.pluginData?.status) ||
          template.pluginData?.error
        ) {
          return;
        }

        return { toolId: item.id, source: item.source, template };
      })
    )
  );
  const availableTemplates = loadedTemplates.filter(
    (item): item is AuthorizedSystemToolTemplate => item !== undefined
  );
  const availableToolKeys = new Set(
    availableTemplates.map((item) => `${item.source}\u0000${item.toolId}`)
  );
  const parentToolKeys = new Map(
    templateGroups.flatMap(
      (group) =>
        group?.children.map(
          (child) =>
            [
              `${child.source}\u0000${child.id}`,
              `${group.item.source}\u0000${group.item.id}`
            ] as const
        ) ?? []
    )
  );
  // 父工具在详情加载时失效后，其子工具也不能单独进入目录。
  const catalog = availableTemplates.filter((item) => {
    const parentKey = parentToolKeys.get(`${item.source}\u0000${item.toolId}`);
    return parentKey === undefined || availableToolKeys.has(parentKey);
  });

  // 父模板的摘要也只保留成功加载的子工具，避免重新带入已失效的候选。
  for (const item of catalog) {
    const toolSet = item.template.toolConfig?.systemToolSet;
    if (!toolSet) continue;
    toolSet.toolList = toolSet.toolList.filter((child) =>
      availableToolKeys.has(`${item.source}\u0000${item.toolId}/${child.toolId}`)
    );
  }

  return catalog;
};
