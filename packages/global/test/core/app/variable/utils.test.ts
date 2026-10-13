import { describe, expect, it } from 'vitest';
import {
  normalizeAndParseVariableList,
  normalizeVariableValueType
} from '@fastgpt/global/core/app/variable/utils';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';

describe('normalizeVariableValueType', () => {
  it.each([
    [VariableInputEnum.input, WorkflowIOValueTypeEnum.string],
    [VariableInputEnum.textarea, WorkflowIOValueTypeEnum.string],
    [VariableInputEnum.password, WorkflowIOValueTypeEnum.string],
    [VariableInputEnum.numberInput, WorkflowIOValueTypeEnum.number],
    [VariableInputEnum.select, WorkflowIOValueTypeEnum.string],
    [VariableInputEnum.multipleSelect, WorkflowIOValueTypeEnum.arrayString],
    [VariableInputEnum.switch, WorkflowIOValueTypeEnum.boolean],
    [VariableInputEnum.timePointSelect, WorkflowIOValueTypeEnum.string],
    [VariableInputEnum.timeRangeSelect, WorkflowIOValueTypeEnum.arrayString],
    [VariableInputEnum.llmSelect, WorkflowIOValueTypeEnum.string],
    [VariableInputEnum.file, WorkflowIOValueTypeEnum.arrayString],
    [VariableInputEnum.custom, WorkflowIOValueTypeEnum.string],
    [VariableInputEnum.internal, WorkflowIOValueTypeEnum.string]
  ])('maps empty %s valueType to %s', (type, expected) => {
    expect(normalizeVariableValueType({ type, valueType: undefined })).toBe(expected);
    expect(normalizeVariableValueType({ type, valueType: null })).toBe(expected);
    expect(normalizeVariableValueType({ type, valueType: '' })).toBe(expected);
  });

  it('keeps an existing valid valueType', () => {
    expect(
      normalizeVariableValueType({
        type: VariableInputEnum.input,
        valueType: WorkflowIOValueTypeEnum.object
      })
    ).toBe(WorkflowIOValueTypeEnum.object);
  });

  it.each([
    { type: VariableInputEnum.datasetSelect, valueType: undefined },
    { type: 'removed-input-type', valueType: null },
    { type: VariableInputEnum.input, valueType: 'removed-value-type' }
  ])('falls back to any when the value type cannot be resolved', (input) => {
    expect(normalizeVariableValueType(input)).toBe(WorkflowIOValueTypeEnum.any);
  });
});

describe('normalizeAndParseVariableList', () => {
  it('returns variables with required normalized valueType values', () => {
    const result = normalizeAndParseVariableList([
      {
        key: 'query',
        label: 'Query',
        description: '',
        type: VariableInputEnum.textarea,
        valueType: null
      },
      {
        key: 'count',
        label: 'Count',
        description: '',
        type: VariableInputEnum.numberInput
      }
    ]);

    expect(result.map((item) => item.valueType)).toEqual([
      WorkflowIOValueTypeEnum.string,
      WorkflowIOValueTypeEnum.number
    ]);
  });

  it('rejects data that cannot be safely repaired', () => {
    expect(() =>
      normalizeAndParseVariableList([
        {
          key: 'query',
          type: VariableInputEnum.input
        }
      ])
    ).toThrow();
    expect(() => normalizeAndParseVariableList({})).toThrow();
  });
});
