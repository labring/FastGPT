import { describe, expect, it } from 'vitest';
import {
  applyToolSetInputValues,
  buildToolSetManualInput,
  getToolSetInputValuesFromInputs,
  pickToolSetChildValues
} from '@fastgpt/global/core/app/tool/toolSet/utils';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

const createInput = (key: string): FlowNodeInputItemType => ({
  key,
  label: key,
  renderTypeList: [
    FlowNodeInputTypeEnum.agentGenerated,
    FlowNodeInputTypeEnum.input,
    FlowNodeInputTypeEnum.reference
  ],
  selectedType: FlowNodeInputTypeEnum.agentGenerated,
  valueType: WorkflowIOValueTypeEnum.string,
  required: true
});

describe('toolset input values', () => {
  it('only picks the matching child tool values', () => {
    const values = {
      'getOrders.userId': 'u-1',
      'getOrders.note': '{{$VARIABLE_NODE_ID.note$}}',
      'getUser.id': 'u-2'
    };

    expect(pickToolSetChildValues({ toolName: 'getOrders', values })).toEqual({
      userId: 'u-1',
      note: '{{$VARIABLE_NODE_ID.note$}}'
    });
    expect(pickToolSetChildValues({ toolName: 'missing', values })).toEqual({});
  });

  it('applies manual values with the child input manual control', () => {
    const inputs = [createInput('userId'), createInput('page')];
    const result = applyToolSetInputValues({
      inputs,
      values: { userId: '{{$VARIABLE_NODE_ID.userId$}}' }
    });

    expect(result[0]).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.input,
      value: '{{$VARIABLE_NODE_ID.userId$}}'
    });
    expect(result[1]).toBe(inputs[1]);
  });

  it('applies global variable references in reference mode', () => {
    const [result] = applyToolSetInputValues({
      inputs: [createInput('userId')],
      values: { userId: [VARIABLE_NODE_ID, 'userId'] }
    });

    expect(result).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.reference,
      value: [VARIABLE_NODE_ID, 'userId']
    });
  });

  it('round-trips stored inputs', () => {
    const manual = buildToolSetManualInput({ key: 'getOrders.userId', value: 'u-1' });
    const reference = buildToolSetManualInput({
      key: 'getOrders.note',
      value: [VARIABLE_NODE_ID, 'note']
    });

    expect(
      getToolSetInputValuesFromInputs({
        inputs: [manual, reference],
        toolNames: ['getOrders']
      })
    ).toEqual({
      'getOrders.userId': 'u-1',
      'getOrders.note': [VARIABLE_NODE_ID, 'note']
    });
    expect(reference.selectedType).toBe(FlowNodeInputTypeEnum.reference);
  });
});
