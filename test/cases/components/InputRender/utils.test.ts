import { describe, it, expect } from 'vitest';
import { formatInputType, formatInputValueType } from '@/components/InputRender/utils';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { InputTypeEnum, InputValueTypeEnum } from '@/components/InputRender/index';

describe('formatInputType', () => {
  it('should format VariableInputEnum types correctly', () => {
    expect(formatInputType(VariableInputEnum.select)).toBe(InputTypeEnum.select);
    expect(formatInputType(VariableInputEnum.custom)).toBe(InputTypeEnum.customVariable);
  });

  it('should format FlowNodeInputTypeEnum types correctly', () => {
    expect(formatInputType(FlowNodeInputTypeEnum.select)).toBe(InputTypeEnum.select);
    expect(formatInputType(FlowNodeInputTypeEnum.customVariable)).toBe(
      InputTypeEnum.customVariable
    );
    expect(formatInputType(FlowNodeInputTypeEnum.fileSelect)).toBe(InputTypeEnum.fileSelect);
    expect(formatInputType(FlowNodeInputTypeEnum.selectLLMModel)).toBe(
      InputTypeEnum.selectLLMModel
    );
    expect(formatInputType(FlowNodeInputTypeEnum.JSONEditor)).toBe(InputTypeEnum.JSONEditor);
  });

  it('should return input type for unknown types', () => {
    expect(formatInputType('unknown' as any)).toBe(InputTypeEnum.input);
  });
});

describe('formatInputValueType', () => {
  it('should format WorkflowIOValueTypeEnum types correctly', () => {
    expect(formatInputValueType(WorkflowIOValueTypeEnum.string)).toBe(InputValueTypeEnum.string);
    expect(formatInputValueType(WorkflowIOValueTypeEnum.number)).toBe(InputValueTypeEnum.number);
    expect(formatInputValueType(WorkflowIOValueTypeEnum.boolean)).toBe(InputValueTypeEnum.boolean);
  });

  it('should handle undefined input', () => {
    expect(formatInputValueType(undefined)).toBe(InputValueTypeEnum.object);
  });

  it('should return object type for unknown types', () => {
    expect(formatInputValueType('unknown')).toBe(InputValueTypeEnum.object);
  });
});
