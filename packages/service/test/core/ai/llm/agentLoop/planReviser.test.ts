import { describe, expect, it } from 'vitest';
import { AgentPlanSchema, type AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import { mergeStableCompletedSteps } from '@fastgpt/service/core/ai/llm/agentLoop';

const parsePlan = (plan: unknown): AgentPlanType => AgentPlanSchema.parse(plan);

describe('mergeStableCompletedSteps', () => {
  it('preserves completed step status and evidence when the reviser edits the step', () => {
    const currentPlan = parsePlan({
      planId: 'plan_1',
      task: 'Task',
      description: 'Description',
      steps: [
        {
          id: 's1',
          title: 'Read code',
          description: 'Read current implementation',
          status: 'done',
          evidence: [
            {
              kind: 'tool_result',
              ref: 'call_read',
              summary: 'Found loop entry'
            }
          ],
          outputSummary: 'Loop entry located'
        }
      ]
    });

    const revisedPlan = parsePlan({
      planId: 'plan_1',
      task: 'Task',
      description: 'Description',
      steps: [
        {
          id: 's1',
          title: 'Read updated code',
          description: 'Read current implementation again',
          status: 'pending',
          evidence: [
            {
              kind: 'manual',
              summary: 'Reviser acknowledged prior work'
            }
          ]
        }
      ]
    });

    const result = mergeStableCompletedSteps({ currentPlan, revisedPlan });

    expect(result.warnings).toEqual([]);
    expect(result.plan.steps[0]).toMatchObject({
      id: 's1',
      title: 'Read updated code',
      status: 'done',
      outputSummary: 'Loop entry located',
      evidence: [
        {
          kind: 'tool_result',
          ref: 'call_read',
          summary: 'Found loop entry'
        },
        {
          kind: 'manual',
          summary: 'Reviser acknowledged prior work'
        }
      ]
    });
  });

  it('merges dropped completed steps back and resets new revised steps to pending', () => {
    const currentPlan = parsePlan({
      planId: 'plan_1',
      task: 'Task',
      description: 'Description',
      steps: [
        {
          id: 's1',
          title: 'Read code',
          description: 'Read current implementation',
          status: 'done',
          evidence: [
            {
              kind: 'tool_result',
              summary: 'Completed'
            }
          ]
        },
        {
          id: 's2',
          title: 'Old blocked step',
          description: 'Old blocked work',
          status: 'blocked',
          blocker: 'Need a new approach',
          needsReplan: true,
          evidence: []
        }
      ]
    });

    const revisedPlan = parsePlan({
      planId: 'plan_1',
      task: 'Task',
      description: 'Description',
      steps: [
        {
          id: 's3',
          title: 'New step',
          description: 'Use a better approach',
          status: 'done',
          outputSummary: 'Model guessed this was already done',
          blocker: 'Stale blocker',
          needsReplan: true,
          evidence: [
            {
              kind: 'manual',
              summary: 'Model guessed completion'
            }
          ]
        }
      ]
    });

    const result = mergeStableCompletedSteps({ currentPlan, revisedPlan });

    expect(result.warnings).toEqual(['Reviser dropped completed step "s1", merged it back.']);
    expect(result.plan.steps).toEqual([
      expect.objectContaining({
        id: 's3',
        status: 'pending',
        evidence: []
      }),
      expect.objectContaining({
        id: 's1',
        status: 'done',
        evidence: [
          {
            kind: 'tool_result',
            summary: 'Completed'
          }
        ]
      })
    ]);
    expect(result.plan.steps[0]).not.toHaveProperty('outputSummary');
    expect(result.plan.steps[0]).not.toHaveProperty('blocker');
    expect(result.plan.steps[0]).not.toHaveProperty('needsReplan');
    expect(result.plan.steps.find((step) => step.id === 's2')).toBeUndefined();
  });
});
