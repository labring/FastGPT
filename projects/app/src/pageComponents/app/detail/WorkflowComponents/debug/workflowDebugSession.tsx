// 工作流调试功能层

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { useWorkflowCanvasValue } from '../Flow/canvas/workflowCanvasContext';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useWorkflowRuntime } from '@/web/core/workflow/editor/session/workflowSession';
import { postWorkflowDebug } from '@/web/core/workflow/api';
import { formatTime2YMDHMW } from '@fastgpt/global/common/string/time';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { ChatItemMiniType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { WorkflowDebugResponse } from '@fastgpt/service/core/workflow/dispatch/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useWorkflowOverlayActions } from '@/web/core/workflow/editor/session/workflowSession';
import {
  failDebugStep,
  openDebugSession,
  resolveDebugStep,
  startDebugStep,
  stopDebugSession,
  type DebugSessionState,
  type DebugSessionTransition
} from '@/web/core/workflow/editor/debug/workflowDebugOverlay';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { WorkflowRuntimeContextProvider } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

// region publicApi Debug context and data transforms

export type DebugDataType = {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  entryNodeIds: string[];
  skipNodeQueue?: WorkflowDebugResponse['skipNodeQueue'];

  variables: Record<string, any>;
  history?: ChatItemMiniType[];
  query?: UserChatItemValueItemType[];
  workflowInteractiveResponse?: WorkflowInteractiveResponseType;
  usageId?: string;
  /** 调试会话内文件上传与调试运行共用的 chatId */
  chatId?: string;
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
    history?: ChatItemMiniType[];
    chatId?: string;
  }) => Promise<void>;

  /** 停止节点调试 */
  onStopNodeDebug: () => void;

  /** 打开调试弹窗：只清掉上一轮 session 写过的 overlay，不启动新会话 */
  onOpenNodeDebug: () => void;

  /** 当前调试会话的文件上传 chatId */
  debugChatId?: string;

  /** 设置调试会话的文件上传 chatId */
  setDebugChatId: (chatId: string) => void;
};

export const useWorkflowDebugValue = <T,>(selector: (value: WorkflowDebugContextValue) => T): T =>
  useContextSelector(WorkflowDebugContext, selector);

/** 生成调试子树的文件上传上下文，确保草稿上传与调试运行共享同一 chatId。 */
export const getWorkflowDebugRuntimeContext = ({
  appId,
  chatId
}: {
  appId: string;
  chatId?: string;
}) => ({
  sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: appId },
  chatId: chatId ?? '',
  outLinkAuthData: {},
  fileUploadMode: 'draft' as const
});

/** 初始化节点调试数据；显式 chatId 优先，否则沿用打开调试弹窗时生成的会话 ID。 */
export const createWorkflowDebugData = ({
  params,
  defaultChatId
}: {
  params: Parameters<WorkflowDebugContextValue['onStartNodeDebug']>[0];
  defaultChatId?: string;
}): DebugDataType => {
  const { entryNodeId, runtimeNodes, runtimeEdges, variables, query, history, chatId } = params;

  return {
    runtimeNodes,
    runtimeEdges,
    entryNodeIds: runtimeNodes
      .filter((node) => node.nodeId === entryNodeId)
      .map((node) => node.nodeId),
    skipNodeQueue: [],
    variables,
    query,
    history,
    chatId: chatId ?? defaultChatId
  };
};

/** 保存单步调试结果，并保留后续节点和交互续跑所需的 chatId。 */
export const createNextWorkflowDebugData = ({
  debugData,
  response
}: {
  debugData: DebugDataType;
  response: {
    memoryNodes: DebugDataType['runtimeNodes'];
    memoryEdges: DebugDataType['runtimeEdges'];
    entryNodeIds: DebugDataType['entryNodeIds'];
    skipNodeQueue?: DebugDataType['skipNodeQueue'];
    newVariables: DebugDataType['variables'];
    usageId?: DebugDataType['usageId'];
  };
}): DebugDataType => ({
  runtimeNodes: response.memoryNodes,
  runtimeEdges: response.memoryEdges,
  entryNodeIds: response.entryNodeIds,
  skipNodeQueue: response.skipNodeQueue,
  variables: response.newVariables,
  usageId: response.usageId,
  chatId: debugData.chatId
});

