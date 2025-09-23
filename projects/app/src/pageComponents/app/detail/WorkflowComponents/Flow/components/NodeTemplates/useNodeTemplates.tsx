import { useState, useMemo, useCallback, useRef } from 'react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getTeamPlugTemplates, getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import { TemplateTypeEnum } from './header';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { useDebounceEffect } from 'ahooks';

export const useNodeTemplates = () => {
  const { feConfigs } = useSystemStore();
  const [templateType, setTemplateType] = useState(TemplateTypeEnum.basic);

  const [searchKey, setSearchKey] = useState('');
  const searchKeyLock = useRef(false);

  const [parentId, setParentId] = useState<ParentIdType>('');

  const basicNodeTemplates = useContextSelector(WorkflowContext, (v) => v.basicNodeTemplates);
  const appId = useContextSelector(WorkflowContext, (state) => state.appId || '');
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const hasToolNode = useMemo(
    () => nodeList.some((node) => node.flowNodeType === FlowNodeTypeEnum.agent),
    [nodeList]
  );

  const { data: basicNodes } = useRequest2(
    async () => {
      if (templateType === TemplateTypeEnum.basic) {
        return basicNodeTemplates
          .filter((item) => {
            // unique node filter
            if (item.unique) {
              const nodeExist = nodeList.some((node) => node.flowNodeType === item.flowNodeType);
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
      refreshDeps: [basicNodeTemplates, nodeList, hasToolNode, templateType]
    }
  );

  const {
    data: teamAndSystemApps,
    loading: templatesIsLoading,
    runAsync: loadNodeTemplates
  } = useRequest2(
    async ({
      parentId,
      type = templateType,
      searchVal
    }: {
      parentId?: ParentIdType;
      type?: TemplateTypeEnum;
      searchVal?: string;
    }) => {
      if (type === TemplateTypeEnum.teamPlugin) {
        // app, workflow-plugin, mcp
        return getTeamPlugTemplates({
          parentId,
          searchKey: searchVal
        }).then((res) => res.filter((app) => app.id !== appId));
      }
      if (type === TemplateTypeEnum.systemPlugin) {
        // systemTool
        return getSystemPlugTemplates({
          searchKey: searchVal,
          parentId
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

      loadNodeTemplates({ parentId, searchVal: searchKey });
    },
    [searchKey],
    {
      wait: 300
    }
  );

  const onUpdateParentId = useCallback((parentId: ParentIdType) => {
    searchKeyLock.current = true;
    setSearchKey('');
    setParentId(parentId);
    loadNodeTemplates({ parentId });
  }, []);
  const onUpdateTemplateType = useCallback((type: TemplateTypeEnum) => {
    searchKeyLock.current = true;
    setSearchKey('');
    setParentId('');
    setTemplateType(type);
    loadNodeTemplates({ type });
  }, []);

  const templates = useMemo(() => {
    if (templateType === TemplateTypeEnum.basic) {
      return basicNodes || [];
    }
    return teamAndSystemApps || [];
  }, [basicNodes, teamAndSystemApps, templateType]);

  return {
    templateType,
    parentId,
    templatesIsLoading,
    templates,
    onUpdateParentId,
    onUpdateTemplateType,
    searchKey,
    setSearchKey
  };
};
