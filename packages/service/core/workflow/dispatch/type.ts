import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ToolRunResponseItemType
} from '@fastgpt/global/core/chat/type';
import type {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type {
  InteractiveNodeResponseType,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { type RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { NodeResponseWriteSummary } from '../../chat/nodeResponseStorage';
import z from 'zod';

/**
 * workflow 内部运行期使用的 nodeResponse 摘要。
 *
 * 启用 `WorkflowNodeResponseWriter` 后，完整 nodeResponse 会在节点完成时立即写入
 * `chat_item_responses`，并且不再通过 `runWorkflow` 返回。父 workflow 仍需要少量
 * child 节点信号来继续调度、聚合虚拟节点和处理重试，因此这些字段会在每次节点写库后
 * 由 `summarizeRuntimeNodeResponses` 从本批 nodeResponse 中提取，并在 `WorkflowQueue`
 * 上持续合并。
 *
 * 这个结构只服务于“本次运行过程”，不作为最终详情返回给客户端；详情展示仍从 DB rows
 * 重新拼 `childrenResponses`。少数局部工具结构没有该字段时，
 * `getRuntimeNodeResponseSummary` 可以从传入的临时 nodeResponse 数组归纳同样的信息。
 */
export type RuntimeNodeResponseSummary = {
  /** 本次 workflow 已写入/产生的 response id。父 workflow 用它定位子流程运行期响应。 */
  responseIds: string[];
  /** 已完成的 nodeId。loopRun 读取自定义输出时用它判断哪些子节点真的执行过。 */
  finishedNodeIds: string[];
  /** child workflow 是否出现节点错误。parallel/loopRun 用它判断任务失败。 */
  hasError: boolean;
  /** 最近一次错误文本，供父节点包装虚拟任务错误和 catch 分支判断。 */
  errorText?: string;
  /** loopRunBreak 节点是否命中。父 loopRun 用它提前结束循环。 */
  hasLoopRunBreak: boolean;
  /** stopTool 是否命中。ToolCall/Agent 工具链用它停止后续工具调用。 */
  hasToolStop: boolean;
  /** nestedEnd 节点是否到达。parallel/旧 loop 用它判断子流程是否正常结束。 */
  hasNestedEnd: boolean;
  /** nestedEnd 输出值。parallel task 成功时把它作为该 task 的结果。 */
  nestedEndOutput?: any;
  /** pluginOutput 输出值。插件调用用它替代从完整 nodeResponse 列表里查 pluginOutput 节点。 */
  pluginOutput?: Record<string, any>;
  /** 子 workflow 节点运行时间总和。parallel/loopRun 虚拟包装节点展示用。 */
  runningTime: number;
  /** 子 workflow 顶层节点自身 totalPoints 总和。当前主要用于兜底统计。 */
  totalPoints?: number;
  /** 子 workflow 所有响应的积分总和，仅作为运行期费用聚合中间态，不写入 responseData。 */
  childTotalPoints?: number;
  /** 子 workflow 响应数量，包含嵌套 childResponseCount。父节点展示 child 数量用。 */
  childResponseCount?: number;
};

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
  nodeResponseSummary?: NodeResponseWriteSummary;
  /** 请求内保留的 flat nodeResponses；只有业务入口显式开启 retainInMemory 时才返回。 */
  flatNodeResponses?: ChatHistoryItemResType[];
  runtimeNodeResponseSummary: RuntimeNodeResponseSummary;
  durationSeconds: number;
};

const WorkflowResponseItemSchema = z.object({
  id: z.string().optional(),
  event: z.custom<SseResponseEventEnum>().optional(),
  data: z.union([z.string(), z.looseObject({})])
});
export type WorkflowResponseItemType = z.infer<typeof WorkflowResponseItemSchema>;
export const WorkflowResponseFnSchema = z.function({
  input: z.tuple([WorkflowResponseItemSchema]),
  output: z.void()
});

export type WorkflowResponseType = z.infer<typeof WorkflowResponseFnSchema>;
