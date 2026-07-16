import type { AgentPlanType, AgentStepItemType } from '@fastgpt/global/core/ai/agent/type';
import { AgentPlanSchema, AgentPlanStepStatusSchema } from '@fastgpt/global/core/ai/agent/type';
import z from 'zod';

const toolStringSchema = z.string().nullish();

const SetPlanArgsSchema = z.object({
  name: z.string(),
  steps: z.array(z.string()).min(1)
});

const UpdatePlanStepSchema = z.object({
  id: z.string(),
  status: AgentPlanStepStatusSchema,
  note: toolStringSchema
});

const UpdatePlanArgsSchema = z
  .object({
    updates: z.array(UpdatePlanStepSchema).min(1).optional(),
    add_steps: z.array(z.string()).min(1).optional()
  })
  .refine((args) => args.updates || args.add_steps, {
    message: 'Provide updates, add_steps, or both.'
  });

type SetPlanArgs = z.infer<typeof SetPlanArgsSchema>;
type UpdatePlanArgs = z.infer<typeof UpdatePlanArgsSchema>;
type UpdatePlanStepArgs = z.infer<typeof UpdatePlanStepSchema>;

type UpdatePlanStateResult = {
  plan: AgentPlanType;
  changedStep?: AgentStepItemType;
  message: string;
  warnings: string[];
  success: boolean;
};

const createPlanStep = (name: string): AgentStepItemType =>
  AgentPlanSchema.shape.steps.element.parse({
    name,
    status: 'pending'
  });

/** 生成简短的 plan 进度摘要，作为 plan tool response 返回给模型。 */
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
        description: 'The model called a plan tool with invalid or incomplete arguments.',
        status: 'blocked',
        note: 'Invalid plan tool arguments.'
      }
    ]
  });

const formatStepNameList = (steps: AgentStepItemType[]) =>
  steps.map((step) => `"${step.name}"`).join(', ');

/** 创建或重置 active plan。 */
const setPlan = (args: SetPlanArgs): UpdatePlanStateResult => {
  const steps = args.steps.map(createPlanStep);
  const plan = AgentPlanSchema.parse({
    name: args.name,
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

/** 创建 plan tool 的入口。 */
export const applySetPlan = ({ input }: { input: unknown }): UpdatePlanStateResult => {
  const parsed = SetPlanArgsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      plan: createFallbackPlan('Invalid plan'),
      success: false,
      warnings: [],
      message: `Invalid set_plan arguments: ${parsed.error.message}`
    };
  }

  return setPlan(parsed.data);
};

/** 更新 plan tool 的入口；状态更新保持原子性，校验失败时不追加新步骤。 */
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

  if (!plan) {
    return {
      plan: createFallbackPlan('Missing active plan'),
      success: false,
      warnings: [],
      message: 'Cannot update plan because no active plan exists. Use set_plan first.'
    };
  }

  const args: UpdatePlanArgs = parsed.data;
  let nextPlan = plan;
  let changedStep: AgentStepItemType | undefined;
  for (const stepPatch of args.updates ?? []) {
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

  const addedSteps = (args.add_steps ?? []).map(createPlanStep);
  if (addedSteps.length > 0) {
    nextPlan = {
      ...nextPlan,
      steps: [...nextPlan.steps, ...addedSteps]
    };
    changedStep = addedSteps[addedSteps.length - 1];
  }

  const messages = [
    ...(args.updates?.length
      ? [`Updated ${args.updates.length} plan step${args.updates.length > 1 ? 's' : ''}.`]
      : []),
    ...(addedSteps.length
      ? [`Added plan step${addedSteps.length > 1 ? 's' : ''}: ${formatStepNameList(addedSteps)}.`]
      : [])
  ];

  return {
    plan: nextPlan,
    changedStep,
    success: true,
    warnings: [],
    message: buildPlanToolResponse(nextPlan, messages.join(' '))
  };
};
