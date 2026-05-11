import { getNanoid } from '../../../common/string/tools';
import z from 'zod';

export const AgentPlanStatusSchema = z.object({
  status: z.enum(['generating', 'updating']).meta({
    description: '计划状态：generating 生成计划中，updating 更新计划中'
  })
});
export type AgentPlanStatusType = z.infer<typeof AgentPlanStatusSchema>;

export const AgentPlanStepStatusSchema = z.enum([
  'pending',
  'in_progress',
  'done',
  'blocked',
  'skipped'
]);
export type AgentPlanStepStatusType = z.infer<typeof AgentPlanStepStatusSchema>;

export const AgentPlanEvidenceSchema = z
  .object({
    kind: z.enum(['tool_result', 'model_output', 'user_input', 'manual']),
    ref: z.string().optional(),
    summary: z.string()
  })
  .meta({ description: '步骤执行证据，记录工具结果、模型输出、用户输入或人工备注' });
export type AgentPlanEvidenceType = z.infer<typeof AgentPlanEvidenceSchema>;

export const AgentStepItemSchema = z.object({
  id: z
    .string()
    .default(() => getNanoid(6))
    .meta({ description: '步骤 ID，用于在计划更新和前端渲染中稳定定位该步骤' }),
  title: z.string().meta({ description: '步骤标题，简短描述该步骤要完成的事情' }),
  description: z.string().meta({ description: '步骤说明，描述执行该步骤时需要关注的目标和边界' }),
  acceptanceCriteria: z
    .array(z.string())
    .default([])
    .meta({ description: '验收标准列表，用于判断该步骤是否已经完成' }),
  status: AgentPlanStepStatusSchema.default('pending').meta({
    description:
      '步骤状态：pending 待执行，in_progress 执行中，done 已完成，blocked 受阻，skipped 已跳过'
  }),
  evidence: z
    .array(AgentPlanEvidenceSchema)
    .default([])
    .meta({ description: '步骤执行证据列表，记录工具结果、模型输出、用户输入或人工备注' }),
  outputSummary: z.string().optional().meta({ description: '步骤完成后的结果摘要' }),
  blocker: z.string().optional().meta({ description: '步骤受阻时的原因或需要用户补充的信息' }),
  needsReplan: z.boolean().optional().meta({ description: '是否需要重新规划后续步骤' })
});
export type AgentStepItemType = z.infer<typeof AgentStepItemSchema>;

export const AgentPlanSchema = z.object({
  planId: z.string().default(() => getNanoid(6)),
  task: z.string(),
  description: z.string(),
  background: z.string().nullish(),
  steps: z
    .array(AgentStepItemSchema)
    .min(1)
    .meta({ description: '计划步骤列表，至少包含一个可执行或可验证的步骤' })
});
export type AgentPlanType = z.infer<typeof AgentPlanSchema>;

export const AgentLoopPlanUpdateSchema = z
  .object({
    id: z.string().meta({ description: 'update_plan 工具调用 ID' }),
    functionName: z.string().default('update_plan').meta({ description: '计划更新工具函数名' }),
    params: z.string().default('').meta({ description: 'update_plan 工具参数 JSON 字符串' }),
    response: z.string().optional().meta({ description: 'update_plan 工具返回给模型的结果' }),
    assistantText: z
      .string()
      .optional()
      .meta({ description: '触发 update_plan 时模型同轮输出的文本' }),
    reasoningText: z
      .string()
      .optional()
      .meta({ description: '触发 update_plan 时模型同轮输出的思考' })
  })
  .meta({ description: 'Agent loop 内部 update_plan 调用记录，用于恢复模型上下文和后续 UI 展示' });
export type AgentLoopPlanUpdateType = z.infer<typeof AgentLoopPlanUpdateSchema>;

export const AgentLoopAskSchema = z
  .object({
    id: z.string().meta({ description: 'ask_agent 工具调用 ID' }),
    functionName: z.string().default('ask_agent').meta({ description: '用户追问工具函数名' }),
    params: z.string().default('').meta({ description: 'ask_agent 工具参数 JSON 字符串' }),
    planId: z.string().optional().meta({ description: '该追问关联的 planId，用于匹配用户回答' }),
    assistantText: z
      .string()
      .optional()
      .meta({ description: '触发 ask_agent 时模型同轮输出的文本' }),
    reasoningText: z
      .string()
      .optional()
      .meta({ description: '触发 ask_agent 时模型同轮输出的思考' })
  })
  .meta({
    description: 'Agent loop 内部 ask_agent 调用记录，用于恢复用户追问上下文和后续 UI 展示'
  });
export type AgentLoopAskType = z.infer<typeof AgentLoopAskSchema>;

export const AgentLoopStopGateSchema = z
  .object({
    id: z.string().meta({ description: 'Stop gate 记录 ID，用于前端稳定渲染和状态更新' }),
    reason: z.string().meta({ description: 'Stop gate 拒绝结束的原因' }),
    feedback: z.string().meta({ description: 'Stop gate 注入给模型的反馈内容' }),
    assistantText: z.string().optional().meta({ description: '被 stop gate 打回的模型草稿文本' }),
    reasoningText: z.string().optional().meta({ description: '被 stop gate 打回的模型草稿思考' })
  })
  .meta({ description: 'Agent loop stop gate 反馈记录，用于恢复模型上下文和后续 UI 展示' });
export type AgentLoopStopGateType = z.infer<typeof AgentLoopStopGateSchema>;
