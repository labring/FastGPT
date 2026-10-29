import { getNanoid } from '../../../common/string/tools';
import z from 'zod';

export const AgentAskBlockerTypeSchema = z.enum([
  'missing_required_input',
  'tool_unavailable',
  'ambiguous_goal',
  'user_choice'
]);
export type AgentAskBlockerType = z.infer<typeof AgentAskBlockerTypeSchema>;

export const AgentAskOptionSchema = z.object({
  summary: z.string().trim().min(1),
  value: z.string().trim().min(1)
});
export type AgentAskOption = z.infer<typeof AgentAskOptionSchema>;

export const AgentAskQuestionSchema = z.object({
  question: z.string().trim().min(1),
  options: z.array(AgentAskOptionSchema).min(2).max(4)
});
export type AgentAskQuestion = z.infer<typeof AgentAskQuestionSchema>;

const AgentAskBaseSchema = z.object({
  reason: z.string(),
  blockerType: AgentAskBlockerTypeSchema
});

/** Ask 工具和展示共用参数契约；旧单题参数只在消费时转换，不改写原始字符串。 */
export const AgentAskPayloadSchema = z
  .union([
    AgentAskBaseSchema.extend({
      questions: z.array(AgentAskQuestionSchema).min(1).max(3)
    }),
    AgentAskBaseSchema.extend({
      question: z.string().trim().min(1),
      options: z.array(z.string().trim().min(1)).min(2).max(5)
    })
  ])
  .transform((payload) =>
    'questions' in payload
      ? payload
      : {
          reason: payload.reason,
          blockerType: payload.blockerType,
          questions: [
            {
              question: payload.question,
              options: payload.options.map((option) => ({ summary: option, value: option }))
            }
          ]
        }
  );
export type AgentAskPayload = z.infer<typeof AgentAskPayloadSchema>;

/** 解析 Ask 原始 JSON；展示与执行必须使用同一入口，不能修复后另存一份参数。 */
export const AgentAskArgumentsSchema = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Ask tool arguments are not valid JSON.' });
      return z.NEVER;
    }
  })
  .pipe(AgentAskPayloadSchema);

/** 交互工具仅保存原调用 ID 和原始 JSON；展示参数由各自 Schema 校验。 */
export const InteractiveToolParamsSchema = z.object({
  toolCallId: z.string().min(1).meta({ description: '模型返回的原始 tool call ID' }),
  arguments: z.string().meta({ description: '模型原始工具参数 JSON 字符串' })
});

export const AgentAskInteractiveSchema = z.object({
  type: z.literal('agentAsk'),
  params: InteractiveToolParamsSchema.extend({
    arguments: z
      .string()
      .refine((value) => AgentAskArgumentsSchema.safeParse(value).success, {
        message: 'Invalid Ask tool arguments'
      })
      .meta({ description: '模型原始工具参数 JSON 字符串，保存及恢复时不重新序列化' })
  })
});
export type AgentAskInteractive = z.infer<typeof AgentAskInteractiveSchema>;

export const AgentAskAnswerPayloadSchema = z.object({
  answers: z.array(z.string())
});
export type AgentAskAnswerPayload = z.infer<typeof AgentAskAnswerPayloadSchema>;

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

/**
 * 读取持久化计划时兼容旧版 task/title 字段，并统一输出当前计划结构。
 * 新计划的生成与更新仍使用 AgentPlanSchema，避免旧字段继续进入写入链路。
 */
export const AgentPlanReadSchema = z.preprocess((value) => {
  const isRecord = (input: unknown): input is Record<string, unknown> =>
    typeof input === 'object' && input !== null && !Array.isArray(input);

  if (!isRecord(value)) return value;

  return {
    ...value,
    name: value.name ?? value.task,
    steps: Array.isArray(value.steps)
      ? value.steps.map((step) =>
          isRecord(step)
            ? {
                ...step,
                name: step.name ?? step.title
              }
            : step
        )
      : value.steps
  };
}, AgentPlanSchema);

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
