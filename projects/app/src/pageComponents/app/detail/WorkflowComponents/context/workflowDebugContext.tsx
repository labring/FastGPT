// 工作流调试功能层

import React, { useCallback, useState } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from './workflowInitContext';
import { AppContext } from '@/pageComponents/app/detail/context';
import { postWorkflowDebug } from '@/web/core/workflow/api';
import { formatTime2YMDHMW } from '@fastgpt/global/common/string/time';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { defaultRunningStatus } from '../constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { ChatItemType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { WorkflowDebugResponse } from '@fastgpt/service/core/workflow/dispatch/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { WorkflowActionsContext } from './workflowActionsContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

export type DebugDataType = {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  entryNodeIds: string[];
  skipNodeQueue?: WorkflowDebugResponse['skipNodeQueue'];

  variables: Record<string, any>;
  history?: ChatItemType[];
  query?: UserChatItemValueItemType[];
  workflowInteractiveResponse?: WorkflowInteractiveResponseType;
  usageId?: string;
};

// 创建 Context
type WorkflowDebugContextValue = {
  /** 调试数据 */
  workflowDebugData?: DebugDataType;

  /** 下一个节点调试 */
  onNextNodeDebug: (debugData: DebugDataType) => Promise<void>;

  /** 开始节点调试 */
  onStartNodeDebug: (params: {
    entryNodeId: string;
    runtimeNodes: RuntimeNodeItemType[];
    runtimeEdges: RuntimeEdgeItemType[];
    variables: Record<string, any>;
    query?: UserChatItemValueItemType[];
    history?: ChatItemType[];
  }) => Promise<void>;

  /** 停止节点调试 */
  onStopNodeDebug: () => void;

  /** 调试模式 */
  debugMode: boolean;

  /** 设置调试模式 */
  setDebugMode: (enabled: boolean) => void;
};
export const WorkflowDebugContext = createContext<WorkflowDebugContextValue>({
  onNextNodeDebug: function (debugData: DebugDataType): Promise<void> {
    throw new Error('Function not implemented.');
  },
  onStartNodeDebug: function (params: {
    entryNodeId: string;
    runtimeNodes: RuntimeNodeItemType[];
    runtimeEdges: RuntimeEdgeItemType[];
    variables: Record<string, any>;
    query?: UserChatItemValueItemType[];
    history?: ChatItemType[];
  }): Promise<void> {
    throw new Error('Function not implemented.');
  },
  onStopNodeDebug: function (): void {
    throw new Error('Function not implemented.');
  },
  debugMode: false,
  setDebugMode: function (enabled: boolean): void {
    throw new Error('Function not implemented.');
  }
});

