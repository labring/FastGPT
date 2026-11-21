import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import z from 'zod';
import { NodeToolConfigTypeSchema } from '@fastgpt/global/core/workflow/type/node';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageContentPart
} from '@fastgpt/global/core/ai/llm/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { NodeSummary } from '../../../types/runtime';

export type DispatchSubAppResponse = {
  response: string; // 返回给 LLM 的响应
  /** 工具执行失败的内部标记，不能直接作为用户可见的工具响应。 */
  errorMessage?: string;
  /** 子工作流产生的完整 assistant 上下文，由 agent-loop 统一收集并持久化。 */
  assistantMessages?: ChatCompletionMessageParam[];
  usages?: ChatNodeUsageType[];
  nodeSummary?: NodeSummary;
  /** 子工作流暂停时的交互快照，由工作流工具适配层包装后交回 Loop 透传暂停。 */
  interactive?: WorkflowInteractiveResponseType;
  /**
   * 工具自身的运行详情。显式 totalPoints 表示当前响应自身费用；省略时由外层按 usages 计算。
   */
  nodeResponse?: Omit<ChatHistoryItemResType, 'runningTime' | 'id' | 'nodeId'>;
  /**
   * 写入 LLM tool message 的结构化 content（text / image_url parts）。
   * 仅当工具显式返回合法的 parts 时才透传，缺省时按 response 字符串兜底。
   */
  content?: ChatCompletionToolMessageContentPart[];
};

export const SubAppRuntimeSchema = z.object({
  type: z.enum(['tool', 'workflow', 'toolWorkflow', 'commercialTool']),
  id: z.string(),
  name: z.string(),
  avatar: z.string().optional(),
  version: z.string().optional(),
  toolConfig: NodeToolConfigTypeSchema.optional(),
  inputs: z.custom<RuntimeNodeItemType['inputs']>().optional(),
  agentGeneratedInputKeys: z.array(z.string()).optional(),
  params: z.record(z.string(), z.any()).optional()
});
export type SubAppRuntimeType = z.infer<typeof SubAppRuntimeSchema>;

export type GetSubAppInfoFnType = (id: string) => {
  name: string;
  avatar: string;
};
