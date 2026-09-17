import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ToolRunResponseItemType
} from '@fastgpt/global/core/chat/type';
import type { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type {
  InteractiveNodeResponseType,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { type RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { WorkflowRuntimeSummaryFields } from '../types/summary';

/**
 * workflow 内部运行期使用的 nodeResponse 摘要。
 *
 * 启用请求级 `WorkflowNodeResponseSink` 后，完整 nodeResponse 会在节点完成时立即发布并
 * 写入 `chat_item_responses`，且不再通过 `runWorkflow` 返回。父 workflow 仍需要少量
 * child 节点信号来继续调度、聚合虚拟节点和处理重试，因此这些字段会在每次节点写库后
 * 由当前 workflow 的 sink scope 统一提取并写入共享 `workflowRuntimeSummary`。当前
 * workflow 的普通响应 token 在这里提取；child workflow token 由 wrapper 从 child summary
 * 显式 push 到 parent nodeSummary，WorkflowQueue 只合并 callback collector 增量。
 *
 * 这个结构只服务于“本次运行过程”，不作为最终详情返回给客户端；详情展示仍从 DB rows
 * 重新拼 `childrenResponses`。`getWorkflowRuntimeSummary` 只读取 child 返回的统一 summary。
 */
export type WorkflowRuntimeSummaryType = WorkflowRuntimeSummaryFields;

export type WorkflowDebugResponse = {
  memoryEdges: RuntimeEdgeItemType[];
  memoryNodes: RuntimeNodeItemType[];
  entryNodeIds: string[]; // Next step entry nodes
  nodeResponses: Record<
    string,
    {
      nodeId: string;
      type: 'skip' | 'run';
      response?: ChatHistoryItemResType;
      interactiveResponse?: InteractiveNodeResponseType;
    }
  >;
  skipNodeQueue?: { id: string; skippedNodeIdList: string[] }[]; // Cache
};
export type DispatchFlowResponse = {
  flowUsages: ChatNodeUsageType[];
  debugResponse: WorkflowDebugResponse;
  workflowInteractiveResponse?: WorkflowInteractiveResponseType;
  [DispatchNodeResponseKeyEnum.toolResponse]: ToolRunResponseItemType;
  [DispatchNodeResponseKeyEnum.assistantResponses]: AIChatItemValueItemType[];
  [DispatchNodeResponseKeyEnum.runTimes]: number;
  [DispatchNodeResponseKeyEnum.memories]?: Record<string, any>;
  [DispatchNodeResponseKeyEnum.customFeedbacks]?: string[];
  [DispatchNodeResponseKeyEnum.newVariables]: Record<string, any>;
  /** 当前 workflow 层的统一运行摘要。 */
  workflowRuntimeSummary: WorkflowRuntimeSummaryType;
  /** 请求内保留的 flat nodeResponses；只有业务入口显式开启 retainInMemory 时才返回。 */
  flatNodeResponses?: ChatHistoryItemResType[];
  durationSeconds: number;
};