export const WorkflowDebugProvider = ({ children }: { children: React.ReactNode }) => {
  // 获取依赖的 context
  const { setNodes } = useContextSelector(WorkflowBufferDataContext, (v) => v);
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const appId = appDetail._id;

  // 调试状态
  const [workflowDebugData, setWorkflowDebugData] = useState<DebugDataType>();
  const [debugMode, setDebugMode] = useState(false);

  // 单步调试 - 执行下一步节点
  const onNextNodeDebug = useCallback(
    async (debugData: DebugDataType) => {
      // 1. Cancel node selected status and debugResult.showStatus
      setNodes((state) =>
        state.map((node) => ({
          ...node,
          selected: false,
          data: {
            ...node.data,
            debugResult: node.data.debugResult
              ? {
                  ...node.data.debugResult,
                  showResult: false,
                  isExpired: true
                }
              : undefined
          }
        }))
      );

      // 2. Set isEntry field and get entryNodes, and set running status
      const runtimeNodes = debugData.runtimeNodes.map((item) => ({
        ...item,
        isEntry: debugData.entryNodeIds.some((id) => id === item.nodeId)
      }));
      const entryNodes = runtimeNodes.filter((item) => {
        if (item.isEntry) {
          onChangeNode({
            nodeId: item.nodeId,
            type: 'attr',
            key: 'debugResult',
            value: defaultRunningStatus
          });
          return true;
        }
      });

      try {
        // 3. Run one step
        const {
          memoryEdges,
          memoryNodes,
          entryNodeIds,
          skipNodeQueue,
          nodeResponses,
          newVariables,
          usageId
        } = await postWorkflowDebug({
          nodes: runtimeNodes,
          edges: debugData.runtimeEdges,
          skipNodeQueue: debugData.skipNodeQueue,
          variables: {
            appId,
            cTime: formatTime2YMDHMW(new Date()),
            ...debugData.variables
          },
          query: debugData.query, // 添加 query 参数
          history: debugData.history,
          appId,
          chatConfig: appDetail.chatConfig,
          usageId: debugData.usageId
        });

        // 4. Store debug result
        setWorkflowDebugData({
          runtimeNodes: memoryNodes,
          runtimeEdges: memoryEdges,
          entryNodeIds,
          skipNodeQueue,
          variables: newVariables,
          usageId
        });

        // 5. selected entry node and Update entry node debug result
        setNodes((state) =>
          state.map((node) => {
            const isEntryNode = entryNodes.some((item) => item.nodeId === node.data.nodeId);

            const result = nodeResponses[node.data.nodeId];
            if (!result) return node;
            return {
              ...node,
              selected: result.type === 'run' && isEntryNode,
              data: {
                ...node.data,
                debugResult: {
                  status: result.type === 'run' ? 'success' : 'skipped',
                  response: result.response,
                  showResult: true,
                  isExpired: false,
                  workflowInteractiveResponse: result.interactiveResponse
                }
              }
            };
          })
        );

        // Check for an empty response(Skip node)
        // if (!workflowInteractiveResponse && flowResponses.length === 0 && entryNodeIds.length > 0) {
        //   onNextNodeDebug(debugData);
        // }
      } catch (error) {
        entryNodes.forEach((node) => {
          onChangeNode({
            nodeId: node.nodeId,
            type: 'attr',
            key: 'debugResult',
            value: {
              status: 'failed',
              message: getErrText(error, 'Debug failed'),
              showResult: true
            }
          });
        });
        console.log(error);
      }
    },
    [appId, onChangeNode, setNodes, appDetail.chatConfig]
  );

  // 停止调试 - 清理调试状态
  const onStopNodeDebug = useCallback(() => {
    setWorkflowDebugData(undefined);
    setNodes((state) =>
      state.map((node) => ({
        ...node,
        selected: false,
        data: {
          ...node.data,
          debugResult: undefined
        }
      }))
    );
  }, [setNodes]);

  // 开始调试 - 初始化调试会话
  const onStartNodeDebug = useCallback(
    async ({
      entryNodeId,
      runtimeNodes,
      runtimeEdges,
      variables,
      query,
      history
    }: Parameters<WorkflowDebugContextValue['onStartNodeDebug']>[0]) => {
      const data: DebugDataType = {
        runtimeNodes,
        runtimeEdges,
        entryNodeIds: runtimeNodes
          .filter((node) => node.nodeId === entryNodeId)
          .map((node) => node.nodeId),
        skipNodeQueue: [],
        variables,
        query,
        history
      };
      onStopNodeDebug();
      setWorkflowDebugData(data);

      onNextNodeDebug(data);
    },
    [onNextNodeDebug, onStopNodeDebug]
  );

  const contextValue = useMemoEnhance(() => {
    console.log('WorkflowDebugContextValue 更新了');

    return {
      workflowDebugData,
      onNextNodeDebug,
      onStartNodeDebug,
      onStopNodeDebug,
      debugMode,
      setDebugMode
    };
  }, [workflowDebugData, onNextNodeDebug, onStartNodeDebug, onStopNodeDebug, debugMode]);

  return (
    <WorkflowDebugContext.Provider value={contextValue}>{children}</WorkflowDebugContext.Provider>
  );
};
