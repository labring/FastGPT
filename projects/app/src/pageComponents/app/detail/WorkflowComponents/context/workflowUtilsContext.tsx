// 工作流工具函数层
import React, { type ReactNode, useCallback, useMemo } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { useReactFlow } from 'reactflow';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  checkWorkflowNodeAndConnection,
  adaptCatchError,
  storeNode2FlowNode,
  storeEdge2RenderEdge
} from '@/web/core/workflow/utils';
import { uiWorkflow2StoreWorkflow } from '../utils';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
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
  initData: function (
    e: {
      nodes: StoreNodeItemType[];
      edges: StoreEdgeItemType[];
      chatConfig?: AppChatConfigType;
    },
    isInit?: boolean
  ): Promise<void> {
    throw new Error('Function not implemented.');
  },
  flowData2StoreData: function ():
    | {
        nodes: StoreNodeItemType[];
        edges: StoreEdgeItemType[];
      }
    | undefined {
    throw new Error('Function not implemented.');
  },
  flowData2StoreDataAndCheck: function (hideTip?: boolean):
    | {
        nodes: StoreNodeItemType[];
        edges: StoreEdgeItemType[];
      }
    | undefined {
    throw new Error('Function not implemented.');
  },
  splitOutput: function (outputs: FlowNodeOutputItemType[]): {
    successOutputs: FlowNodeOutputItemType[];
    hiddenOutputs: FlowNodeOutputItemType[];
    errorOutputs: FlowNodeOutputItemType[];
  } {
    throw new Error('Function not implemented.');
  },
  splitToolInputs: function (
    inputs: FlowNodeInputItemType[],
    nodeId: string
  ): {
    isTool: boolean;
    toolInputs: FlowNodeInputItemType[];
    commonInputs: FlowNodeInputItemType[];
  } {
    throw new Error('Function not implemented.');
  }
});

export const WorkflowUtilsProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { fitView } = useReactFlow();

  const { appDetail, setAppDetail } = useContextSelector(AppContext, (v) => v);
  const { edges, setEdges, setNodes, getNodes, toolNodesMap } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );
  const { past, setPast } = useContextSelector(WorkflowSnapshotContext, (v) => v);
  const { onRemoveError, onUpdateNodeError } = useContextSelector(WorkflowActionsContext, (v) => v);

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
        if (isTool && item.toolDescription) {
          toolInputs.push(item);
        }
        if (!isTool || !item.toolDescription) {
          commonInputs.push(item);
        }
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
    return uiWorkflow2StoreWorkflow({ nodes, edges });
  }, [getNodes, edges]);

  // 转换并验证工作流数据
  const flowData2StoreDataAndCheck = useCallback(
    (hideTip = false) => {
      const nodes = getNodes();
      const checkResults = checkWorkflowNodeAndConnection({ nodes, edges });

      if (!checkResults) {
        onRemoveError();
        const storeWorkflow = uiWorkflow2StoreWorkflow({ nodes, edges });

        return storeWorkflow;
      } else if (!hideTip) {
        checkResults.forEach((nodeId) => onUpdateNodeError(nodeId, true));

        // View move to the node that failed
        fitView({
          nodes: nodes.filter((node) => checkResults.includes(node.data.nodeId))
        });

        toast({
          status: 'warning',
          title: t('common:core.workflow.Check Failed')
        });
      }
    },
    [getNodes, edges, onRemoveError, fitView, toast, t, onUpdateNodeError]
  );

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
            title: t(`app:app.version_initial`),
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
