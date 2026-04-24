import { describe, expect, it } from 'vitest';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { snapTextInputValueType } from '@/components/core/app/VariableEditModal/utils';

describe('snapTextInputValueType', () => {
  it('undefined → string，不清空 defaultValue（legacy 隐式 string）', () => {
    expect(snapTextInputValueType(undefined)).toEqual({
      valueType: WorkflowIOValueTypeEnum.string,
      resetDefault: false
    });
  });

  it.each([
    WorkflowIOValueTypeEnum.string,
    WorkflowIOValueTypeEnum.object,
    WorkflowIOValueTypeEnum.arrayString,
    WorkflowIOValueTypeEnum.arrayNumber,
    WorkflowIOValueTypeEnum.arrayBoolean,
    WorkflowIOValueTypeEnum.arrayObject,
    WorkflowIOValueTypeEnum.any
  ])('合法 valueType %s 原样返回，不清 defaultValue', (valueType) => {
    expect(snapTextInputValueType(valueType)).toEqual({
      valueType,
      resetDefault: false
    });
  });

  it.each([
    WorkflowIOValueTypeEnum.number,
    WorkflowIOValueTypeEnum.boolean,
    WorkflowIOValueTypeEnum.arrayAny,
    WorkflowIOValueTypeEnum.chatHistory,
    WorkflowIOValueTypeEnum.datasetQuote
  ])('非法 valueType %s snap 回 string，并要求清 defaultValue', (valueType) => {
    expect(snapTextInputValueType(valueType)).toEqual({
      valueType: WorkflowIOValueTypeEnum.string,
      resetDefault: true
    });
  });
});
