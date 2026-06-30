// 工作流工具函数层
import React, { type ReactNode, useCallback, useEffect, useMemo } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { useReactFlow } from 'reactflow';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  adaptCatchError,
  storeNode2FlowNode,
  storeEdge2RenderEdge
} from '@/web/core/workflow/utils';
import {
  checkWorkflowBeforeRunOrPublish,
  checkWorkflowNodeIssues
} from '@/web/core/workflow/workflowCheck';
import { uiWorkflow2StoreWorkflow } from '../utils';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { WorkflowBufferDataContext } from './workflowInitContext';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { AppContext } from '../../context';
import { WorkflowSnapshotContext } from './workflowSnapshotContext';
import { WorkflowActionsContext } from './workflowActionsContext';
import {
  canInputBeAgentGenerated,
  initToolInputTypeByDefaultMode,
  isAgentGeneratedToolInput
} from '@fastgpt/global/core/app/formEdit/utils';

// 创建 Context
type WorkflowUtilsContextValue = {
  initData: (
    e: {
      nodes: StoreNodeItemType[];
      edges: StoreEdgeItemType[];
      chatConfig?: AppChatConfigType;
    },
    isInit?: boolean
  ) => Promise<void>;
  flowData2StoreData: () =>
    | {
        nodes: StoreNodeItemType[];
        edges: StoreEdgeItemType[];
      }
    | undefined;
  flowData2StoreDataAndCheck: (hideTip?: boolean) =>
    | {
        nodes: StoreNodeItemType[];
        edges: StoreEdgeItemType[];
      }
    | undefined;
  splitToolInputs: (
    inputs: FlowNodeInputItemType[],
    nodeId: string
  ) => {
    isTool: boolean;
    toolInputs: FlowNodeInputItemType[];
    commonInputs: FlowNodeInputItemType[];
  };
  splitOutput: (outputs: FlowNodeOutputItemType[]) => {
    successOutputs: FlowNodeOutputItemType[];
    hiddenOutputs: FlowNodeOutputItemType[];
    errorOutputs: FlowNodeOutputItemType[];
  };
};
export const WorkflowUtilsContext = createContext<WorkflowUtilsContextValue>({
  initData: (...args: Parameters<WorkflowUtilsContextValue['initData']>) => {
    void args;
    throw new Error('Function not implemented.');
  },
  flowData2StoreData: () => {
    throw new Error('Function not implemented.');
  },
  flowData2StoreDataAndCheck: (
    ...args: Parameters<WorkflowUtilsContextValue['flowData2StoreDataAndCheck']>
  ) => {
    void args;
    throw new Error('Function not implemented.');
  },
  splitOutput: (...args: Parameters<WorkflowUtilsContextValue['splitOutput']>) => {
    void args;
    throw new Error('Function not implemented.');
  },
  splitToolInputs: (...args: Parameters<WorkflowUtilsContextValue['splitToolInputs']>) => {
    void args;
    throw new Error('Function not implemented.');
  }
});

