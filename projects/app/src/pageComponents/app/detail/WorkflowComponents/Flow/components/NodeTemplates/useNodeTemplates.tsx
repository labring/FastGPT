import { useState, useMemo, useCallback } from 'react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getTeamPlugTemplates, getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import { TemplateTypeEnum } from './header';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

export const useNodeTemplates = () => {
  const { feConfigs } = useSystemStore();
  const [templateType, setTemplateType] = useState(TemplateTypeEnum.basic);
  const [parentId, setParentId] = useState<ParentIdType>('');

  const basicNodeTemplates = useContextSelector(WorkflowContext, (v) => v.basicNodeTemplates);
  const appId = useContextSelector(WorkflowContext, (state) => state.appId || '');
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const hasToolNode = useMemo(
    () => nodeList.some((node) => node.flowNodeType === FlowNodeTypeEnum.tools),
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
    runAsync
  } = useRequest2(
    async ({
      parentId = '',
      type = templateType,
      searchVal = ''
    }: {
      parentId?: ParentIdType;
      type?: TemplateTypeEnum;
      searchVal?: string;
    }) => {
      if (type === TemplateTypeEnum.teamPlugin) {
        return getTeamPlugTemplates({
          parentId,
          searchKey: searchVal
        }).then((res) => res.filter((app) => app.id !== appId));
      }
      if (type === TemplateTypeEnum.systemPlugin) {
        return getSystemPlugTemplates({
          searchKey: searchVal,
          parentId
        });
      }
    },
    {
      onSuccess(res, [{ parentId = '', type = templateType }]) {
        setParentId(parentId);
        setTemplateType(type);
      },
      refreshDeps: [templateType]
    }
  );

  const loadNodeTemplates = useCallback(
    async (params: { parentId?: ParentIdType; type?: TemplateTypeEnum; searchVal?: string }) => {
      await runAsync(params);
    },
    [runAsync]
  );

  const onUpdateParentId = useCallback(
    (parentId: ParentIdType) => {
      loadNodeTemplates({
        parentId
      });
    },
    [loadNodeTemplates]
  );

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
    loadNodeTemplates,
    onUpdateParentId
  };
};
