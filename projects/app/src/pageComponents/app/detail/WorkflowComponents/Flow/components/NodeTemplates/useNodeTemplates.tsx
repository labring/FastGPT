import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type {
  NodeTemplateContext,
  NodeTemplateListItemType
} from '@fastgpt/global/core/workflow/type/node';
import { isTemplateVisible } from '@fastgpt/global/core/workflow/template/context';
import { getTeamAppTemplatesV2, getAppToolTemplates } from '@/web/core/app/api/tool';
import { TemplateTypeEnum } from './header';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { AppContext } from '@/pageComponents/app/detail/context';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';

export const useNodeTemplates = (context: NodeTemplateContext | null = null) => {
  const [templateType, setTemplateType] = useState(TemplateTypeEnum.basic);

  const [searchKey, setSearchKey] = useState('');

  const [parentId, setParentId] = useState<ParentIdType>('');
  const [parentSource, setParentSource] = useState<string>();
  // 进入目录/面包屑只携带 ID，保留已加载父项类型，避免再次查询详情。
  const parentTypes = useRef(new Map<string, AppTypeEnum>());
  const [parentType, setParentType] = useState<AppTypeEnum>();

  const appId = useContextSelector(AppContext, (v) => v.appDetail._id);
  const { basicNodeTemplates, getNodeList, nodeAmount } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const { data: toolTags = [] } = useRequest(getPluginToolTags, {
    manual: false
  });

  const isTeamTemplate =
    templateType === TemplateTypeEnum.myTools || templateType === TemplateTypeEnum.agent;
  const teamTemplateTypes =
    templateType === TemplateTypeEnum.myTools
      ? [
          AppTypeEnum.toolFolder,
          AppTypeEnum.workflowTool,
          AppTypeEnum.mcpToolSet,
          AppTypeEnum.httpToolSet
        ]
      : [AppTypeEnum.folder, AppTypeEnum.simple, AppTypeEnum.workflow];

  const {
    data: teamTemplates,
    isLoading: teamTemplatesIsLoading,
    ScrollData: TeamScrollData
  } = useScrollPagination(getTeamAppTemplatesV2, {
    params: {
      parentId,
      searchKey: searchKey || undefined,
      type: teamTemplateTypes,
      parentType: templateType === TemplateTypeEnum.myTools && parentId ? parentType : undefined,
      excludeAppId: appId
    },
    pageSize: 20,
    disabled: !isTeamTemplate,
    refreshDeps: [isTeamTemplate, templateType, parentId, searchKey, appId]
  });

  useEffect(() => {
    (
      teamTemplates as (NodeTemplateListItemType & { appType?: AppTypeEnum })[] | undefined
    )?.forEach(({ id, appType }) => {
      if (appType) parentTypes.current.set(id, appType);
    });
  }, [teamTemplates]);

  const { data: basicNodes } = useRequest(
    async () => {
      if (templateType === TemplateTypeEnum.basic) {
        return basicNodeTemplates
          .filter((item) => {
            if (item.flowNodeType === FlowNodeTypeEnum.queryExtension) return false;
            // unique node filter
            if (item.unique) {
              const nodeExist = getNodeList().some(
                (node) => node.flowNodeType === item.flowNodeType
              );
              if (nodeExist) {
                return false;
              }
            }
            return isTemplateVisible(item, context);
          })
          .map<NodeTemplateListItemType>((item) => ({
            id: item.id,
            flowNodeType: item.flowNodeType,
            templateType: item.templateType,
            avatar: item.avatar,
            name: item.name,
            intro: item.intro,
            isTool: item.isTool
          }));
      }
    },
    {
      manual: false,
      throttleWait: 100,
      refreshDeps: [basicNodeTemplates, nodeAmount, templateType, context]
    }
  );

  const {
    data: systemTools,
    loading: templatesIsLoading,
    runAsync: loadSystemTools
  } = useRequest(
    async ({
      parentId,
      searchVal,
      tags,
      source
    }: {
      parentId?: ParentIdType;
      searchVal?: string;
      tags?: string[];
      source?: string;
    }) =>
      getAppToolTemplates({
        searchKey: searchVal,
        parentId,
        source: parentId ? source : undefined,
        tags
      }),
    {
      onSuccess(list: (NodeTemplateListItemType & { appType?: AppTypeEnum })[] | undefined) {
        list?.forEach(({ id, appType }) => {
          if (appType) parentTypes.current.set(id, appType);
        });
      }
    }
  );

  /**
   * 系统工具列表的唯一加载入口：所有触发条件（切 tab、进入/退出工具集、标签、搜索）都只改状态，
   * 由这里统一发起一次请求，避免事件回调和 effect 重复请求。
   * 仅当“只有搜索词变化”时才防抖，其余变化立即请求；搜索词在目录切换时会被同时重置，此时不应等待防抖。
   */
  const lastSystemToolQuery = useRef<{
    parentId: ParentIdType;
    parentSource?: string;
    selectedTagIds: string[];
    searchKey: string;
  }>();
  useEffect(() => {
    if (templateType !== TemplateTypeEnum.systemTools) {
      // 离开系统工具 tab 后再回来必须重新请求，不能与上次的查询条件比较。
      lastSystemToolQuery.current = undefined;
      return;
    }

    const last = lastSystemToolQuery.current;
    const onlySearchKeyChanged =
      !!last &&
      last.parentId === parentId &&
      last.parentSource === parentSource &&
      last.selectedTagIds === selectedTagIds &&
      last.searchKey !== searchKey;
    lastSystemToolQuery.current = { parentId, parentSource, selectedTagIds, searchKey };

    const load = () =>
      loadSystemTools({
        parentId,
        searchVal: searchKey,
        tags: selectedTagIds,
        source: parentSource
      });

    if (!onlySearchKeyChanged) {
      load();
      return;
    }
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [loadSystemTools, parentId, parentSource, searchKey, selectedTagIds, templateType]);

  const onUpdateParentId = useCallback(
    (parentId: ParentIdType, source?: string) => {
      const nextParentSource = parentId ? (source ?? parentSource) : undefined;
      const nextParentType =
        templateType === TemplateTypeEnum.myTools && parentId
          ? parentTypes.current.get(parentId)
          : undefined;

      setSearchKey('');
      setParentType(nextParentType);
      setParentId(parentId);
      setParentSource(nextParentSource);
    },
    [parentSource, templateType]
  );
  const onUpdateTemplateType = useCallback((type: TemplateTypeEnum) => {
    setSearchKey('');
    setParentType(undefined);
    setParentId('');
    setParentSource(undefined);
    setSelectedTagIds([]);
    setTemplateType(type);
  }, []);

  const templates = useMemo(() => {
    if (templateType === TemplateTypeEnum.basic) {
      return (basicNodes || []).filter((item) =>
        context?.handleId === NodeOutputKeyEnum.selectedTools
          ? 'isTool' in item && item.isTool === true
          : true
      );
    }
    const templateList = isTeamTemplate ? teamTemplates : systemTools;
    return (templateList || []).filter((item) =>
      context?.handleId === NodeOutputKeyEnum.selectedTools
        ? 'isTool' in item && item.isTool === true
        : true
    );
  }, [
    basicNodes,
    context?.handleId,
    isTeamTemplate,
    systemTools,
    teamTemplates,
    templateType
  ]);

  return {
    templateType,
    parentId,
    parentSource,
    templatesIsLoading: isTeamTemplate ? teamTemplatesIsLoading : templatesIsLoading,
    templates,
    TeamScrollData: isTeamTemplate ? TeamScrollData : undefined,
    onUpdateParentId,
    onUpdateTemplateType,
    searchKey,
    setSearchKey,
    selectedTagIds,
    setSelectedTagIds,
    toolTags
  };
};
