import React, { type ReactNode, useCallback, useEffect, useMemo } from 'react';
// 工作流工具函数层
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getWorkflowModelDetails } from '@/web/core/workflow/modelData';
import { storeEdge2RenderEdge, storeNodes2FlowNodes } from '@/web/core/workflow/utils';
import { createContext, useContextSelector } from 'use-context-selector';
import { useReactFlow, type Node, type Edge } from '@xyflow/react';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  checkWorkflowBeforeRunOrPublish,
  checkWorkflowNodeIssues
} from '@/web/core/workflow/workflowCheck';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  canInputBeAgentGenerated,
  normalizeFlowNodeInputType
} from '@fastgpt/global/core/app/formEdit/utils';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import type { FlowNodeItemType, StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { AppContext } from '../../context';
import { uiWorkflow2StoreWorkflow } from '../utils';
import { WorkflowActionsContext } from './workflowActionsContext';
import { WorkflowBufferDataContext } from './workflowInitContext';
import { useWorkflowStore } from '../store/useWorkflowStore';

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
  flowData2StoreDataAndCheck: (hideTip?: boolean) => Promise<
    | {
        nodes: StoreNodeItemType[];
        edges: StoreEdgeItemType[];
      }
    | undefined
  >;
};

/** 将工具输入和普通节点输入分开，避免 Agent 生成参数在节点内重复渲染。 */
export const splitToolInputsByMode = (inputs: FlowNodeInputItemType[], isTool: boolean) => {
  const toolInputs: FlowNodeInputItemType[] = [];
  const commonInputs: FlowNodeInputItemType[] = [];

  inputs.forEach((item) => {
    const normalizedInput = normalizeFlowNodeInputType(item, { isTool });
    // canEdit 仅表示该字段可在节点内编辑；代码变量不应自动成为工具参数。
    const isToolParamInput =
      item.canEdit === true &&
      item.defaultToAgentGenerated === true &&
      canInputBeAgentGenerated(item);

    if (isTool && isToolParamInput) {
      toolInputs.push(item);
      return;
    }

    commonInputs.push(normalizedInput);
  });

  return {
    toolInputs,
    commonInputs
  };
};

/** 优化为单次遍历,分类输出项 */
export const splitOutput = (outputs: FlowNodeOutputItemType[]) => {
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
};

