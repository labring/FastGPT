import { describe, expect, it } from 'vitest';
import { AgentPlanSchema } from '@fastgpt/global/core/ai/agent/type';
import { runStopGate } from '@fastgpt/service/core/ai/llm/agentLoop/stop';

describe('runStopGate', () => {
  it('allows stop when there is no active plan', () => {
    expect(runStopGate({}).allowStop).toBe(true);
  });

  it('rejects stop when the user explicitly required a plan but no active plan exists', () => {
    const result = runStopGate({ requirePlan: true });

    expect(result.allowStop).toBe(false);
    if (!result.allowStop) {
      expect(result.reason).toContain('Explicit plan requirement');
      expect(result.feedbackMessage.content).toContain('explicitly requested a plan');
      expect(result.feedbackMessage.content).toContain('update_plan');
      expect(result.feedbackMessage.content).toContain('set_plan');
    }
  });

  it('rejects stop when active plan has pending steps', () => {
    const plan = AgentPlanSchema.parse({
      planId: 'plan_1',
      task: 'Task',
      description: 'Description',
      steps: [
        {
          id: 's1',
          title: 'Read docs',
          description: 'Read docs',
          acceptanceCriteria: ['Read'],
          status: 'pending',
          evidence: []
        }
      ]
    });

    const result = runStopGate({ activePlan: plan });

    expect(result.allowStop).toBe(false);
    if (!result.allowStop) {
      expect(result.feedbackMessage.content).toContain('Read docs');
      expect(result.feedbackMessage.content).toContain('pending');
    }
  });

  it('rejects blocked steps without blocker and includes runtime tool hint', () => {
    const plan = AgentPlanSchema.parse({
      planId: 'plan_1',
      task: 'Task',
      description: 'Description',
      steps: [
        {
          id: 's1',
          title: 'Blocked step',
          description: 'Blocked',
          acceptanceCriteria: ['Resolved'],
          status: 'blocked',
          evidence: []
        }
      ]
    });

    const result = runStopGate({
      activePlan: plan,
      runtimeToolCalledSinceLastPlanUpdate: true
    });

    expect(result.allowStop).toBe(false);
    if (!result.allowStop) {
      expect(result.feedbackMessage.content).toContain('blocked without blocker');
      expect(result.feedbackMessage.content).toContain('runtime tools');
    }
  });

  it('allows stop when all steps are resolved', () => {
    const plan = AgentPlanSchema.parse({
      planId: 'plan_1',
      task: 'Task',
      description: 'Description',
      steps: [
        {
          id: 's1',
          title: 'Done step',
          description: 'Done',
          acceptanceCriteria: ['Done'],
          status: 'done',
          evidence: []
        },
        {
          id: 's2',
          title: 'Blocked with reason',
          description: 'Blocked',
          acceptanceCriteria: ['Blocked'],
          status: 'blocked',
          blocker: 'User input unavailable',
          evidence: []
        }
      ]
    });

    expect(runStopGate({ activePlan: plan }).allowStop).toBe(true);
  });

  it('rejects stop when runtime tools were used after the last plan update', () => {
    const plan = AgentPlanSchema.parse({
      planId: 'plan_1',
      task: 'Task',
      description: 'Description',
      steps: [
        {
          id: 's1',
          title: 'Done step',
          description: 'Done',
          acceptanceCriteria: ['Done'],
          status: 'done',
          evidence: []
        }
      ]
    });

    const result = runStopGate({
      activePlan: plan,
      runtimeToolCalledSinceLastPlanUpdate: true
    });

    expect(result.allowStop).toBe(false);
    if (!result.allowStop) {
      expect(result.reason).toContain('Runtime tool result');
      expect(result.feedbackMessage.content).toContain('recent runtime tool results');
      expect(result.feedbackMessage.content).toContain('Call update_plan');
    }
  });
});