// endregion

// region internalState Debug provider implementation

const WorkflowDebugContext = createContext<WorkflowDebugContextValue>({
  onNextNodeDebug: function (_debugData: DebugDataType): Promise<void> {
    throw new Error('Function not implemented.');
  },
  onStartNodeDebug: function (_params: {
    entryNodeId: string;
    runtimeNodes: RuntimeNodeItemType[];
    runtimeEdges: RuntimeEdgeItemType[];
    variables: Record<string, any>;
    query?: UserChatItemValueItemType[];
    history?: ChatItemMiniType[];
    chatId?: string;
  }): Promise<void> {
    throw new Error('Function not implemented.');
  },
  onStopNodeDebug: function (): void {
    throw new Error('Function not implemented.');
  },
  onOpenNodeDebug: function (): void {
    throw new Error('Function not implemented.');
  },
  debugChatId: '',
  setDebugChatId: function (): void {
    throw new Error('Function not implemented.');
  }
});

export const WorkflowDebugProvider = ({ children }: { children: React.ReactNode }) => {
  // 获取依赖的 context
  const selectNodes = useWorkflowCanvasValue((v) => v.selectNodes);
  const runtime = useWorkflowRuntime();
  const patchViewData = useWorkflowOverlayActions();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const appId = appDetail._id;

  // 调试状态
  const [workflowDebugData, setWorkflowDebugData] = useState<DebugDataType>();
  // 调试会话内文件上传的 chatId，打开调试弹窗时生成，调试运行沿用同一值
  const [debugChatId, setDebugChatId] = useState<string>();
  /**
   * session 足迹：写过 debugResult overlay 的节点与上一步选中的节点。
   * 用 ref 而不是 state——异步单步里要同步读到最新值，且足迹变化本身不需要触发重渲染。
   */
  const sessionRef = useRef<DebugSessionState>({ writtenNodeIds: [], selectedNodeIds: [] });
  const debugGenerationRef = useRef(0);

  /**
   * 应用一次 transition：overlay 合并成一次 patchViewData（每次调用都会 bump 投影），
   * 选中只提交 node id intent，由 Canvas 按当前本地节点计算 ReactFlow change。
   */
  const applyTransition = useCallback(
    (transition: DebugSessionTransition) => {
      const previousSelectedNodeIds = sessionRef.current.selectedNodeIds;
      const selectionChanged =
        previousSelectedNodeIds.length !== transition.selectedNodeIds.length ||
        previousSelectedNodeIds.some(
          (nodeId, index) => nodeId !== transition.selectedNodeIds[index]
        );
      sessionRef.current = {
        writtenNodeIds: transition.nextWrittenNodeIds,
        selectedNodeIds: transition.selectedNodeIds
      };
      // 先写选中再 bump 投影，重投影时读到的本地数组已经是最新选中态。
      if (selectionChanged) selectNodes(transition.selectedNodeIds);
      if (transition.overlayPatches.length > 0) patchViewData(transition.overlayPatches);
    },
    [patchViewData, selectNodes]
  );

  // 单步调试 - 执行下一步节点
  const onNextNodeDebug = useCallback(
    async (debugData: DebugDataType) => {
      const generation = ++debugGenerationRef.current;
      const requestRuntime = runtime;

      // 1. Set isEntry field and collect this step's entry nodes
      const entryNodeIdSet = new Set(debugData.entryNodeIds);
      const runtimeNodes = debugData.runtimeNodes.map((item) => ({
        ...item,
        isEntry: entryNodeIdSet.has(item.nodeId)
      }));
      const entryNodeIds = runtimeNodes.filter((item) => item.isEntry).map((item) => item.nodeId);

      // 2. 清掉上一步结果、本步 entry 标运行中、取消上一步选中：只写 session 足迹内的节点
      applyTransition(startDebugStep({ ...sessionRef.current, entryNodeIds }));

      try {
        // 3. Run one step
        const {
          memoryEdges,
          memoryNodes,
          // 服务端返回的下一步 entry，与本步 entryNodeIds 区分
          entryNodeIds: nextEntryNodeIds,
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
          usageId: debugData.usageId,
          chatId: debugData.chatId
        });

        if (generation !== debugGenerationRef.current || requestRuntime?.isDisposed()) return;

        // 4. Store debug result
        // memoryNodes 和 memoryEdges 包含完整响应，同时保留续跑所需的 chatId。
        setWorkflowDebugData(
          createNextWorkflowDebugData({
            debugData,
            response: {
              memoryNodes,
              memoryEdges,
              entryNodeIds: nextEntryNodeIds,
              skipNodeQueue,
              newVariables,
              usageId
            }
          })
        );

        // 5. 写入本步结果并选中真正跑过的 entry 节点（交互续跑同样走这里）
        applyTransition(resolveDebugStep({ ...sessionRef.current, entryNodeIds, nodeResponses }));
      } catch (error) {
        if (generation !== debugGenerationRef.current || requestRuntime?.isDisposed()) return;

        // 失败态只写本次 entry 节点，失败信息在 session 内展示，不影响其它节点
        applyTransition(
          failDebugStep({
            ...sessionRef.current,
            entryNodeIds,
            message: getErrText(error, 'Debug failed')
          })
        );
      }
    },
    [appId, applyTransition, appDetail.chatConfig, runtime]
  );

  // 停止调试 - 清理调试状态
  const onStopNodeDebug = useCallback(() => {
    debugGenerationRef.current += 1;
    setWorkflowDebugData(undefined);
    applyTransition(stopDebugSession(sessionRef.current));
  }, [applyTransition]);

  // 打开调试弹窗 - 清掉上一轮 session 留下的 overlay，不重置会话数据
  const onOpenNodeDebug = useCallback(() => {
    applyTransition(openDebugSession(sessionRef.current));
  }, [applyTransition]);

  useEffect(() => {
    const unsubscribe = runtime?.subscribe((change) => {
      if (change.kind !== 'replace') return;

      debugGenerationRef.current += 1;
      setWorkflowDebugData(undefined);
      applyTransition(stopDebugSession(sessionRef.current));
    });

    return () => {
      unsubscribe?.();
      debugGenerationRef.current += 1;
    };
  }, [applyTransition, runtime]);

  const previousAppIdRef = useRef(appId);
  useEffect(() => {
    if (previousAppIdRef.current === appId) return;
    previousAppIdRef.current = appId;
    debugGenerationRef.current += 1;
    setWorkflowDebugData(undefined);
    setDebugChatId(undefined);
    applyTransition(stopDebugSession(sessionRef.current));
  }, [appId, applyTransition]);

  // 开始调试 - 初始化调试会话
  const onStartNodeDebug = useCallback(
    async ({
      entryNodeId,
      runtimeNodes,
      runtimeEdges,
      variables,
      query,
      history,
      chatId
    }: Parameters<WorkflowDebugContextValue['onStartNodeDebug']>[0]) => {
      const data = createWorkflowDebugData({
        params: { entryNodeId, runtimeNodes, runtimeEdges, variables, query, history, chatId },
        defaultChatId: debugChatId
      });
      onStopNodeDebug();
      setWorkflowDebugData(data);

      onNextNodeDebug(data);
    },
    [debugChatId, onNextNodeDebug, onStopNodeDebug]
  );

  const contextValue = useMemoEnhance(() => {
    return {
      workflowDebugData,
      onNextNodeDebug,
      onStartNodeDebug,
      onStopNodeDebug,
      onOpenNodeDebug,
      debugChatId,
      setDebugChatId
    };
  }, [
    workflowDebugData,
    onNextNodeDebug,
    onStartNodeDebug,
    onStopNodeDebug,
    onOpenNodeDebug,
    debugChatId,
    setDebugChatId
  ]);

  return (
    <WorkflowRuntimeContextProvider
      {...getWorkflowDebugRuntimeContext({ appId, chatId: debugChatId })}
    >
      <WorkflowDebugContext.Provider value={contextValue}>{children}</WorkflowDebugContext.Provider>
    </WorkflowRuntimeContextProvider>
  );
};

// endregion