/** 针对特定节点拆分工具输入与普通输入，仅订阅当前节点是否为工具节点，阻断全画布重渲染 */
export const useNodeToolInputs = (inputs: FlowNodeInputItemType[], nodeId: string) => {
  const isTool = useContextSelector(WorkflowBufferDataContext, (v) => !!v.toolNodesMap[nodeId]);
  return useMemo(() => ({ isTool, ...splitToolInputsByMode(inputs, isTool) }), [inputs, isTool]);
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
  const edges = useWorkflowStore((s) => s.edges);
  const setEdges = useWorkflowStore((s) => s.setEdges);
  const setNodes = useWorkflowStore((s) => s.setNodes);
  const getNodes = useWorkflowStore((s) => s.getNodes);
  const setPast = useWorkflowStore((s) => s.setPast);
  const setFuture = useWorkflowStore((s) => s.setFuture);
  const { onRemoveError, onUpdateNodeError, onSyncWorkflowCheckIssues } = useContextSelector(
    WorkflowActionsContext,
    (v) => v
  );

  // 将 UI 流程数据转换为存储格式
  const flowData2StoreData = useCallback(() => {
    const nodes = getNodes();
    return uiWorkflow2StoreWorkflow({ nodes, edges, chatConfig: appDetail.chatConfig });
  }, [getNodes, edges, appDetail.chatConfig]);

  // 转换并验证工作流数据
  const flowData2StoreDataAndCheck = useCallback(
    async (hideTip = false) => {
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
            nodes: [{ id: sandboxUnavailableNode.data.nodeId }],
            includeHiddenNodes: true,
            padding: 0.3,
            minZoom: 0.7,
            maxZoom: 1
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

      const models = await getWorkflowModelDetails({
        nodes,
        chatConfig: appDetail.chatConfig,
        appId: appDetail._id
      }).catch(() => undefined);
      if (!models) {
        if (!hideTip) toast({ status: 'error', title: t('common:model_catalog_load_failed') });
        return;
      }
      const { issueMap, hasError, firstErrorNodeId, chatConfigIssues } =
        checkWorkflowBeforeRunOrPublish({
          nodes,
          edges,
          models,
          chatConfig: appDetail.chatConfig,
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
          fitView({
            nodes: [{ id: firstErrorNodeId }],
            includeHiddenNodes: true,
            padding: 0.3,
            minZoom: 0.7,
            maxZoom: 1
          });
        }

        toast({
          status: 'warning',
          title: t('common:core.workflow.Check Failed'),
          description: [...Object.values(issueMap).flat(), ...chatConfigIssues]
            .filter((issue) => issue.level === 'error')
            .map((issue) => issue.message)
            .filter(Boolean)
            .join('\n')
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
      appDetail._id,
      appDetail.chatConfig,
      toast
    ]
  );

  /** 编辑页定时全量扫描，主动发现新增/已修复的节点错误。 */
  useEffect(() => {
    let active = true;
    const runScheduledCheck = async () => {
      const nodes = getNodes();
      if (nodes.length === 0) return;

      const models = await getWorkflowModelDetails({ nodes, appId: appDetail._id }).catch(
        () => undefined
      );
      // 目录失败保留原校验结果；等待期间用户编辑或离开时不回写旧快照。
      if (
        !active ||
        !models ||
        nodes.some(
          (node) =>
            getNodes().find((current) => current.id === node.id)?.data.inputs !== node.data.inputs
        )
      )
        return;
      const issueMap = checkWorkflowNodeIssues({ nodes, edges, models, t });
      onSyncWorkflowCheckIssues(issueMap);
    };

    // 延迟首次全量扫描，避免挂载瞬间与首屏渲染争抢主线程
    const initTimer = window.setTimeout(runScheduledCheck, 2000);
    const timer = window.setInterval(runScheduledCheck, 10_000);

    return () => {
      active = false;
      window.clearTimeout(initTimer);
      window.clearInterval(timer);
    };
  }, [appDetail._id, edges, getNodes, onSyncWorkflowCheckIssues, t]);

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
      const workflow = {
        nodes: e.nodes,
        edges: e.edges,
        chatConfig: e.chatConfig ?? appDetail.chatConfig
      };
      const storeNodes = workflow.nodes;

      const toolNodeIds = new Set(
        workflow.edges
          .filter(
            (edge) =>
              edge.targetHandle === NodeOutputKeyEnum.selectedTools ||
              edge.sourceHandle === NodeOutputKeyEnum.selectedTools
          )
          .map((edge) => edge.source)
      );
      const nodes = storeNodes
        ? storeNodes2FlowNodes({
            nodes: storeNodes,
            t,
            toolNodeIds
          })
        : [];
      const edges = workflow.edges.map((item) => storeEdge2RenderEdge({ edge: item }));

      const { issueMap, hasError, firstErrorNodeId } = checkWorkflowBeforeRunOrPublish({
        nodes,
        edges,
        t
      });

      const initialNodes = nodes.map((node) => {
        const nodeId = node.data.nodeId;
        const issues = issueMap[nodeId];
        const isError = hasError && firstErrorNodeId === nodeId;
        return {
          ...node,
          selected: isError ? true : node.selected,
          data: {
            ...node.data,
            workflowCheckIssues: issues?.length ? issues : undefined,
            isError
          }
        };
      });

      // 进入编辑器后延迟校验并定位到第一个错误节点；ReactFlow 渲染后再 fitView 才有效。
      const scheduleEntryCheck = (checkNodes: Node<FlowNodeItemType>[], checkEdges: Edge[]) => {
        if (!isInit) return;
        window.setTimeout(() => {
          const { issueMap, hasError, firstErrorNodeId } = checkWorkflowBeforeRunOrPublish({
            nodes: checkNodes,
            edges: checkEdges,
            t
          });
          onSyncWorkflowCheckIssues(issueMap);
          if (hasError && firstErrorNodeId) {
            onUpdateNodeError(firstErrorNodeId, true);
            fitView({
              nodes: [{ id: firstErrorNodeId }],
              includeHiddenNodes: true,
              padding: 0.3,
              minZoom: 0.7,
              maxZoom: 1
            });
          }
        }, 300);
      };

      // 初始化一个历史记录
      if (isInit) {
        setPast([
          {
            nodes: initialNodes,
            edges: edges,
            title: t('app:app.version_initial'),
            isSaved: true,
            chatConfig: workflow.chatConfig
          }
        ]);
        setFuture([]);
      }

      // Init memory data
      setNodes(initialNodes);
      setEdges(edges);
      setAppDetail((state) => ({ ...state, chatConfig: workflow.chatConfig }));
      onSyncWorkflowCheckIssues(issueMap);
      if (hasError && firstErrorNodeId) {
        onUpdateNodeError(firstErrorNodeId, true);
      }
      scheduleEntryCheck(initialNodes, edges);
    },
    [
      appDetail.chatConfig,
      setAppDetail,
      setEdges,
      setNodes,
      setPast,
      setFuture,
      t,
      fitView,
      onSyncWorkflowCheckIssues,
      onUpdateNodeError
    ]
  );

  const contextValue = useMemo(() => {
    return {
      initData,
      flowData2StoreData,
      flowData2StoreDataAndCheck
    };
  }, [initData, flowData2StoreData, flowData2StoreDataAndCheck]);

  return (
    <WorkflowUtilsContext.Provider value={contextValue}>{children}</WorkflowUtilsContext.Provider>
  );
};
