import { describe, expect, it } from 'vitest';
import {
  ChatItemValueTypeEnum,
  formatCompletionResponseContent,
  getChatItemValueType
} from '@/service/core/chat/utils';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

describe('getChatItemValueType', () => {
  it('infers every legacy chat value type and keeps text as the highest priority', () => {
    expect(getChatItemValueType({ reasoning: {}, text: {} })).toBe(ChatItemValueTypeEnum.text);
    expect(getChatItemValueType({ file: undefined })).toBe(ChatItemValueTypeEnum.file);
    expect(getChatItemValueType({ tool: {} })).toBe(ChatItemValueTypeEnum.tool);
    expect(getChatItemValueType({ tools: [] })).toBe(ChatItemValueTypeEnum.tool);
    expect(getChatItemValueType({ interactive: {} })).toBe(ChatItemValueTypeEnum.interactive);
    expect(getChatItemValueType({ reasoning: {} })).toBe(ChatItemValueTypeEnum.reasoning);
    expect(getChatItemValueType({})).toBe(ChatItemValueTypeEnum.text);
  });
});

describe('formatCompletionResponseContent', () => {
  it('keeps plain single text response OpenAI compatible', () => {
    const result = formatCompletionResponseContent({
      detail: true,
      includeLegacyType: false,
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

  it('adds type to v1 interactive detail values', () => {
    const interactive = {
      type: 'userSelect',
      params: {
        description: '请选择',
        userSelectOptions: [{ label: 'A', value: 'A' }]
      }
    } as AIChatItemValueItemType['interactive'];

    const result = formatCompletionResponseContent({
      detail: true,
      includeLegacyType: true,
      responseContent: [
        {
          interactive
        }
      ]
    });

    expect(result).toEqual([
      {
        type: 'interactive',
        interactive
      }
    ]);
  });

  it('adds type to v1 mixed text and tool detail values', () => {
    const tool = {
      id: 'call_1',
      toolName: 'Test tool',
      toolAvatar: '',
      functionName: 'test_tool',
      params: '{}',
      response: 'ok'
    };

    const result = formatCompletionResponseContent({
      detail: true,
      includeLegacyType: true,
      responseContent: [
        {
          reasoning: { content: 'Need to call a tool' },
          text: { content: 'Calling tool' }
        },
        {
          tools: [tool]
        },
        {
          reasoning: { content: 'Tool call completed' },
          text: { content: 'Done' }
        }
      ]
    });

    expect(result).toEqual([
      {
        type: 'text',
        reasoning: { content: 'Need to call a tool' },
        text: { content: 'Calling tool' }
      },
      {
        type: 'tool',
        tools: [tool]
      },
      {
        type: 'text',
        reasoning: { content: 'Tool call completed' },
        text: { content: 'Done' }
      }
    ]);
  });

  it('keeps v2 mixed detail values without type', () => {
    const tool = {
      id: 'call_v2',
      toolName: 'V2 tool',
      toolAvatar: '',
      functionName: 'v2_tool',
      params: '{}',
      response: 'ok'
    };

    const result = formatCompletionResponseContent({
      detail: true,
      includeLegacyType: false,
      responseContent: [
        {
          reasoning: { content: 'Need to call a tool' },
          text: { content: 'Calling tool' }
        },
        {
          tools: [tool]
        }
      ]
    });

    expect(result).toEqual([
      {
        reasoning: { content: 'Need to call a tool' },
        text: { content: 'Calling tool' }
      },
      {
        tools: [tool]
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
      includeLegacyType: false,
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
      includeLegacyType: false,
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
      includeLegacyType: false,
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
