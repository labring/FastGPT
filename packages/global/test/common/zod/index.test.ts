import { describe, expect, it } from 'vitest';
import { BoolSchema } from '@fastgpt/global/common/zod';
import {
  FlowNodeInputItemTypeSchema,
  FlowNodeOutputItemTypeSchema
} from '@fastgpt/global/core/workflow/type/io';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';

describe('BoolSchema', () => {
  it('should accept boolean values directly', () => {
    expect(BoolSchema.parse(true)).toBe(true);
    expect(BoolSchema.parse(false)).toBe(false);
  });

  it('should convert common truthy string values to true', () => {
    ['true', '1', 'yes', 'y', 'on', ' TRUE '].forEach((value) => {
      expect(BoolSchema.parse(value)).toBe(true);
    });
  });

  it('should convert other string values to false', () => {
    ['false', '0', 'no', 'n', 'off', '', 'random'].forEach((value) => {
      expect(BoolSchema.parse(value)).toBe(false);
    });
  });

  it('should convert numeric 0 and 1 values', () => {
    expect(BoolSchema.parse(1)).toBe(true);
    expect(BoolSchema.parse(0)).toBe(false);
    expect(BoolSchema.safeParse(2).success).toBe(false);
  });

  it('should keep workflow io boolean fields compatible with runtime objects', () => {
    expect(
      FlowNodeInputItemTypeSchema.parse({
        key: 'input',
        label: 'Input',
        renderTypeList: [FlowNodeInputTypeEnum.input],
        valueType: WorkflowIOValueTypeEnum.string,
        required: true
      }).required
    ).toBe(true);

    const output = FlowNodeOutputItemTypeSchema.parse({
      id: 'output',
      key: 'output',
      type: FlowNodeOutputTypeEnum.static,
      required: true,
      invalid: false,
      invalidCondition: () => true
    });

    expect(output.required).toBe(true);
    expect(output.invalid).toBe(false);
    expect(output.invalidCondition?.({ inputs: [], llmModelMap: {} })).toBe(true);
  });
});
