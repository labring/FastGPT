import { describe, expect, it } from 'vitest';
import { ChatItemValueTypeEnum, formatCompletionResponseContent } from '@/service/core/chat/utils';
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

  it('returns single interactive response as typed content array when detail is enabled', () => {
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
        type: ChatItemValueTypeEnum.interactive,
        interactive
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
