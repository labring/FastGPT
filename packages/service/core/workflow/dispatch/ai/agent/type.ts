import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import z from 'zod';
import { NodeToolConfigTypeSchema } from '@fastgpt/global/core/workflow/type/node';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';

export type DispatchSubAppResponse = {
  response: string; // 返回给 LLM 的响应
  /** 子工作流产生的完整 assistant 上下文，由 agent-loop 统一收集并持久化。 */
  assistantMessages?: ChatCompletionMessageParam[];
  usages?: ChatNodeUsageType[];
  /** 子工作流暂停时的交互快照，交回 agent-loop 形成 tool_child pause。 */
  interactive?: WorkflowInteractiveResponseType;
  nodeResponse?: Omit<ChatHistoryItemResType, 'runningTime' | 'totalPoints' | 'id' | 'nodeId'>; // 部分字段外层会自动根据 usages 计算。
};

export const SubAppRuntimeSchema = z.object({
  type: z.enum(['tool', 'workflow', 'toolWorkflow', 'commercialTool']),
  id: z.string(),
  name: z.string(),
  avatar: z.string().optional(),
  toolDescription: z.string().optional(),
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
  toolDescription: string;
};
