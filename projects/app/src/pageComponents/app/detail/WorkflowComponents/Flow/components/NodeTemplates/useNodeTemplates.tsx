import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type {
  NodeTemplateContext,
  NodeTemplateListItemType
} from '@fastgpt/global/core/workflow/type/node';
import { isTemplateVisible } from '@fastgpt/global/core/workflow/template/context';
import { getTeamAppTemplates, getAppToolTemplates } from '@/web/core/app/api/tool';
import { TemplateTypeEnum } from './header';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { useDebounceEffect } from 'ahooks';
import { AppContext } from '@/pageComponents/app/detail/context';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export const useNodeTemplates = (context: NodeTemplateContext | null = null) => {
  const [templateType, setTemplateType] = useState(TemplateTypeEnum.basic);

  const [searchKey, setSearchKey] = useState('');
  const searchKeyLock = useRef(false);

  const [parentId, setParentId] = useState<ParentIdType>('');
  const [parentSource, setParentSource] = useState<string>();

  const appId = useContextSelector(AppContext, (v) => v.appDetail._id);
  const { basicNodeTemplates, getNodeList, nodeAmount } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const { data: toolTags = [] } = useRequest(getPluginToolTags, {
    manual: false
  });

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
    data: teamAndSystemTools,
    loading: templatesIsLoading,
    runAsync: loadNodeTemplates
  } = useRequest(
    async ({
      parentId,
      type = templateType,
      searchVal,
      tags,
      source
    }: {
      parentId?: ParentIdType;
      type?: TemplateTypeEnum;
      searchVal?: string;
      tags?: string[];
      source?: string;
    }) => {
      if (type === TemplateTypeEnum.myTools) {
        // app, workflow-plugin, mcp
        return getTeamAppTemplates({
          parentId,
          searchKey: searchVal,
          type: [
            AppTypeEnum.toolFolder,
            AppTypeEnum.workflowTool,
            AppTypeEnum.mcpToolSet,
            AppTypeEnum.httpToolSet
          ]
        }).then((res) => res.filter((app) => app.id !== appId));
      }
      if (type === TemplateTypeEnum.agent) {
        return getTeamAppTemplates({
          parentId,
          searchKey: searchVal,
          type: [AppTypeEnum.folder, AppTypeEnum.simple, AppTypeEnum.workflow]
        }).then((res) => res.filter((app) => app.id !== appId));
      }
      if (type === TemplateTypeEnum.systemTools) {
        // systemTool
        return getAppToolTemplates({
          searchKey: searchVal,
          parentId,
          source: parentId ? source : undefined,
          tags
        });
      }
    },
    {
      onSuccess() {
        searchKeyLock.current = false;
      }
    }
  );

  useDebounceEffect(
    () => {
      if (searchKeyLock.current) {
        return;
      }

      loadNodeTemplates({
        parentId,
        searchVal: searchKey,
        tags: selectedTagIds,
        source: parentSource
      });
    },
    [searchKey, parentSource],
    {
      wait: 300
    }
  );

  useEffect(() => {
    if (templateType !== TemplateTypeEnum.systemTools) return;
    loadNodeTemplates({
      parentId,
      searchVal: searchKey,
      tags: selectedTagIds,
      source: parentSource
    });
  }, [loadNodeTemplates, parentId, parentSource, searchKey, selectedTagIds, templateType]);

  const onUpdateParentId = useCallback(
    (parentId: ParentIdType, source?: string) => {
      const nextParentSource = parentId ? (source ?? parentSource) : undefined;

      searchKeyLock.current = true;
      setSearchKey('');
      setParentId(parentId);
      setParentSource(nextParentSource);
      loadNodeTemplates({ parentId, source: nextParentSource });
    },
    [loadNodeTemplates, parentSource]
  );
  const onUpdateTemplateType = useCallback(
    (type: TemplateTypeEnum) => {
      searchKeyLock.current = true;
      setSearchKey('');
      setParentId('');
      setParentSource(undefined);
      setSelectedTagIds([]);
      setTemplateType(type);
      loadNodeTemplates({ type });
    },
    [loadNodeTemplates]
  );
  const onUpdateSelectedTagIds = useCallback(
    (tags: string[]) => {
      setSelectedTagIds(tags);
      loadNodeTemplates({ parentId, searchVal: searchKey, tags, source: parentSource });
    },
    [loadNodeTemplates, parentId, parentSource, searchKey]
  );

  const templates = useMemo(() => {
    if (templateType === TemplateTypeEnum.basic) {
      return (basicNodes || []).filter((item) =>
        context?.handleId === NodeOutputKeyEnum.selectedTools ? item.isTool === true : true
      );
    }
    return (teamAndSystemTools || []).filter((item) =>
      context?.handleId === NodeOutputKeyEnum.selectedTools ? item.isTool === true : true
    );
  }, [basicNodes, teamAndSystemTools, templateType, context?.handleId]);

  return {
    templateType,
    parentId,
    parentSource,
    templatesIsLoading,
    templates,
    onUpdateParentId,
    onUpdateTemplateType,
    searchKey,
    setSearchKey,
    selectedTagIds,
    setSelectedTagIds: onUpdateSelectedTagIds,
    toolTags
  };
};
