import { summarizeAgentLoopCoreResult } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';
import { describe, expect, it } from 'vitest';

describe('summarizeAgentLoopCoreResult', () => {
  it('normalizes done result usage and finish reason', () => {
    expect(
      summarizeAgentLoopCoreResult({
        status: 'done',
        requestIds: ['req_1'],
        completeMessages: [],
        assistantMessages: [
          {
            role: 'assistant',
            content: 'answer',
            reasoning_content: 'reason'
          }
        ],
        assistantResponses: [{ text: { content: 'answer' } }],
        finishReason: 'stop',
        usages: [
          {
            moduleName: 'account_usage:agent_call',
            inputTokens: 10,
            outputTokens: 5,
            totalPoints: 1
          },
          {
            moduleName: 'child_tool',
            inputTokens: 100,
            outputTokens: 50,
            totalPoints: 20
          }
        ]
      })
    ).toEqual(
      expect.objectContaining({
        status: 'done',
        requestIds: ['req_1'],
        assistantResponses: [{ text: { content: 'answer' } }],
        finishReason: 'stop',
        usages: expect.arrayContaining([
          expect.objectContaining({ moduleName: 'account_usage:agent_call' }),
          expect.objectContaining({ moduleName: 'child_tool' })
        ]),
        inputTokens: 10,
        outputTokens: 5,
        llmTotalPoints: 1,
        finalText: 'answer',
        reasoningText: 'reason'
      })
    );
  });

  it('turns errors into final text and treats aborts as normal finishes', () => {
    expect(
      summarizeAgentLoopCoreResult({
        status: 'error',
        requestIds: [],
        completeMessages: [],
        assistantMessages: [],
        assistantResponses: [],
        error: new Error('failed'),
        finishReason: 'stop',
        usages: []
      })
    ).toEqual(
      expect.objectContaining({
        status: 'error',
        errorText: 'failed',
        finalText: 'failed',
        finishReason: 'stop',
        inputTokens: 0,
        outputTokens: 0,
        llmTotalPoints: 0
      })
    );

    const abortedResult = summarizeAgentLoopCoreResult({
      status: 'aborted',
      requestIds: [],
      completeMessages: [],
      assistantMessages: [],
      assistantResponses: [],
      finishReason: 'stop',
      usages: []
    });

    expect(abortedResult).toEqual(
      expect.objectContaining({
        status: 'aborted'
      })
    );
    expect(abortedResult.errorText).toBeUndefined();
    expect(abortedResult.finalText).toBeUndefined();
  });

  it('builds ask interactive and keeps provider state for workflow adapter wrapping', () => {
    const providerState = {
      pendingAskId: 'call_ask'
    };
    const ask = {
      reason: 'Need input',
      blockerType: 'missing_required_input' as const,
      question: 'Confirm?',
      options: ['Yes', 'No', 'Not sure']
    };

    expect(
      summarizeAgentLoopCoreResult({
        status: 'interactive',
        requestIds: [],
        completeMessages: [],
        assistantMessages: [],
        assistantResponses: [],
        finishReason: 'stop',
        usages: [],
        pause: {
          type: 'ask',
          ask,
          askId: 'call_ask'
        },
        providerState
      })
    ).toEqual(
      expect.objectContaining({
        status: 'interactive',
        providerState,
        interactive: {
          type: 'agentPlanAskQuery',
          askId: 'call_ask',
          params: {
            content: 'Confirm?',
            reason: 'Need input',
            blockerType: 'missing_required_input',
            options: ['Yes', 'No', 'Not sure']
          }
        }
      })
    );
  });

  it('normalizes tool child pause to unified interactive', () => {
    const childrenResponse = {
      type: 'userSelect'
    };

    expect(
      summarizeAgentLoopCoreResult({
        status: 'interactive',
        requestIds: [],
        completeMessages: [],
        assistantMessages: [],
        assistantResponses: [],
        finishReason: 'stop',
        usages: [],
        pause: {
          type: 'tool_child',
          childrenResponse,
          toolCallId: 'call_tool'
        }
      })
    ).toEqual(
      expect.objectContaining({
        interactive: {
          type: 'toolChildrenInteractive',
          params: {
            childrenResponse,
            toolParams: {
              toolCallId: 'call_tool'
            }
          }
        }
      })
    );
  });
});
