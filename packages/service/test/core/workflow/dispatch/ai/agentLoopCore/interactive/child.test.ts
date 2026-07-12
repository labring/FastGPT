import { describe, expect, it } from 'vitest';
import { createAgentLoopCoreChildInteractiveParams } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';

describe('agentLoopCore child interactive', () => {
  it('keeps only toolCallId for new child interactive resume', () => {
    expect(
      createAgentLoopCoreChildInteractiveParams({
        lastInteractive: {
          type: 'toolChildrenInteractive',
          params: {
            childrenResponse: {
              type: 'userInput'
            },
            toolParams: {
              toolCallId: 'call_tool'
            }
          }
        } as any
      })
    ).toEqual({
      childrenResponse: {
        type: 'userInput'
      },
      toolParams: {
        toolCallId: 'call_tool'
      }
    });
  });

  it('keeps legacy memory request messages when old interactive payload has them', () => {
    const legacyMessages = [
      {
        role: 'tool',
        tool_call_id: 'call_tool',
        content: 'pending'
      }
    ];

    expect(
      createAgentLoopCoreChildInteractiveParams({
        lastInteractive: {
          type: 'toolChildrenInteractive',
          params: {
            childrenResponse: {
              type: 'userInput'
            },
            toolParams: {
              toolCallId: 'call_tool',
              memoryRequestMessages: legacyMessages
            }
          }
        } as any
      })
    ).toEqual(
      expect.objectContaining({
        toolParams: {
          toolCallId: 'call_tool',
          memoryRequestMessages: legacyMessages
        }
      })
    );
  });
});