export const WorkflowUtilsProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { fitView } = useReactFlow();
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const showSandbox = feConfigs?.show_agent_sandbox;
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus?.standard?.enableSandbox;

  const { appDetail, setAppDetail } = useContextSelector(AppContext, (v) => v);
  const { edges, setEdges, setNodes, getNodes, toolNodesMap } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );
  const { past, setPast } = useContextSelector(WorkflowSnapshotContext, (v) => v);
  const { onRemoveError, onUpdateNodeError, onSyncWorkflowCheckIssues } = useContextSelector(
    WorkflowActionsContext,
    (v) => v
  );

  // 优化为单次遍历,分类输出项
  const splitOutput = useCallback((outputs: FlowNodeOutputItemType[]) => {
    const successOutputs: FlowNodeOutputItemType[] = [];
    const hiddenOutputs: FlowNodeOutputItemType[] = [];
    const errorOutputs: FlowNodeOutputItemType[] = [];

    outputs.forEach((item) => {
      if (
        item.type === FlowNodeOutputTypeEnum.dynamic ||
        item.type === FlowNodeOutputTypeEnum.static ||
        item.type === FlowNodeOutputTypeEnum.source
      ) {
        successOutputs.push(item);
      } else if (item.type === FlowNodeOutputTypeEnum.hidden) {
        hiddenOutputs.push(item);
      } else if (item.type === FlowNodeOutputTypeEnum.error) {
        errorOutputs.push(item);
      }
    });

    return {
      successOutputs,
      hiddenOutputs,
      errorOutputs
    };
  }, []);
  /* If the module is connected by a tool, the tool input and the normal input are separated */
  const splitToolInputs = useCallback(
    (inputs: FlowNodeInputItemType[], nodeId: string) => {
      const isTool = toolNodesMap[nodeId] ?? false;

      const toolInputs: FlowNodeInputItemType[] = [];
      const commonInputs: FlowNodeInputItemType[] = [];
      inputs.forEach((item) => {
        const normalizedInput = isTool ? initToolInputTypeByDefaultMode(item) : item;
        const isAgentGeneratedInput =
          isAgentGeneratedToolInput(normalizedInput) && canInputBeAgentGenerated(normalizedInput);
        if (isTool && isAgentGeneratedInput && item.canEdit) {
          toolInputs.push(item);
        }
        commonInputs.push(normalizedInput);
      });

      return {
        isTool,
        toolInputs,
        commonInputs
      };
    },
    [toolNodesMap]
  );

  // 将 UI 流程数据转换为存储格式
  const flowData2StoreData = useCallback(() => {
    const nodes = getNodes();
    return uiWorkflow2StoreWorkflow({ nodes, edges, chatConfig: appDetail.chatConfig });
  }, [getNodes, edges, appDetail.chatConfig]);

  // 转换并验证工作流数据
  const flowData2StoreDataAndCheck = useCallback(
    (hideTip = false) => {
      const nodes = getNodes();

      // Sandbox unavailable check
      const sandboxUnavailableNode = nodes.find((node) => {
        if (
          node.data.flowNodeType === FlowNodeTypeEnum.agent ||
          node.data.flowNodeType === FlowNodeTypeEnum.toolCall
        ) {
          const useAgentSandbox = node.data.inputs.find(
            (input) => input.key === NodeInputKeyEnum.useAgentSandbox
          )?.value;
          return !!useAgentSandbox && (!showSandbox || !enableSandbox);
        }
        return false;
      });

      if (sandboxUnavailableNode) {
        if (!hideTip) {
          onUpdateNodeError(sandboxUnavailableNode.data.nodeId, true);
          fitView({
            nodes: [sandboxUnavailableNode],
            padding: 0.3
          });
          toast({
            status: 'warning',
            title: !showSandbox
              ? t('skill:sandbox_system_not_configured_toast')
              : t('app:sandbox_free_not_support')
          });
        }
        return;
      }

      const { issueMap, hasError, firstErrorNodeId } = checkWorkflowBeforeRunOrPublish({
        nodes,
        edges,
        t
      });

      if (!hasError) {
        onRemoveError();
        const storeWorkflow = uiWorkflow2StoreWorkflow({
          nodes,
          edges,
          chatConfig: appDetail.chatConfig
        });

        return storeWorkflow;
      }

      if (!hideTip) {
        onSyncWorkflowCheckIssues(issueMap);

        if (firstErrorNodeId) {
          onUpdateNodeError(firstErrorNodeId, true);
          const firstErrorNode = nodes.find((node) => node.data.nodeId === firstErrorNodeId);
          if (firstErrorNode) {
            fitView({
              nodes: [firstErrorNode],
              padding: 0.3
            });
          }
        }

        toast({
          status: 'warning',
          title: t('common:core.workflow.Check Failed')
        });
      }
    },
    [
      getNodes,
      edges,
      onRemoveError,
      onSyncWorkflowCheckIssues,
      fitView,
      t,
      onUpdateNodeError,
      showSandbox,
      enableSandbox,
      appDetail.chatConfig,
      toast
    ]
  );

  /** 编辑页定时全量扫描，主动发现新增/已修复的节点错误。 */
  useEffect(() => {
    const runScheduledCheck = () => {
      const nodes = getNodes();
      if (nodes.length === 0) return;

      const issueMap = checkWorkflowNodeIssues({ nodes, edges, t });
      onSyncWorkflowCheckIssues(issueMap);
    };

    const timer = window.setInterval(runScheduledCheck, 10_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [edges, getNodes, onSyncWorkflowCheckIssues, t]);

  // 4. initData - 初始化工作流数据
  const initData = useCallback(
    async (
      e: {
        nodes: StoreNodeItemType[];
        edges: StoreEdgeItemType[];
        chatConfig?: AppChatConfigType;
      },
      isInit?: boolean
    ) => {
      adaptCatchError(e.nodes, e.edges);

      const nodes = e.nodes?.map((item) => storeNode2FlowNode({ item, t })) || [];
      const edges = e.edges?.map((item) => storeEdge2RenderEdge({ edge: item })) || [];

      // 有历史记录，直接用历史记录覆盖
      if (isInit && past.length > 0) {
        const firstPast = past[0];
        setNodes(firstPast.nodes);
        setEdges(firstPast.edges);
        setAppDetail((state) => ({ ...state, chatConfig: firstPast.chatConfig }));
        return;
      }
      // 初始化一个历史记录
      if (isInit && past.length === 0) {
        setPast([
          {
            nodes: nodes,
            edges: edges,
            title: t('app:app.version_initial'),
            isSaved: true,
            chatConfig: e.chatConfig || appDetail.chatConfig
          }
        ]);
      }

      // Init memory data
      setNodes(nodes);
      setEdges(edges);
      if (e.chatConfig) {
        setAppDetail((state) => ({ ...state, chatConfig: e.chatConfig as AppChatConfigType }));
      }
    },
    [appDetail.chatConfig, past, setAppDetail, setEdges, setNodes, setPast, t]
  );

  const contextValue = useMemo(() => {
    console.log('WorkflowUtilsContextValue 更新了');
    return {
      initData,
      flowData2StoreData,
      flowData2StoreDataAndCheck,
      splitOutput,
      splitToolInputs
    };
  }, [initData, flowData2StoreData, flowData2StoreDataAndCheck, splitOutput, splitToolInputs]);

  return (
    <WorkflowUtilsContext.Provider value={contextValue}>{children}</WorkflowUtilsContext.Provider>
  );
};
