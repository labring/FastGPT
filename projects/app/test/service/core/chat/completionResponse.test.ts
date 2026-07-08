import { describe, expect, it } from 'vitest';
import { formatCompletionResponseContent } from '@/service/core/chat/utils';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

describe('formatCompletionResponseContent', () => {
  it('keeps plain single text response OpenAI compatible', () => {
    const result = formatCompletionResponseContent({
      detail: true,
      responseContent: [
        {
          text: {
            content: 'hello'
          }
        }
      ]
    });

    expect(result).toEqual({
      reasoning: undefined,
      content: 'hello'
    });
  });

  it('returns single interactive response as field-keyed content array when detail is enabled', () => {
    const interactive = {
      type: 'userSelect',
      params: {
        description: '请选择',
        userSelectOptions: [{ label: 'A', value: 'A' }]
      }
    } as AIChatItemValueItemType['interactive'];

    const result = formatCompletionResponseContent({
      detail: true,
      responseContent: [
        {
          interactive
        }
      ]
    });

    expect(result).toEqual([
      {
        interactive
      }
    ]);
  });

  it('returns only public interactive fields and extracts deepest child interactive', () => {
    const interactive = {
      type: 'childrenInteractive',
      entryNodeIds: ['parent'],
      interactiveId: 'internal-interactive-id',
      nodeResponseId: 'internal-node-response-id',
      memoryEdges: [{ id: 'edge' }],
      nodeOutputs: [{ id: 'output' }],
      params: {
        childrenResponse: {
          type: 'userInput',
          entryNodeIds: ['child'],
          interactiveId: 'child-interactive-id',
          memoryEdges: [{ id: 'child-edge' }],
          nodeOutputs: [{ id: 'child-output' }],
          params: {
            description: '填写信息',
            inputForm: []
          }
        }
      }
    } as unknown as AIChatItemValueItemType['interactive'];

    const result = formatCompletionResponseContent({
      detail: true,
      responseContent: [
        {
          interactive
        }
      ]
    });

    expect(result).toEqual([
      {
        interactive: {
          type: 'userInput',
          params: {
            description: '填写信息',
            inputForm: []
          }
        }
      }
    ]);
  });

  it('stops extracting cyclic child interactive and strips childrenResponse', () => {
    const interactive = {
      type: 'childrenInteractive',
      params: {}
    } as Record<string, any>;
    interactive.params.childrenResponse = interactive;

    const result = formatCompletionResponseContent({
      detail: true,
      responseContent: [
        {
          interactive: interactive as AIChatItemValueItemType['interactive']
        }
      ]
    });

    expect(result).toEqual([
      {
        interactive: {
          type: 'childrenInteractive',
          params: {}
        }
      }
    ]);
  });

  it('joins multiple text and reasoning values when detail is disabled', () => {
    const result = formatCompletionResponseContent({
      detail: false,
      responseContent: [
        {
          reasoning: {
            content: 'think 1'
          },
          text: {
            content: 'hello'
          }
        },
        {
          reasoning: {
            content: 'think 2'
          },
          text: {
            content: 'world'
          }
        }
      ]
    });

    expect(result).toEqual({
      reasoning: 'think 1\nthink 2',
      content: 'hello\nworld'
    });
  });
});
