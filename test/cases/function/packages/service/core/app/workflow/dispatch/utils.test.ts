import { describe, expect, it } from 'vitest';
import { getHistories } from '@fastgpt/service/core/workflow/dispatch/utils';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';

describe('getHistories test', async () => {
  const MockHistories: ChatItemType[] = [
    {
      obj: ChatRoleEnum.System,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: '你好'
          }
        }
      ]
    },
    {
      obj: ChatRoleEnum.Human,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: '你好'
          }
        }
      ]
    },
    {
      obj: ChatRoleEnum.AI,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: '你好2'
          }
        }
      ]
    },
    {
      obj: ChatRoleEnum.Human,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: '你好3'
          }
        }
      ]
    },
    {
      obj: ChatRoleEnum.AI,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: '你好4'
          }
        }
      ]
    }
  ];

  it('getHistories', async () => {
    // Number
    expect(getHistories(1, MockHistories)).toEqual([
      ...MockHistories.slice(0, 1),
      ...MockHistories.slice(-2)
    ]);
    expect(getHistories(2, MockHistories)).toEqual([...MockHistories.slice(0)]);
    expect(getHistories(4, MockHistories)).toEqual([...MockHistories.slice(0)]);

    // Array
    expect(
      getHistories(
        [
          {
            obj: ChatRoleEnum.Human,
            value: [
              {
                type: ChatItemValueTypeEnum.text,
                text: {
                  content: '你好'
                }
              }
            ]
          }
        ],
        MockHistories
      )
    ).toEqual([
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            type: ChatItemValueTypeEnum.text,
            text: {
              content: '你好'
            }
          }
        ]
      }
    ]);
  });
});
