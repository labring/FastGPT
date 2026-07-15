import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type {
  AgentLoopInteractiveToolExecuteParams,
  AgentLoopToolExecutionResult
} from '../../../../../ai/llm/agentLoop/interface';
import type { AgentLoopCoreSystemToolInfo } from './toolInfo';
import type { SandboxFileRef } from '@fastgpt/global/core/ai/sandbox/type';

export type AgentLoopCoreUserToolInfo<TRaw = unknown> = {
  type: 'user';
  name: string;
  avatar?: string;
  rawData: TRaw;
};

export type AgentLoopCoreToolInfo<TRaw = unknown> =
  | AgentLoopCoreUserToolInfo<TRaw>
  | AgentLoopCoreSystemToolInfo;

export type AgentLoopCoreToolExecuteParams = {
  call: ChatCompletionMessageToolCall;
  messages: ChatCompletionMessageParam[];
};

export type AgentLoopCoreToolRunResult<TChildrenResponse = unknown> = {
  response: string;
  assistantMessages?: ChatCompletionMessageParam[];
  usages?: ChatNodeUsageType[];
  interactive?: TChildrenResponse;
  stop?: boolean;
  errorMessage?: string;
  fileRefs?: SandboxFileRef[];
  nodeResponse?: ChatHistoryItemResType;
};

export type AgentLoopCoreToolProvider<TRawTool = unknown, TChildrenResponse = unknown> = {
  buildRuntimeTools: () => ChatCompletionTool[];
  getToolInfo: (name: string) => AgentLoopCoreToolInfo<TRawTool> | undefined;
  executeTool: (
    params: AgentLoopCoreToolExecuteParams
  ) => Promise<AgentLoopCoreToolRunResult<TChildrenResponse>>;
  executeInteractiveTool?: (
    params: AgentLoopInteractiveToolExecuteParams<TChildrenResponse>
  ) => Promise<AgentLoopCoreToolRunResult<TChildrenResponse>>;
};

/**
 * 将 workflow 侧工具执行结果补齐为 agent-loop runtime 需要的严格结构。
 *
 * 两个节点的工具 provider 可以返回更贴近 workflow 的可选字段；进入 agent-loop
 * 前统一归一化，避免每个外壳重复填空数组和默认 stop 值。
 */
export const normalizeAgentLoopCoreToolRunResult = <TChildrenResponse = unknown>({
  response,
  assistantMessages = [],
  usages = [],
  interactive,
  stop = false,
  errorMessage,
  fileRefs,
  nodeResponse
}: AgentLoopCoreToolRunResult<TChildrenResponse>): AgentLoopToolExecutionResult<TChildrenResponse> => {
  return {
    response,
    assistantMessages,
    usages,
    interactive,
    stop,
    errorMessage,
    fileRefs,
    metadata: nodeResponse
  };
};
