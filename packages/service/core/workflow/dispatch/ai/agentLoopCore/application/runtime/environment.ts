import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { AgentLoopEvent } from '../../../../../../ai/llm/agentLoop/interface';
import type { WorkflowResponseType } from '@fastgpt/global/core/workflow/runtime/sse';
import { createAgentLoopCoreEventDispatcher } from '../../adapter/eventStream/eventDispatcher';
import { createAgentLoopCoreEventStream } from '../../adapter/eventStream/createEventStream';
import { createAgentLoopCoreNodeResponseEventCollector } from '../../adapter/nodeResponse/eventCollector';
import type { AgentLoopCoreToolDisplayInfo } from '../../domain/toolInfo';

export type CreateAgentLoopCoreRuntimeEnvironmentParams = {
  node: {
    nodeId: string;
    flowNodeType: FlowNodeTypeEnum;
    catchError?: boolean;
  };
  workflowStreamResponse?: WorkflowResponseType;
  streamAnswer?: boolean;
  streamReasoning?: boolean;
  getToolInfo: (name: string) => AgentLoopCoreToolDisplayInfo | undefined;
  shouldStreamTool?: (name: string) => boolean;
  /** Agent/PiAgent 当前层 response 的平铺收集目标。 */
  nodeResponses?: ChatHistoryItemResType[];
  appendNodeResponse?: (nodeResponse: ChatHistoryItemResType) => void;
  /** ToolCall 只收集工具、压缩和上下文 response，主模型 response 由外层节点承载。 */
  collectAgentCallNodeResponse?: boolean;
};

const noop = () => {};

/**
 * 创建 workflow dispatch 侧共享运行环境。
 *
 * 这一层把 agent-loop 事件统一分成两类副作用：
 * 1. SSE：answer/reasoning/tool/plan 实时推送。
 * 2. 当前层 nodeResponses：主模型、业务工具、plan/ask、压缩节点平铺记录。
 * ToolCall 子 workflow 的详情由响应 Context 发布，运行次数由其工具 provider 统计。
 *
 * 调用方只需要继续提供工具目录、system tool executor 和 LLM 参数，不再各自手写事件桥。
 */
export const createAgentLoopCoreRuntimeEnvironment = ({
  node,
  workflowStreamResponse,
  streamAnswer = true,
  streamReasoning = true,
  getToolInfo,
  shouldStreamTool = () => true,
  nodeResponses,
  appendNodeResponse,
  collectAgentCallNodeResponse = true
}: CreateAgentLoopCoreRuntimeEnvironmentParams) => {
  const eventStream = createAgentLoopCoreEventStream({
    workflowStreamResponse,
    streamAnswer,
    streamReasoning,
    getToolInfo
  });
  const nodeResponseCollector =
    nodeResponses || appendNodeResponse
      ? createAgentLoopCoreNodeResponseEventCollector({
          node,
          nodeResponses,
          appendNodeResponse,
          collectAgentCallNodeResponse,
          getToolInfo: (name) => getToolInfo(name) || { name }
        })
      : undefined;
  const eventDispatcher = createAgentLoopCoreEventDispatcher({
    eventStream,
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
