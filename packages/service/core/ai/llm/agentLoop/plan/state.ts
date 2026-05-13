import type { AgentPlanType, AgentStepItemType } from '@fastgpt/global/core/ai/agent/type';
import {
  AgentPlanEvidenceSchema,
  AgentPlanSchema,
  AgentPlanStepStatusSchema
} from '@fastgpt/global/core/ai/agent/type';
import z from 'zod';
import { mergeStableCompletedSteps } from './reviser';

const UpdatePlanStatusArgsSchema = z.object({
  stepId: z.string(),
  status: AgentPlanStepStatusSchema,
  evidence: z.array(AgentPlanEvidenceSchema).optional(),
  outputSummary: z.string().optional(),
  blocker: z.string().optional(),
  needsReplan: z.boolean().optional(),
  reason: z.string().optional()
});
type UpdatePlanStatusArgs = z.infer<typeof UpdatePlanStatusArgsSchema>;

const SetPlanArgsSchema = z.object({
  action: z.literal('set_plan'),
  plan: AgentPlanSchema,
  reason: z.string().optional()
});

const UpdatePlanStepArgsSchema = UpdatePlanStatusArgsSchema.extend({
  action: z.literal('update_step')
});

const ReplacePlanArgsSchema = z.object({
  action: z.literal('replace_plan'),
  plan: AgentPlanSchema,
  reason: z.string().optional()
});

const UpdatePlanOperationSchema = z.discriminatedUnion('action', [
  SetPlanArgsSchema,
  UpdatePlanStepArgsSchema,
  ReplacePlanArgsSchema
]);
type UpdatePlanOperation = z.infer<typeof UpdatePlanOperationSchema>;

const BatchUpdatePlanArgsSchema = z.object({
  updates: z.array(UpdatePlanOperationSchema).min(1),
  reason: z.string().optional()
});

const UpdatePlanArgsSchema = BatchUpdatePlanArgsSchema;

type UpdatePlanStateResult = {
  plan: AgentPlanType;
  changedStep?: AgentStepItemType;
  message: string;
  warnings: string[];
  success: boolean;
};

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

/**
 * 应用主 loop 对单个 plan step 的状态更新。
 * 该函数是纯状态变更：负责校验参数、合并 evidence、清理上一轮 blocker/replan 标记，并返回下一版 plan。
 */
export const updatePlanState = ({
  plan,
  update
}: {
  plan: AgentPlanType;
  update: UpdatePlanStatusArgs;
}): UpdatePlanStateResult => {
  const parsed = UpdatePlanStatusArgsSchema.safeParse(update);
  if (!parsed.success) {
    return {
      plan,
      success: false,
      warnings: [],
      message: `Invalid update_plan update_step arguments: ${parsed.error.message}`
    };
  }

  const args = parsed.data;
  const targetIndex = plan.steps.findIndex((step) => step.id === args.stepId);
  if (targetIndex === -1) {
    return {
      plan,
      success: false,
      warnings: [],
      message: `Unknown plan step: ${args.stepId}`
    };
  }

  if (args.status === 'blocked' && !args.blocker && !args.reason) {
    return {
      plan,
      success: false,
      warnings: [],
      message: 'Blocked plan step must include blocker or reason.'
    };
  }

  const warnings: string[] = [];
  const nextOutputSummary = args.outputSummary ?? plan.steps[targetIndex].outputSummary;
  if (args.status === 'done' && !args.evidence?.length && !nextOutputSummary) {
    warnings.push('Done plan step should include evidence or outputSummary.');
  }

  const currentStep = plan.steps[targetIndex];
  const nextBlocker = args.status === 'blocked' ? args.blocker || args.reason : undefined;
  const changedStep: AgentStepItemType = {
    id: currentStep.id,
    title: currentStep.title,
    description: currentStep.description,
    acceptanceCriteria: currentStep.acceptanceCriteria,
    status: args.status,
    evidence: [...currentStep.evidence, ...(args.evidence ?? [])],
    ...(args.outputSummary !== undefined
      ? { outputSummary: args.outputSummary }
      : currentStep.outputSummary !== undefined
        ? { outputSummary: currentStep.outputSummary }
        : {}),
    ...(nextBlocker && { blocker: nextBlocker }),
    ...(args.needsReplan === true && { needsReplan: true })
  };

  const nextPlan: AgentPlanType = {
    ...plan,
    steps: plan.steps.map((step, index) => (index === targetIndex ? changedStep : step))
  };

  return {
    plan: nextPlan,
    changedStep,
    success: true,
    warnings,
    message: [
      `Updated plan step "${changedStep.title}" to ${changedStep.status}.`,
      buildPlanProgressSummary(nextPlan),
      ...warnings
    ].join('\n')
  };
};

