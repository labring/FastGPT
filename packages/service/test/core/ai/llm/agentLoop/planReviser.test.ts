import { describe, expect, it } from 'vitest';
import { AgentPlanSchema, type AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import { mergeStableCompletedSteps } from '@fastgpt/service/core/ai/llm/agentLoop/systemTools/plan';

const parsePlan = (plan: unknown): AgentPlanType => AgentPlanSchema.parse(plan);

describe('mergeStableCompletedSteps', () => {
  it('preserves completed step status and note when the reviser edits the step', () => {
    const currentPlan = parsePlan({
      planId: 'plan_1',
      name: 'Task',
      description: 'Description',
      steps: [
        {
          id: 's1',
          name: 'Read code',
          description: 'Read current implementation',
          status: 'done',
          note: 'Loop entry located'
        }
      ]
    });

    const revisedPlan = parsePlan({
      planId: 'plan_1',
      name: 'Task',
      description: 'Description',
      steps: [
        {
          id: 's1',
          name: 'Read updated code',
          description: 'Read current implementation again',
          status: 'pending',
          note: 'Reviser acknowledged prior work'
        }
      ]
    });

    const result = mergeStableCompletedSteps({ currentPlan, revisedPlan });

    expect(result.warnings).toEqual([]);
    expect(result.plan.steps[0]).toMatchObject({
      id: 's1',
      name: 'Read updated code',
      status: 'done',
      note: 'Loop entry located'
    });
  });

  it('merges dropped completed steps back and resets new revised steps to pending', () => {
    const currentPlan = parsePlan({
      planId: 'plan_1',
      name: 'Task',
      description: 'Description',
      steps: [
        {
          id: 's1',
          name: 'Read code',
          description: 'Read current implementation',
          status: 'done',
          note: 'Completed'
        },
        {
          id: 's2',
          name: 'Old blocked step',
          description: 'Old blocked work',
          status: 'blocked',
          note: 'Need a new approach'
        }
      ]
    });

    const revisedPlan = parsePlan({
      planId: 'plan_1',
      name: 'Task',
      description: 'Description',
      steps: [
        {
          id: 's3',
          name: 'New step',
          description: 'Use a better approach',
          status: 'done',
          note: 'Model guessed this was already done'
        }
      ]
    });

    const result = mergeStableCompletedSteps({ currentPlan, revisedPlan });

    expect(result.warnings).toEqual(['Reviser dropped completed step "s1", merged it back.']);
    expect(result.plan.steps).toEqual([
      expect.objectContaining({
        id: 's3',
        status: 'pending'
      }),
      expect.objectContaining({
        id: 's1',
        status: 'done',
        note: 'Completed'
      })
    ]);
    expect(result.plan.steps[0].note).toBeUndefined();
    expect(result.plan.steps.find((step) => step.id === 's2')).toBeUndefined();
  });
});
