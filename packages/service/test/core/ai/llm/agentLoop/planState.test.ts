import { describe, expect, it } from 'vitest';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import { AgentPlanSchema } from '@fastgpt/global/core/ai/agent/type';
import {
  applyPlanUpdate,
  applySetPlan
} from '@fastgpt/service/core/ai/llm/agentLoop/domain/systemTool/plan';

const createPlan = (): AgentPlanType =>
  AgentPlanSchema.parse({
    planId: 'plan_1',
    name: 'Test plan',
    steps: [
      {
        id: 's1',
        name: 'Read code',
        description: 'Read code files',
        status: 'pending'
      },
      {
        id: 's2',
        name: 'Write summary',
        status: 'pending'
      }
    ]
  });

describe('plan state tools', () => {
  it('creates an active plan from a name and string steps', () => {
    const result = applySetPlan({
      input: {
        name: 'New plan',
        steps: ['Step 1', 'Step 2']
      }
    });

    expect(result.success).toBe(true);
    expect(result.plan.name).toBe('New plan');
    expect(result.plan.steps).toHaveLength(2);
    expect(result.plan.steps[0]).toMatchObject({
      name: 'Step 1',
      status: 'pending'
    });
    expect(result.plan.steps[0].id).toBeTruthy();
    expect(result.plan.steps[1]).toMatchObject({
      name: 'Step 2',
      status: 'pending'
    });
    expect(result.message).toContain('Set active plan');
    expect(result.message).toContain(`${result.plan.steps[0].id}: Step 1`);
  });

  it('rejects invalid set_plan arguments', () => {
    const result = applySetPlan({
      input: {
        name: 'Missing steps'
      }
    });

    expect(result.success).toBe(false);
    expect(result.plan.name).toBe('Invalid plan');
    expect(result.message).toContain('Invalid set_plan arguments');
  });

  it('appends string steps with generated ids', () => {
    const plan = createPlan();
    const result = applyPlanUpdate({
      plan,
      update: {
        add_steps: ['Inspect tests']
      }
    });

    expect(result.success).toBe(true);
    expect(result.plan).not.toBe(plan);
    expect(result.plan.steps.map((step) => step.name)).toEqual([
      'Read code',
      'Write summary',
      'Inspect tests'
    ]);
    expect(result.plan.steps[2].id).toBeTruthy();
    expect(result.message).toContain('Added plan step: "Inspect tests"');
  });

  it('updates multiple step statuses and notes atomically', () => {
    const plan = createPlan();
    const result = applyPlanUpdate({
      plan,
      update: {
        updates: [
          {
            id: 's1',
            status: 'done',
            note: 'Read code'
          },
          {
            id: 's2',
            status: 'skipped',
            note: 'No summary needed'
          }
        ]
      }
    });

    expect(result.success).toBe(true);
    expect(plan.steps.map((step) => step.status)).toEqual(['pending', 'pending']);
    expect(result.plan.steps[0]).toMatchObject({
      id: 's1',
      name: 'Read code',
      description: 'Read code files',
      status: 'done',
      note: 'Read code'
    });
    expect(result.plan.steps[1]).toMatchObject({
      id: 's2',
      status: 'skipped',
      note: 'No summary needed'
    });
    expect(result.message).toContain('Updated 2 plan steps');
  });

  it('updates statuses and appends steps in one call', () => {
    const result = applyPlanUpdate({
      plan: createPlan(),
      update: {
        updates: [{ id: 's1', status: 'done' }],
        add_steps: ['Run regression tests', 'Write release note']
      }
    });

    expect(result.success).toBe(true);
    expect(result.plan.steps[0].status).toBe('done');
    expect(result.plan.steps.slice(-2).map((step) => step.name)).toEqual([
      'Run regression tests',
      'Write release note'
    ]);
    expect(result.message).toContain('Updated 1 plan step. Added plan steps');
  });

  it('rejects completed as an invalid step status', () => {
    const plan = createPlan();
    const result = applyPlanUpdate({
      plan,
      update: {
        updates: [{ id: 's1', status: 'completed' }]
      }
    });

    expect(result.success).toBe(false);
    expect(result.plan).toBe(plan);
    expect(result.plan.steps[0].status).toBe('pending');
    expect(result.message).toContain('Invalid update_plan arguments');
  });

  it('treats a null note as an explicit empty note', () => {
    const result = applyPlanUpdate({
      plan: createPlan(),
      update: {
        updates: [{ id: 's1', status: 'in_progress', note: null }]
      }
    });

    expect(result.success).toBe(true);
    expect(result.plan.steps[0].note).toBeNull();
  });

  it('rejects update_plan when no active plan exists', () => {
    const result = applyPlanUpdate({
      update: {
        add_steps: ['Step 1']
      }
    });

    expect(result.success).toBe(false);
    expect(result.plan.name).toBe('Missing active plan');
    expect(result.message).toContain('Use set_plan first');
  });

  it('rejects empty update_plan arguments', () => {
    const plan = createPlan();
    const result = applyPlanUpdate({
      plan,
      update: {}
    });

    expect(result.success).toBe(false);
    expect(result.plan).toBe(plan);
    expect(result.message).toContain('Invalid update_plan arguments');
  });

  it('keeps the original plan when any update id is unknown', () => {
    const plan = createPlan();
    const result = applyPlanUpdate({
      plan,
      update: {
        updates: [
          { id: 's1', status: 'done' },
          { id: 'missing', status: 'done' }
        ],
        add_steps: ['Must not be appended']
      }
    });

    expect(result.success).toBe(false);
    expect(result.plan).toBe(plan);
    expect(plan.steps.map((step) => step.status)).toEqual(['pending', 'pending']);
    expect(result.plan.steps.map((step) => step.name)).not.toContain('Must not be appended');
    expect(result.message).toContain('Unknown plan step');
  });
});
