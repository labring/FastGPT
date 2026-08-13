import { describe, expect, it } from 'vitest';
import {
  CanonicalFlowNodeInputItemTypeSchema,
  LegacyFlowNodeInputItemTypeSchema
} from '@fastgpt/global/core/workflow/migration';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const inputWithLegacyIndex = {
  key: 'query',
  label: 'Query',
  renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
  selectedTypeIndex: 1
};

describe('workflow input schema boundaries', () => {
  it('accepts the historical index only through the Legacy schema', () => {
    expect(LegacyFlowNodeInputItemTypeSchema.parse(inputWithLegacyIndex)).toMatchObject({
      selectedTypeIndex: 1
    });
    expect(CanonicalFlowNodeInputItemTypeSchema.parse(inputWithLegacyIndex)).not.toHaveProperty(
      'selectedTypeIndex'
    );
  });

  it('keeps current selectedType in canonical data', () => {
    const input = CanonicalFlowNodeInputItemTypeSchema.parse({
      key: 'query',
      label: 'Query',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference
    });

    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(input).not.toHaveProperty('selectedTypeIndex');
  });
});
