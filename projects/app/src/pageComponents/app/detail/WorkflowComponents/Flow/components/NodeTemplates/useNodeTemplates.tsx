import { useState, useMemo, useCallback, useRef } from 'react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getTeamAppTemplates, getAppToolTemplates } from '@/web/core/app/api/tool';
import { TemplateTypeEnum } from './header';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { useDebounceEffect } from 'ahooks';
import { AppContext } from '@/pageComponents/app/detail/context';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

export const useNodeTemplates = () => {
  const { feConfigs } = useSystemStore();
  const [templateType, setTemplateType] = useState(TemplateTypeEnum.basic);

  const [searchKey, setSearchKey] = useState('');
  const searchKeyLock = useRef(false);

  const [parentId, setParentId] = useState<ParentIdType>('');

  const appId = useContextSelector(AppContext, (v) => v.appDetail._id);
  const { basicNodeTemplates, hasToolNode, getNodeList, nodeAmount } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const { data: toolTags = [] } = useRequest2(getPluginToolTags, {
    manual: false
  });

  const { data: basicNodes } = useRequest2(
    async () => {
      if (templateType === TemplateTypeEnum.basic) {
        return basicNodeTemplates
          .filter((item) => {
            // unique node filter
            if (item.unique) {
              const nodeExist = getNodeList().some(
                (node) => node.flowNodeType === item.flowNodeType
              );
              if (nodeExist) {
                return false;
              }
            }
            // special node filter
            if (item.flowNodeType === FlowNodeTypeEnum.lafModule && !feConfigs.lafEnv) {
              return false;
            }
            // tool stop or tool params
            if (
              !hasToolNode &&
              (item.flowNodeType === FlowNodeTypeEnum.stopTool ||
                item.flowNodeType === FlowNodeTypeEnum.toolParams)
            ) {
              return false;
            }
            return true;
          })
          .map<NodeTemplateListItemType>((item) => ({
            id: item.id,
            flowNodeType: item.flowNodeType,
            templateType: item.templateType,
            avatar: item.avatar,
            name: item.name,
            intro: item.intro
          }));
      }
    },
    {
      manual: false,
      throttleWait: 100,
      refreshDeps: [basicNodeTemplates, nodeAmount, hasToolNode, templateType]
    }
  );

  const {
    data: teamAndSystemTools,
    loading: templatesIsLoading,
    runAsync: loadNodeTemplates
  } = useRequest2(
    async ({
      parentId,
      type = templateType,
      searchVal,
      tags
    }: {
      parentId?: ParentIdType;
      type?: TemplateTypeEnum;
      searchVal?: string;
      tags?: string[];
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

      loadNodeTemplates({ parentId, searchVal: searchKey, tags: selectedTagIds });
    },
    [searchKey],
    {
      wait: 300
    }
  );

  const onUpdateParentId = useCallback(
    (parentId: ParentIdType) => {
      searchKeyLock.current = true;
      setSearchKey('');
      setParentId(parentId);
      loadNodeTemplates({ parentId });
    },
    [loadNodeTemplates]
  );
  const onUpdateTemplateType = useCallback(
    (type: TemplateTypeEnum) => {
      searchKeyLock.current = true;
      setSearchKey('');
      setParentId('');
      setSelectedTagIds([]);
      setTemplateType(type);
      loadNodeTemplates({ type });
    },
    [loadNodeTemplates]
  );
  const onUpdateSelectedTagIds = useCallback(
    (tags: string[]) => {
      setSelectedTagIds(tags);
      loadNodeTemplates({ parentId, searchVal: searchKey, tags });
    },
    [loadNodeTemplates, parentId, searchKey]
  );

  const templates = useMemo(() => {
    if (templateType === TemplateTypeEnum.basic) {
      return basicNodes || [];
    }
    return teamAndSystemTools || [];
  }, [basicNodes, teamAndSystemTools, templateType]);

  return {
    templateType,
    parentId,
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
