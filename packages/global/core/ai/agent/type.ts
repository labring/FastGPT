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

export const AgentStepItemSchema = z.object({
  id: z
    .string()
    .default(() => getNanoid(6))
    .meta({ description: '步骤 ID，用于在计划更新和前端渲染中稳定定位该步骤' }),
  name: z.string().meta({ description: '步骤名称，简短描述该步骤要完成的事情' }),
  description: z
    .string()
    .nullish()
    .meta({ description: '步骤说明，描述执行该步骤时需要关注的目标和边界' }),
  status: AgentPlanStepStatusSchema.default('pending').meta({
    description:
      '步骤状态：pending 待执行，in_progress 执行中，done 已完成，blocked 受阻，skipped 已跳过'
  }),
  note: z
    .string()
    .nullish()
    .meta({ description: '步骤备注，记录完成结果、阻塞原因、跳过原因或当前进展' })
});
export type AgentStepItemType = z.infer<typeof AgentStepItemSchema>;

export const AgentPlanSchema = z.object({
  planId: z.string().default(() => getNanoid(6)),
  name: z.string(),
  description: z.string().nullish(),
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
    response: z.string().optional().meta({ description: 'update_plan 工具返回给模型的结果' })
  })
  .meta({ description: 'Agent loop 内部 update_plan 调用记录，用于恢复模型上下文和后续 UI 展示' });
export type AgentLoopPlanUpdateType = z.infer<typeof AgentLoopPlanUpdateSchema>;

export const AgentLoopAskSchema = z
  .object({
    id: z.string().meta({ description: 'ask_agent 工具调用 ID' }),
    functionName: z.string().default('ask_agent').meta({ description: '用户追问工具函数名' }),
    params: z.string().default('').meta({ description: 'ask_agent 工具参数 JSON 字符串' }),
    askId: z.string().min(1).meta({ description: '该追问 ID，用于匹配用户回答' })
  })
  .meta({
    description: 'Agent loop 内部 ask_agent 调用记录，用于恢复用户追问上下文和后续 UI 展示'
  });
export type AgentLoopAskType = z.infer<typeof AgentLoopAskSchema>;

export const AgentLoopStopGateSchema = z
  .object({
    id: z.string().meta({ description: 'Stop gate 记录 ID，用于前端稳定渲染和状态更新' }),
    reason: z.string().meta({ description: 'Stop gate 拒绝结束的原因' }),
    feedback: z.string().meta({ description: 'Stop gate 注入给模型的隐藏 user feedback' })
  })
  .meta({ description: 'Agent loop stop gate 隐藏反馈记录，用于恢复模型上下文' });
export type AgentLoopStopGateType = z.infer<typeof AgentLoopStopGateSchema>;
