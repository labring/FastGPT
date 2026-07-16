import { describe, expect, it } from 'vitest';
import {
  appendAgentLoopCoreFinalAssistantResponse,
  buildAgentLoopCoreFinalAssistantOutput,
  compactAgentLoopCorePlanSnapshots,
  getAgentLoopCorePersistedTextOutput
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/application/output/assistantResponses';

describe('agentLoopCore output assistantResponses helpers', () => {
  it('keeps only the last plan snapshot', () => {
    const createPlan = (planId: string) => ({
      planId,
      name: `Plan ${planId}`,
      steps: [{ id: `step_${planId}`, name: 'Execute', status: 'in_progress' as const }]
    });

    expect(
      compactAgentLoopCorePlanSnapshots([
        { plan: createPlan('1') },
        { text: { content: 'working' } },
        { plan: createPlan('2') },
        { plan: createPlan('3') }
      ])
    ).toEqual([{ text: { content: 'working' } }, { plan: createPlan('3') }]);
  });

  it('stores a null terminal marker when the last plan is complete', () => {
    expect(
      compactAgentLoopCorePlanSnapshots([
        {
          plan: {
            planId: 'plan_1',
            name: 'Complete task',
            steps: [{ id: 'step_1', name: 'Execute', status: 'done' }]
          }
        }
      ])
    ).toEqual([{ plan: null }]);
  });

  it('extracts persisted text and appends only missing final text', () => {
    const assistantResponses = [
      {
        text: {
          content: 'hello'
        }
      }
    ] as any[];

    expect(getAgentLoopCorePersistedTextOutput(assistantResponses)).toBe('hello');

    appendAgentLoopCoreFinalAssistantResponse({
      assistantResponses,
      finalText: 'hello world',
      reasoningText: 'reason',
      hideReason: true
    });

    appendAgentLoopCoreFinalAssistantResponse({
      assistantResponses,
      finalText: 'hello world'
    });

    expect(assistantResponses).toEqual([
      {
        text: {
          content: 'hello'
        }
      },
      {
        reasoning: {
          content: 'reason'
        },
        hideReason: true,
        text: {
          content: ' world'
        }
      }
    ]);
  });

  it('builds final assistant output with completed text', () => {
    const assistantResponses = [
      {
        text: {
          content: 'hello'
        }
      }
    ] as any[];

    expect(
      buildAgentLoopCoreFinalAssistantOutput({
        assistantResponses,
        finalText: 'hello world',
        reasoningText: 'reason'
      })
    ).toEqual({
      answerText: 'hello world',
      assistantResponses: [
        {
          text: {
            content: 'hello'
          }
        },
        {
          reasoning: {
            content: 'reason'
          },
          text: {
            content: ' world'
          }
        }
      ]
    });
  });
});
