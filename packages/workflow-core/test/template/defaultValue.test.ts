import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { getResourceSafeEmptyValue, hasConfiguredValue, resolveInitialInputValue } from '../../src';
import { describe, expect, it } from 'vitest';

const createInput = (patch: Partial<FlowNodeInputItemType> = {}): FlowNodeInputItemType => ({
  key: 'value',
  label: 'Value',
  renderTypeList: [FlowNodeInputTypeEnum.input],
  valueType: WorkflowIOValueTypeEnum.string,
  ...patch
});

describe('resolveInitialInputValue', () => {
  it.each([
    { value: '', name: 'empty string' },
    { value: false, name: 'false' },
    { value: 0, name: 'zero' },
    { value: [], name: 'empty array' }
  ])('keeps a validated remote $name instead of the template default', ({ value }) => {
    expect(
      resolveInitialInputValue({
        input: createInput({ value: 'template' }),
        meta: { defaultPolicy: 'remoteValidated', resourceKind: 'model' },
        validatedRemoteDefault: { provided: true, value }
      })
    ).toEqual(value);
  });

  it.each([
    { value: '', name: 'empty string' },
    { value: false, name: 'false' },
    { value: 0, name: 'zero' }
  ])('keeps a safe template $name', ({ value }) => {
    expect(resolveInitialInputValue({ input: createInput({ value }) })).toEqual(value);
  });

  it('never accepts template or remote defaults for user-required secrets', () => {
    expect(
      resolveInitialInputValue({
        input: createInput({ value: 'template-secret' }),
        meta: { defaultPolicy: 'userRequired', resourceKind: 'secret' },
        validatedRemoteDefault: { provided: true, value: 'remote-secret' }
      })
    ).toBeUndefined();
  });

  it('maps unverified resources and array inputs to type-safe empty values', () => {
    expect(
      resolveInitialInputValue({
        input: createInput({
          value: [{ datasetId: 'template-dataset' }],
          valueType: WorkflowIOValueTypeEnum.selectDataset
        }),
        meta: { defaultPolicy: 'remoteValidated', resourceKind: 'dataset' }
      })
    ).toEqual([]);
    expect(
      resolveInitialInputValue({
        input: createInput({ value: 'template-model' }),
        meta: { defaultPolicy: 'remoteValidated', resourceKind: 'model' }
      })
    ).toBeUndefined();
    expect(getResourceSafeEmptyValue({ valueType: WorkflowIOValueTypeEnum.arrayString })).toEqual(
      []
    );
  });
});

describe('hasConfiguredValue', () => {
  it('treats template empty values as available for deterministic Start references', () => {
    expect(hasConfiguredValue(undefined)).toBe(false);
    expect(hasConfiguredValue(null)).toBe(false);
    expect(hasConfiguredValue('')).toBe(false);
    expect(hasConfiguredValue([])).toBe(false);
    expect(hasConfiguredValue(false)).toBe(true);
    expect(hasConfiguredValue(0)).toBe(true);
  });
});
