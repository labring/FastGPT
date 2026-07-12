import { describe, expect, it } from 'vitest';
import {
  appendAgentLoopCoreFinalAssistantResponse,
  buildAgentLoopCoreFinalAssistantOutput,
  getAgentLoopCorePersistedTextOutput
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';

describe('agentLoopCore output assistantResponses helpers', () => {
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
