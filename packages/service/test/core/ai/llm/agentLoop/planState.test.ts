import { describe, expect, it } from 'vitest';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import { AgentPlanSchema } from '@fastgpt/global/core/ai/agent/type';
import { applyPlanUpdate } from '@fastgpt/service/core/ai/llm/agentLoop/systemTools/plan';

const createPlan = (): AgentPlanType =>
  AgentPlanSchema.parse({
    planId: 'plan_1',
    name: 'Test plan',
    description: 'Test description',
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
        description: 'Write final summary',
        status: 'pending'
      }
    ]
  });

describe('applyPlanUpdate', () => {
  it('creates an active plan with set_plan', () => {
    const result = applyPlanUpdate({
      update: {
        action: 'set_plan',
        name: 'New plan',
        description: 'New description',
        steps: [
          {
            name: 'Step 1',
            description: 'Do step 1'
          },
          {
            name: 'Step 2'
          }
        ]
      }
    });

    expect(result.success).toBe(true);
    expect(result.plan.name).toBe('New plan');
    expect(result.plan.description).toBe('New description');
    expect(result.plan.steps).toHaveLength(2);
    expect(result.plan.steps[0]).toMatchObject({
      name: 'Step 1',
      description: 'Do step 1',
      status: 'pending'
    });
    expect(result.plan.steps[0].id).toBeTruthy();
    expect(result.plan.steps[1]).toMatchObject({
      name: 'Step 2',
      status: 'pending'
    });
    expect(result.message).toContain('Set active plan');
    expect(result.message).toContain(`${result.plan.steps[0].id}: Step 1`);
    expect(result.message).toContain(`${result.plan.steps[1].id}: Step 2`);
  });

  it('appends steps with generated ids', () => {
    const plan = createPlan();

    const result = applyPlanUpdate({
      plan,
      update: {
        action: 'add_steps',
        steps: [
          {
            name: 'Inspect tests',
            description: 'Read related tests'
          }
        ]
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
    expect(result.plan.steps[2].id).not.toBe('s1');
    expect(result.message).toContain(`${result.plan.steps[2].id}: Inspect tests`);
  });

  it('updates step status and note without changing content', () => {
    const plan = createPlan();

    const result = applyPlanUpdate({
      plan,
      update: {
        action: 'update_steps',
        steps: [
          {
            id: 's1',
            status: 'done',
            note: 'Located the agent entry'
          }
        ]
      }
    });

    expect(result.success).toBe(true);
    expect(result.plan).not.toBe(plan);
    expect(plan.steps[0].status).toBe('pending');
    expect(result.plan.steps[0]).toMatchObject({
      id: 's1',
      name: 'Read code',
      description: 'Read code files',
      status: 'done',
      note: 'Located the agent entry'
    });
  });

  it('updates multiple step statuses from one call', () => {
    const plan = createPlan();

    const result = applyPlanUpdate({
      plan,
      update: {
        action: 'update_steps',
        steps: [
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
    expect(result.plan.steps[0]).toMatchObject({
      id: 's1',
      status: 'done',
      note: 'Read code'
    });
    expect(result.plan.steps[1]).toMatchObject({
      id: 's2',
      status: 'skipped',
      note: 'No summary needed'
    });
    expect(result.message).toContain('Updated 2 plan steps');
    expect(result.message).toContain('s1: Read code | status=done | note=Read code');
    expect(result.message).toContain('s2: Write summary | status=skipped | note=No summary needed');
  });

  it('rejects add_steps when no active plan exists', () => {
    const result = applyPlanUpdate({
      update: {
        action: 'add_steps',
        steps: [
          {
            name: 'Step 1'
          }
        ]
      }
    });

    expect(result.success).toBe(false);
    expect(result.plan.name).toBe('Missing active plan');
    expect(result.message).toContain('Use set_plan first');
  });

  it('returns an error and keeps the plan unchanged for unknown step ids', () => {
    const plan = createPlan();

    const result = applyPlanUpdate({
      plan,
      update: {
        action: 'update_steps',
        steps: [
          {
            id: 'missing',
            status: 'done',
            note: 'No-op'
          }
        ]
      }
    });

    expect(result.success).toBe(false);
    expect(result.plan).toBe(plan);
    expect(result.message).toContain('Unknown plan step');
  });

  it('does not apply partial status updates when one step is unknown', () => {
    const plan = createPlan();

    const result = applyPlanUpdate({
      plan,
      update: {
        action: 'update_steps',
        steps: [
          {
            id: 's1',
            status: 'done',
            note: 'Would be done'
          },
          {
            id: 'missing',
            status: 'done',
            note: 'Invalid'
          }
        ]
      }
    });

    expect(result.success).toBe(false);
    expect(result.plan).toBe(plan);
    expect(plan.steps.map((step) => step.status)).toEqual(['pending', 'pending']);
  });

  it('treats null optional fields as omitted', () => {
    const created = applyPlanUpdate({
      update: {
        action: 'set_plan',
        name: 'New plan',
        description: null,
        steps: [
          {
            name: 'Step 1',
            description: null
          }
        ]
      }
    });

    expect(created.success).toBe(true);
    expect(created.plan.description).toBeNull();
    expect(created.plan.steps[0].description).toBeNull();

    const updated = applyPlanUpdate({
      plan: created.plan,
      update: {
        action: 'update_steps',
        steps: [
          {
            id: created.plan.steps[0].id,
            status: 'done',
            note: null
          }
        ]
      }
    });

    expect(updated.success).toBe(true);
    expect(updated.plan.steps[0].note).toBeNull();
  });

  it('rejects invalid update_plan arguments', () => {
    const plan = createPlan();

    const result = applyPlanUpdate({
      plan,
      update: {
        action: 'unknown_action'
      }
    });

    expect(result.success).toBe(false);
    expect(result.plan).toBe(plan);
    expect(result.message).toContain('Invalid update_plan arguments');
  });
});
