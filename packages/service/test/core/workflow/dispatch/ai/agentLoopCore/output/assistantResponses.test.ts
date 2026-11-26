import { describe, expect, it } from 'vitest';
import {
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

  it('hides completed internal plan records while retaining their terminal marker and tool context', () => {
    const values = compactAgentLoopCorePlanSnapshots([
      {
        plan: {
          planId: 'complete',
          name: 'Done',
          steps: [{ id: 'done', name: 'Done', status: 'done' }]
        },
        tools: [
          {
            id: 'plan-call',
            toolName: 'Plan',
            toolAvatar: '',
            functionName: 'update_plan',
            params: '{}',
            response: 'Done',
            hideInUI: true
          }
        ]
      }
    ]);
    expect(values[0]).toMatchObject({ plan: null, hideInUI: true, tools: [{ response: 'Done' }] });
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

  it('extracts persisted text and appends only missing final text without duplicating', () => {
    const assistantResponses = [
      {
        reasoning: {
          content: 'think 1 '
        },
        text: {
          content: 'hello'
        }
      }
    ] as any[];

    expect(getAgentLoopCorePersistedTextOutput(assistantResponses)).toBe('hello');

    expect(
      buildAgentLoopCoreFinalAssistantOutput({
        assistantResponses,
        finalText: 'hello world',
        reasoningText: 'think 1 reason',
        hideReason: true
      })
    ).toEqual({
      answerText: 'hello world',
      assistantResponses: [
        {
          reasoning: {
            content: 'think 1 '
          },
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
      ]
    });
  });

  it('does not duplicate text when displayOnly child responses are present', () => {
    const createDisplayOnlyResponses = () =>
      [
        {
          text: {
            content: 'A'
          }
        },
        {
          displayOnly: true,
          text: {
            content: 'B'
          }
        },
        {
          text: {
            content: 'C'
          }
        }
      ] as any[];

    // 1. finalText includes child tool assistantMessages ('ABC')
    const withChildFinalText = createDisplayOnlyResponses();
    expect(
      buildAgentLoopCoreFinalAssistantOutput({
        assistantResponses: withChildFinalText,
        finalText: 'ABC'
      })
    ).toEqual({
      answerText: 'ABC',
      assistantResponses: createDisplayOnlyResponses()
    });

    // 2. persistedText already ends with finalText ('C')
    const withTrailingFinalText = createDisplayOnlyResponses();
    expect(
      buildAgentLoopCoreFinalAssistantOutput({
        assistantResponses: withTrailingFinalText,
        finalText: 'C'
      })
    ).toEqual({
      answerText: 'ABC',
      assistantResponses: createDisplayOnlyResponses()
    });

    // 3. finalText has an unstreamed suffix after displayOnly responses ('ABCD')
    const withMissingSuffix = createDisplayOnlyResponses();
    expect(
      buildAgentLoopCoreFinalAssistantOutput({
        assistantResponses: withMissingSuffix,
        finalText: 'ABCD'
      })
    ).toEqual({
      answerText: 'ABCD',
      assistantResponses: [
        ...createDisplayOnlyResponses(),
        {
          text: {
            content: 'D'
          }
        }
      ]
    });
  });

  it('includes previousAssistantResponses in answerText without mutating current assistantResponses', () => {
    const assistantResponses = [
      {
        text: {
          content: 'after ask'
        }
      }
    ] as any[];

    expect(
      buildAgentLoopCoreFinalAssistantOutput({
        assistantResponses,
        previousAssistantResponses: [
          {
            text: {
              content: 'before ask '
            }
          }
        ],
        finalText: 'after ask'
      })
    ).toEqual({
      answerText: 'before ask after ask',
      assistantResponses: [
        {
          text: {
            content: 'after ask'
          }
        }
      ]
    });
  });
});
