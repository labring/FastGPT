import { describe, expect, it } from 'vitest';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import { AgentPlanSchema } from '@fastgpt/global/core/ai/agent/type';
import {
  applyPlanUpdate,
  updatePlanState
} from '@fastgpt/service/core/ai/llm/agentLoop/plan/state';

const createPlan = (): AgentPlanType =>
  AgentPlanSchema.parse({
    planId: 'plan_1',
    task: 'Test task',
    description: 'Test description',
    steps: [
      {
        id: 's1',
        title: 'Read code',
        description: 'Read code files',
        acceptanceCriteria: ['Find entry'],
        status: 'pending',
        evidence: []
      },
      {
        id: 's2',
        title: 'Write summary',
        description: 'Write final summary',
        acceptanceCriteria: ['Summarize findings'],
        status: 'pending',
        evidence: []
      }
    ]
  });

describe('updatePlanState', () => {
  it('updates a step without mutating the original plan', () => {
    const plan = createPlan();
    const originalStep = plan.steps[0];

    const result = updatePlanState({
      plan,
      update: {
        stepId: 's1',
        status: 'done',
        evidence: [
          {
            kind: 'tool_result',
            ref: 'call_read',
            summary: 'Found dispatchRunAgent'
          }
        ],
        outputSummary: 'Located the agent entry'
      }
    });

    expect(result.success).toBe(true);
    expect(result.plan).not.toBe(plan);
    expect(result.plan.steps[0]).not.toBe(originalStep);
    expect(plan.steps[0].status).toBe('pending');
    expect(plan.steps[0].evidence).toEqual([]);
    expect(result.plan.steps[0]).toMatchObject({
      id: 's1',
      status: 'done',
      outputSummary: 'Located the agent entry',
      evidence: [
        {
          kind: 'tool_result',
          ref: 'call_read',
          summary: 'Found dispatchRunAgent'
        }
      ]
    });
    expect(result.message).toContain('1 done');
  });

  it('returns an error and keeps the plan unchanged for unknown step ids', () => {
    const plan = createPlan();

    const result = updatePlanState({
      plan,
      update: {
        stepId: 'missing',
        status: 'done',
        outputSummary: 'No-op'
      }
    });

    expect(result.success).toBe(false);
    expect(result.plan).toBe(plan);
    expect(result.message).toContain('Unknown plan step');
  });

  it('requires blocker or reason for blocked steps', () => {
    const plan = createPlan();

    const result = updatePlanState({
      plan,
      update: {
        stepId: 's1',
        status: 'blocked'
      }
    });

    expect(result.success).toBe(false);
    expect(result.plan).toBe(plan);
    expect(result.message).toContain('Blocked plan step');
  });

  it('maps blocked reason to blocker and clears stale blocker/replan state when resolved', () => {
    const plan = createPlan();

    const blocked = updatePlanState({
      plan,
      update: {
        stepId: 's1',
        status: 'blocked',
        reason: 'Need a different path',
        needsReplan: true
      }
    });
    expect(blocked.success).toBe(true);
    expect(blocked.plan.steps[0]).toMatchObject({
      status: 'blocked',
      blocker: 'Need a different path',
      needsReplan: true
    });

    const resolved = updatePlanState({
      plan: blocked.plan,
      update: {
        stepId: 's1',
        status: 'done',
        outputSummary: 'Resolved with fallback path'
      }
    });
    expect(resolved.success).toBe(true);
    expect(resolved.plan.steps[0]).toMatchObject({
      status: 'done',
      outputSummary: 'Resolved with fallback path'
    });
    expect(resolved.plan.steps[0]).not.toHaveProperty('blocker');
    expect(resolved.plan.steps[0]).not.toHaveProperty('needsReplan');
  });

  it('appends evidence instead of replacing it', () => {
    const plan = createPlan();
    const first = updatePlanState({
      plan,
      update: {
        stepId: 's1',
        status: 'in_progress',
        evidence: [
          {
            kind: 'manual',
            summary: 'Started reading'
          }
        ]
      }
    });

    const second = updatePlanState({
      plan: first.plan,
      update: {
        stepId: 's1',
        status: 'done',
        evidence: [
          {
            kind: 'tool_result',
            ref: 'call_read',
            summary: 'Read target file'
          }
        ]
      }
    });

    expect(second.success).toBe(true);
    expect(second.plan.steps[0].evidence).toEqual([
      {
        kind: 'manual',
        summary: 'Started reading'
      },
      {
        kind: 'tool_result',
        ref: 'call_read',
        summary: 'Read target file'
      }
    ]);
  });

  it('applies multiple step updates from one update_plan batch', () => {
    const plan = createPlan();

    const result = applyPlanUpdate({
      plan,
      update: {
        updates: [
          {
            action: 'update_step',
            stepId: 's1',
            status: 'done',
            outputSummary: 'Located the entry'
          },
          {
            action: 'update_step',
            stepId: 's2',
            status: 'blocked',
            blocker: 'Need user confirmation'
          }
        ],
        reason: 'record parallel progress'
      }
    });

    expect(result.success).toBe(true);
    expect(result.plan).not.toBe(plan);
    expect(plan.steps.map((step) => step.status)).toEqual(['pending', 'pending']);
    expect(result.plan.steps[0]).toMatchObject({
      id: 's1',
      status: 'done',
      outputSummary: 'Located the entry'
    });
    expect(result.plan.steps[1]).toMatchObject({
      id: 's2',
      status: 'blocked',
      blocker: 'Need user confirmation'
    });
    expect(result.message).toContain('Applied 2 plan updates');
  });

  it('does not apply a batch when one operation fails', () => {
    const plan = createPlan();

    const result = applyPlanUpdate({
      plan,
      update: {
        updates: [
          {
            action: 'update_step',
            stepId: 's1',
            status: 'done',
            outputSummary: 'Would be done'
          },
          {
            action: 'update_step',
            stepId: 'missing',
            status: 'done',
            outputSummary: 'Invalid'
          }
        ]
      }
    });

    expect(result.success).toBe(false);
    expect(result.plan).toBe(plan);
    expect(plan.steps.map((step) => step.status)).toEqual(['pending', 'pending']);
    expect(result.message).toContain('Batch update failed at operation 2/2');
  });

  it('does not expose intermediate set_plan state when a batch fails without an existing plan', () => {
    const result = applyPlanUpdate({
      update: {
        updates: [
          {
            action: 'set_plan',
            plan: createPlan()
          },
          {
            action: 'update_step',
            stepId: 'missing',
            status: 'done',
            outputSummary: 'Invalid'
          }
        ]
      }
    });

    expect(result.success).toBe(false);
    expect(result.plan.task).toBe('Batch update failed');
    expect(result.plan.steps).toHaveLength(1);
    expect(result.plan.steps[0]).toMatchObject({
      id: 'invalid_update',
      status: 'blocked'
    });
  });

  it('creates and replaces plans through update_plan actions', () => {
    const created = applyPlanUpdate({
      update: {
        updates: [
          {
            action: 'set_plan',
            plan: {
              planId: 'plan_new',
              task: 'New task',
              description: 'New description',
              steps: [
                {
                  id: 's1',
                  title: 'Step 1',
                  description: 'Do step 1',
                  acceptanceCriteria: ['Done'],
                  status: 'pending',
                  evidence: []
                }
              ]
            }
          }
        ]
      }
    });

    expect(created.success).toBe(true);
    expect(created.plan.planId).toBe('plan_new');
    expect(created.message).toContain('Applied 1 plan update');

    const done = updatePlanState({
      plan: created.plan,
      update: {
        stepId: 's1',
        status: 'done',
        evidence: [
          {
            kind: 'manual',
            summary: 'Done evidence'
          }
        ],
        outputSummary: 'Finished'
      }
    });

    const replaced = applyPlanUpdate({
      plan: done.plan,
      update: {
        updates: [
          {
            action: 'replace_plan',
            plan: {
              planId: 'plan_from_model',
              task: 'New task',
              description: 'Revised description',
              steps: [
                {
                  id: 's1',
                  title: 'Step 1 revised',
                  description: 'Still done',
                  acceptanceCriteria: ['Done'],
                  status: 'pending',
                  evidence: []
                },
                {
                  id: 's2',
                  title: 'New step',
                  description: 'New work',
                  acceptanceCriteria: ['New done'],
                  status: 'done',
                  evidence: [
                    {
                      kind: 'model_output',
                      summary: 'Should be cleared for new step'
                    }
                  ],
                  outputSummary: 'Should be cleared'
                }
              ]
            }
          }
        ]
      }
    });

    expect(replaced.success).toBe(true);
    expect(replaced.plan.planId).toBe('plan_new');
    expect(replaced.plan.steps[0]).toMatchObject({
      id: 's1',
      status: 'done',
      outputSummary: 'Finished',
      evidence: [
        {
          kind: 'manual',
          summary: 'Done evidence'
        }
      ]
    });
    expect(replaced.plan.steps[1]).toMatchObject({
      id: 's2',
      status: 'pending',
      evidence: []
    });
    expect(replaced.plan.steps[1]).not.toHaveProperty('outputSummary');
  });
});
