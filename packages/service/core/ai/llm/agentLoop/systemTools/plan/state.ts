import type { AgentPlanType, AgentStepItemType } from '@fastgpt/global/core/ai/agent/type';
import { AgentPlanSchema, AgentPlanStepStatusSchema } from '@fastgpt/global/core/ai/agent/type';
import z from 'zod';

const toolStringSchema = z.string().nullish();

const NewPlanStepSchema = z.object({
  name: z.string(),
  description: toolStringSchema
});

const UpdatePlanStepSchema = z.object({
  id: z.string(),
  status: AgentPlanStepStatusSchema,
  note: toolStringSchema
});

const SetPlanArgsSchema = z.object({
  action: z.literal('set_plan'),
  name: z.string(),
  description: toolStringSchema,
  steps: z.array(NewPlanStepSchema).min(1)
});

const AddStepsArgsSchema = z.object({
  action: z.literal('add_steps'),
  steps: z.array(NewPlanStepSchema).min(1)
});

const UpdateStepsArgsSchema = z.object({
  action: z.literal('update_steps'),
  steps: z.array(UpdatePlanStepSchema).min(1)
});

const UpdatePlanArgsSchema = z.discriminatedUnion('action', [
  SetPlanArgsSchema,
  AddStepsArgsSchema,
  UpdateStepsArgsSchema
]);
type UpdatePlanArgs = z.infer<typeof UpdatePlanArgsSchema>;
type NewPlanStepArgs = z.infer<typeof NewPlanStepSchema>;
type UpdatePlanStepArgs = z.infer<typeof UpdatePlanStepSchema>;

type UpdatePlanStateResult = {
  plan: AgentPlanType;
  changedStep?: AgentStepItemType;
  message: string;
  warnings: string[];
  success: boolean;
};

const createPlanStep = (step: NewPlanStepArgs): AgentStepItemType =>
  AgentPlanSchema.shape.steps.element.parse({
    name: step.name,
    description: step.description,
    status: 'pending'
  });

/**
 * 生成简短的 plan 进度摘要，作为 update_plan 的 tool response 返回给模型。
 */
const buildPlanProgressSummary = (plan: AgentPlanType) => {
  const counts = plan.steps.reduce<Record<AgentStepItemType['status'], number>>(
    (acc, step) => {
      acc[step.status] += 1;
      return acc;
    },
    {
      pending: 0,
      in_progress: 0,
      done: 0,
      blocked: 0,
      skipped: 0
    }
  );

  return `Plan progress: ${counts.done} done, ${counts.in_progress} in progress, ${counts.pending} pending, ${counts.blocked} blocked, ${counts.skipped} skipped.`;
};

const formatPlanStepsForToolResponse = (plan: AgentPlanType) =>
  [
    'Current plan steps:',
    ...plan.steps.map((step) =>
      [`- ${step.id}: ${step.name}`, `status=${step.status}`, step.note ? `note=${step.note}` : '']
        .filter(Boolean)
        .join(' | ')
    )
  ].join('\n');

const buildPlanToolResponse = (plan: AgentPlanType, message: string) =>
  [message, buildPlanProgressSummary(plan), formatPlanStepsForToolResponse(plan)].join('\n');

const createFallbackPlan = (name: string) =>
  AgentPlanSchema.parse({
    name,
    description: '',
    steps: [
      {
        id: 'invalid_update',
        name: 'Invalid plan update',
        description: 'The model called update_plan with invalid or incomplete arguments.',
        status: 'blocked',
        note: 'Invalid update_plan arguments.'
      }
    ]
  });

const formatStepNameList = (steps: AgentStepItemType[]) =>
  steps.map((step) => `"${step.name}"`).join(', ');

/**
 * 创建或重置 active plan。set_plan 是唯一允许设置 plan name/description 的入口。
 */
