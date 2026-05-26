import { describe, expect, it } from 'vitest';
import type { VariableItemType } from '@fastgpt/global/core/app/type';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { formatChatRequestVariables } from '@/components/core/chat/ChatContainer/ChatBox/utils/requestVariables';

const createVariable = (override: Partial<VariableItemType>): VariableItemType =>
  ({
    key: 'key',
    label: 'label',
    description: '',
    type: VariableInputEnum.input,
    valueType: WorkflowIOValueTypeEnum.string,
    required: false,
    defaultValue: '',
    ...override
  }) as VariableItemType;

describe('formatChatRequestVariables', () => {
  it('keeps only declared variables and formats values by valueType', () => {
    const result = formatChatRequestVariables({
      variableList: [
        createVariable({
          key: 'name',
          valueType: WorkflowIOValueTypeEnum.string
        }),
        createVariable({
          key: 'age',
          type: VariableInputEnum.numberInput,
          valueType: WorkflowIOValueTypeEnum.number
        }),
        createVariable({
          key: 'enabled',
          type: VariableInputEnum.switch,
          valueType: WorkflowIOValueTypeEnum.boolean
        })
      ],
      variables: {
        name: 'FastGPT',
        age: '18',
        enabled: 'true',
        ignored: 'not declared'
      }
    });

    expect(result).toEqual({
      name: 'FastGPT',
      age: 18,
      enabled: true
    });
  });

  it('uses defaultValue for empty string, null and undefined form values', () => {
    const result = formatChatRequestVariables({
      variableList: [
        createVariable({
          key: 'emptyText',
          defaultValue: 'fallback'
        }),
        createVariable({
          key: 'nullNumber',
          type: VariableInputEnum.numberInput,
          valueType: WorkflowIOValueTypeEnum.number,
          defaultValue: '42'
        }),
        createVariable({
          key: 'missingArray',
          type: VariableInputEnum.multipleSelect,
          valueType: WorkflowIOValueTypeEnum.arrayString,
          defaultValue: ['a', 'b']
        })
      ],
      variables: {
        emptyText: '',
        nullNumber: null
      }
    });

    expect(result).toEqual({
      emptyText: 'fallback',
      nullNumber: 42,
      missingArray: ['a', 'b']
    });
  });

  it('formats time point and time range variables before value type conversion', () => {
    const startAtInput = '2026-05-19T01:02:03.000Z';
    const periodStartInput = '2026-05-19T03:04:05.000Z';

    const result = formatChatRequestVariables({
      variableList: [
        createVariable({
          key: 'startAt',
          type: VariableInputEnum.timePointSelect,
          valueType: WorkflowIOValueTypeEnum.string
        }),
        createVariable({
          key: 'period',
          type: VariableInputEnum.timeRangeSelect,
          valueType: WorkflowIOValueTypeEnum.arrayString
        })
      ],
      variables: {
        startAt: startAtInput,
        period: [periodStartInput, '']
      }
    });

    expect(result).toEqual({
      startAt: formatTime2YMDHMS(new Date(startAtInput)),
      period: [formatTime2YMDHMS(new Date(periodStartInput)), '']
    });
  });

  it('returns an empty object when variableList is missing', () => {
    expect(formatChatRequestVariables({ variables: { name: 'FastGPT' } })).toEqual({});
  });
});