const createFallbackPlan = (task: string) =>
  AgentPlanSchema.parse({
    task,
    description: '',
    steps: [
      {
        id: 'invalid_update',
        title: 'Invalid plan update',
        description: 'The model called update_plan with invalid or incomplete arguments.',
        acceptanceCriteria: ['Call update_plan with a valid set_plan or update_step payload.'],
        status: 'blocked',
        evidence: [],
        blocker: 'Invalid update_plan arguments.'
      }
    ]
  });

/**
 * 应用单个 update_plan operation。
 * set_plan/replace_plan 会写入完整计划；update_step 会复用原有单步骤状态更新逻辑。
 */
const applySinglePlanOperation = ({
  plan,
  update
}: {
  plan?: AgentPlanType;
  update: UpdatePlanOperation;
}): UpdatePlanStateResult => {
  if (update.action === 'set_plan') {
    return {
      plan: update.plan,
      success: true,
      warnings: [],
      message: [`Created active plan "${update.plan.task}".`, buildPlanProgressSummary(update.plan)]
        .filter(Boolean)
        .join('\n')
    };
  }

  if (update.action === 'replace_plan') {
    if (!plan) {
      return {
        plan: update.plan,
        success: true,
        warnings: [],
        message: [
          `Replaced active plan with "${update.plan.task}".`,
          buildPlanProgressSummary(update.plan)
        ]
          .filter(Boolean)
          .join('\n')
      };
    }

    const replacementPlan: AgentPlanType = {
      ...update.plan,
      planId: plan.planId
    };
    const merged = mergeStableCompletedSteps({
      currentPlan: plan,
      revisedPlan: replacementPlan
    });

    return {
      plan: merged.plan,
      success: true,
      warnings: merged.warnings,
      message: [
        `Replaced active plan with "${merged.plan.task}".`,
        buildPlanProgressSummary(merged.plan),
        ...merged.warnings
      ].join('\n')
    };
  }

  if (!plan) {
    return {
      plan: createFallbackPlan('Missing active plan'),
      success: false,
      warnings: [],
      message: 'Cannot update a plan step because no active plan exists. Use set_plan first.'
    };
  }

  return updatePlanState({
    plan,
    update
  });
};

/**
 * 应用单主 loop 的 update_plan 工具参数。
 * update_plan 只接受 updates 数组，便于同一轮模型输出批量提交多个状态变更。
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

  const operations = parsed.data.updates;

  let nextPlan = plan;
  let changedStep: AgentStepItemType | undefined;
  const warnings: string[] = [];

  for (let index = 0; index < operations.length; index++) {
    const operationResult = applySinglePlanOperation({
      plan: nextPlan,
      update: operations[index]
    });

    if (!operationResult.success) {
      return {
        plan: plan ?? createFallbackPlan('Batch update failed'),
        success: false,
        warnings: [...warnings, ...operationResult.warnings],
        message: [
          `Batch update failed at operation ${index + 1}/${operations.length}. No changes were applied.`,
          operationResult.message
        ].join('\n')
      };
    }

    nextPlan = operationResult.plan;
    changedStep = operationResult.changedStep ?? changedStep;
    warnings.push(...operationResult.warnings);
  }

  const finalPlan = nextPlan ?? createFallbackPlan('Missing active plan');
  return {
    plan: finalPlan,
    changedStep,
    success: true,
    warnings,
    message: [
      `Applied ${operations.length} plan update${operations.length > 1 ? 's' : ''}.`,
      buildPlanProgressSummary(finalPlan),
      ...warnings
    ].join('\n')
  };
};