const setPlan = (args: Extract<UpdatePlanArgs, { action: 'set_plan' }>): UpdatePlanStateResult => {
  const steps = args.steps.map(createPlanStep);
  const plan = AgentPlanSchema.parse({
    name: args.name,
    description: args.description,
    steps
  });

  return {
    plan,
    changedStep: steps[steps.length - 1],
    success: true,
    warnings: [],
    message: buildPlanToolResponse(
      plan,
      `Set active plan "${plan.name}" with ${steps.length} step${steps.length > 1 ? 's' : ''}.`
    )
  };
};

const addSteps = ({
  plan,
  args
}: {
  plan?: AgentPlanType;
  args: Extract<UpdatePlanArgs, { action: 'add_steps' }>;
}): UpdatePlanStateResult => {
  if (!plan) {
    return {
      plan: createFallbackPlan('Missing active plan'),
      success: false,
      warnings: [],
      message: 'Cannot add plan steps because no active plan exists. Use set_plan first.'
    };
  }

  const steps = args.steps.map(createPlanStep);
  const nextPlan: AgentPlanType = {
    ...plan,
    steps: [...plan.steps, ...steps]
  };

  return {
    plan: nextPlan,
    changedStep: steps[steps.length - 1],
    success: true,
    warnings: [],
    message: buildPlanToolResponse(
      nextPlan,
      `Added plan step${steps.length > 1 ? 's' : ''}: ${formatStepNameList(steps)}.`
    )
  };
};

const applyStepStatus = ({
  plan,
  stepPatch
}: {
  plan: AgentPlanType;
  stepPatch: UpdatePlanStepArgs;
}): { plan: AgentPlanType; changedStep: AgentStepItemType } | { error: string } => {
  const targetIndex = plan.steps.findIndex((step) => step.id === stepPatch.id);
  if (targetIndex === -1) {
    return { error: `Unknown plan step: ${stepPatch.id}` };
  }

  const currentStep = plan.steps[targetIndex];
  const changedStep: AgentStepItemType = {
    ...currentStep,
    status: stepPatch.status,
    ...(stepPatch.note !== undefined ? { note: stepPatch.note } : {})
  };

  return {
    plan: {
      ...plan,
      steps: plan.steps.map((step, index) => (index === targetIndex ? changedStep : step))
    },
    changedStep
  };
};

const updateSteps = ({
  plan,
  args
}: {
  plan?: AgentPlanType;
  args: Extract<UpdatePlanArgs, { action: 'update_steps' }>;
}): UpdatePlanStateResult => {
  if (!plan) {
    return {
      plan: createFallbackPlan('Missing active plan'),
      success: false,
      warnings: [],
      message: 'Cannot update plan steps because no active plan exists. Use set_plan first.'
    };
  }

  let nextPlan = plan;
  let changedStep: AgentStepItemType | undefined;
  for (const stepPatch of args.steps) {
    const result = applyStepStatus({
      plan: nextPlan,
      stepPatch
    });

    if ('error' in result) {
      return {
        plan,
        success: false,
        warnings: [],
        message: result.error
      };
    }

    nextPlan = result.plan;
    changedStep = result.changedStep;
  }

  return {
    plan: nextPlan,
    changedStep,
    success: true,
    warnings: [],
    message: buildPlanToolResponse(
      nextPlan,
      `Updated ${args.steps.length} plan step${args.steps.length > 1 ? 's' : ''}.`
    )
  };
};

/**
 * 应用单主 loop 的 update_plan 工具参数。
 * 新结构只允许 set_plan、add_steps、update_steps：新增步骤由系统生成 id，更新步骤只修改 status/note。
 */
export const applyPlanUpdate = ({
  plan,
  update
}: {
  plan?: AgentPlanType;
  update: unknown;
}): UpdatePlanStateResult => {
  const parsed = UpdatePlanArgsSchema.safeParse(update);
  if (!parsed.success) {
    return {
      plan: plan ?? createFallbackPlan('Invalid plan'),
      success: false,
      warnings: [],
      message: `Invalid update_plan arguments: ${parsed.error.message}`
    };
  }

  const args = parsed.data;
  if (args.action === 'set_plan') {
    return setPlan(args);
  }

  if (args.action === 'add_steps') {
    return addSteps({ plan, args });
  }

  return updateSteps({ plan, args });
};
