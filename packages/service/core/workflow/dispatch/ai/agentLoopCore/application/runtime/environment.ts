import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { AgentLoopEvent } from '../../../../../../ai/llm/agentLoop/interface';
import type { WorkflowResponseType } from '../../../../type';
import { createAgentLoopCoreEventDispatcher } from '../../adapter/eventStream/eventDispatcher';
import { createAgentLoopCoreEventStream } from '../../adapter/eventStream/createEventStream';
import { createAgentLoopCoreNodeResponseEventCollector } from '../../adapter/nodeResponse/eventCollector';
import {
  createAgentLoopCoreToolRunResponseCollector,
  type AgentLoopCoreToolRunFlowResponse
} from '../../adapter/nodeResponse/toolRunCollector';

type AgentLoopCoreRuntimeEnvironmentToolInfo = {
  name: string;
  avatar?: string;
};

export type CreateAgentLoopCoreRuntimeEnvironmentParams = {
  node: {
    nodeId: string;
    flowNodeType: FlowNodeTypeEnum;
  };
  workflowStreamResponse?: WorkflowResponseType;
  streamAnswer?: boolean;
  streamReasoning?: boolean;
  sliceToolResponse?: boolean;
  getToolInfo: (name: string) => AgentLoopCoreRuntimeEnvironmentToolInfo | undefined;
  shouldStreamTool?: (name: string) => boolean;
  /**
   * Workflow Agent 使用 nodeResponses 记录平铺运行详情；ToolCall 不传该数组，
   * 改由 toolRunResponses 记录子流程详情。
   */
  nodeResponses?: ChatHistoryItemResType[];
  appendNodeResponse?: (nodeResponse: ChatHistoryItemResType) => void;
  collectToolRunResponses?: boolean;
};

const noop = () => {};

/**
 * 创建 workflow dispatch 侧共享运行环境。
 *
 * 这一层把 agent-loop 事件统一分成三类副作用：
 * 1. SSE：answer/reasoning/tool/plan 实时推送。
 * 2. Workflow Agent nodeResponses：主模型、业务工具、plan/ask、压缩节点平铺记录。
 * 3. ToolCall toolRunResponses：工具子流程详情和压缩 child 记录。
 *
 * 调用方只需要继续提供工具目录、system tool executor 和 LLM 参数，不再各自手写事件桥。
 */
export const createAgentLoopCoreRuntimeEnvironment = ({
  node,
  workflowStreamResponse,
  streamAnswer = true,
  streamReasoning = true,
  sliceToolResponse = false,
  getToolInfo,
  shouldStreamTool = () => true,
  nodeResponses,
  appendNodeResponse,
  collectToolRunResponses = false
}: CreateAgentLoopCoreRuntimeEnvironmentParams) => {
  const eventStream = createAgentLoopCoreEventStream({
    workflowStreamResponse,
    streamAnswer,
    streamReasoning,
    sliceToolResponse,
    getToolInfo
  });
  const toolRunCollector = collectToolRunResponses
    ? createAgentLoopCoreToolRunResponseCollector({
        moduleType: node.flowNodeType,
        getToolInfo
      })
    : undefined;
  const nodeResponseCollector =
    nodeResponses || appendNodeResponse
      ? createAgentLoopCoreNodeResponseEventCollector({
          node,
          nodeResponses,
          appendNodeResponse,
          getToolInfo: (name) => getToolInfo(name) || { name }
        })
      : undefined;
  const eventDispatcher = createAgentLoopCoreEventDispatcher({
    eventStream,
    toolRunCollector,
    shouldStreamTool
  });

  const emitEvent = (event: AgentLoopEvent) => {
    // 先收集后端持久化数据，再推 SSE，避免前端映射变化影响运行详情完整性。
    nodeResponseCollector?.emitEvent(event);
    eventDispatcher.emitEvent(event);
  };

  return {
    eventStream,
    emitEvent,
    toolRunResponses: toolRunCollector?.toolRunResponses ?? [],
    cacheToolFlowResponse:
      toolRunCollector?.cacheToolFlowResponse ??
      (noop as (args: { callId: string; flowResponse?: AgentLoopCoreToolRunFlowResponse }) => void),
    appendToolNodeResponse: toolRunCollector?.appendToolNodeResponse ?? noop,
    appendContextCompressNodeResponse: toolRunCollector?.appendContextCompressNodeResponse ?? noop,
    cacheNodeToolResult:
      nodeResponseCollector?.cacheToolResult ??
      (noop as (args: {
        callId: string;
        usages: ChatNodeUsageType[];
        nodeResponse?: ChatHistoryItemResType;
      }) => void)
  };
};

export type AgentLoopCoreRuntimeEnvironment = ReturnType<
  typeof createAgentLoopCoreRuntimeEnvironment
>;
