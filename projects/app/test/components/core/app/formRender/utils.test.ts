import { describe, expect, it } from 'vitest';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  variableInputTypeToInputType,
  valueTypeToInputType,
  nodeInputTypeToInputType,
  secretInputTypeToInputType
} from '@/components/core/app/formRender/utils';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';

describe('variableInputTypeToInputType', () => {
  it('input + string → input', () => {
    expect(
      variableInputTypeToInputType(VariableInputEnum.input, WorkflowIOValueTypeEnum.string)
    ).toBe(InputTypeEnum.input);
  });

  it('input + object → JSONEditor', () => {
    expect(
      variableInputTypeToInputType(VariableInputEnum.input, WorkflowIOValueTypeEnum.object)
    ).toBe(InputTypeEnum.JSONEditor);
  });

  it('input + arrayString → JSONEditor', () => {
    expect(
      variableInputTypeToInputType(VariableInputEnum.input, WorkflowIOValueTypeEnum.arrayString)
    ).toBe(InputTypeEnum.JSONEditor);
  });

  it('input + any → textarea（与 chat 侧保持）', () => {
    expect(variableInputTypeToInputType(VariableInputEnum.input, WorkflowIOValueTypeEnum.any)).toBe(
      InputTypeEnum.textarea
    );
  });

  it('input + undefined（legacy）→ input', () => {
    expect(variableInputTypeToInputType(VariableInputEnum.input)).toBe(InputTypeEnum.input);
  });

  it('numberInput/switch 等固定映射不受 valueType 影响', () => {
    expect(
      variableInputTypeToInputType(VariableInputEnum.numberInput, WorkflowIOValueTypeEnum.string)
    ).toBe(InputTypeEnum.numberInput);
    expect(variableInputTypeToInputType(VariableInputEnum.switch)).toBe(InputTypeEnum.switch);
  });

  it('custom/internal 根据 valueType 决定', () => {
    expect(
      variableInputTypeToInputType(VariableInputEnum.custom, WorkflowIOValueTypeEnum.object)
    ).toBe(InputTypeEnum.JSONEditor);
    expect(
      variableInputTypeToInputType(VariableInputEnum.internal, WorkflowIOValueTypeEnum.number)
    ).toBe(InputTypeEnum.numberInput);
  });
});

describe('valueTypeToInputType', () => {
  it('string/number/boolean → input/numberInput/switch', () => {
    expect(valueTypeToInputType(WorkflowIOValueTypeEnum.string)).toBe(InputTypeEnum.input);
    expect(valueTypeToInputType(WorkflowIOValueTypeEnum.number)).toBe(InputTypeEnum.numberInput);
    expect(valueTypeToInputType(WorkflowIOValueTypeEnum.boolean)).toBe(InputTypeEnum.switch);
  });

  it('object/array* → JSONEditor', () => {
    expect(valueTypeToInputType(WorkflowIOValueTypeEnum.object)).toBe(InputTypeEnum.JSONEditor);
    expect(valueTypeToInputType(WorkflowIOValueTypeEnum.arrayString)).toBe(
      InputTypeEnum.JSONEditor
    );
    expect(valueTypeToInputType(WorkflowIOValueTypeEnum.arrayObject)).toBe(
      InputTypeEnum.JSONEditor
    );
  });

  it('any/undefined → textarea', () => {
    expect(valueTypeToInputType(WorkflowIOValueTypeEnum.any)).toBe(InputTypeEnum.textarea);
    expect(valueTypeToInputType(undefined)).toBe(InputTypeEnum.textarea);
  });

  it('chatHistory/datasetQuote/dynamic/selectDataset/selectApp → JSONEditor', () => {
    expect(valueTypeToInputType(WorkflowIOValueTypeEnum.chatHistory)).toBe(
      InputTypeEnum.JSONEditor
    );
    expect(valueTypeToInputType(WorkflowIOValueTypeEnum.datasetQuote)).toBe(
      InputTypeEnum.JSONEditor
    );
    expect(valueTypeToInputType(WorkflowIOValueTypeEnum.dynamic)).toBe(InputTypeEnum.JSONEditor);
    expect(valueTypeToInputType(WorkflowIOValueTypeEnum.selectDataset)).toBe(
      InputTypeEnum.JSONEditor
    );
    expect(valueTypeToInputType(WorkflowIOValueTypeEnum.selectApp)).toBe(InputTypeEnum.JSONEditor);
    expect(valueTypeToInputType(WorkflowIOValueTypeEnum.arrayAny)).toBe(InputTypeEnum.JSONEditor);
    expect(valueTypeToInputType(WorkflowIOValueTypeEnum.arrayNumber)).toBe(
      InputTypeEnum.JSONEditor
    );
    expect(valueTypeToInputType(WorkflowIOValueTypeEnum.arrayBoolean)).toBe(
      InputTypeEnum.JSONEditor
    );
  });
});

describe('nodeInputTypeToInputType', () => {
  it('跳过 reference，取到真正的控件类型', () => {
    expect(
      nodeInputTypeToInputType([FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input])
    ).toBe(InputTypeEnum.input);
  });

  it.each([
    [FlowNodeInputTypeEnum.input, InputTypeEnum.input],
    [FlowNodeInputTypeEnum.textarea, InputTypeEnum.textarea],
    [FlowNodeInputTypeEnum.password, InputTypeEnum.password],
    [FlowNodeInputTypeEnum.numberInput, InputTypeEnum.numberInput],
    [FlowNodeInputTypeEnum.switch, InputTypeEnum.switch],
    [FlowNodeInputTypeEnum.select, InputTypeEnum.select],
    [FlowNodeInputTypeEnum.multipleSelect, InputTypeEnum.multipleSelect],
    [FlowNodeInputTypeEnum.JSONEditor, InputTypeEnum.JSONEditor],
    [FlowNodeInputTypeEnum.selectLLMModel, InputTypeEnum.selectLLMModel],
    [FlowNodeInputTypeEnum.fileSelect, InputTypeEnum.fileSelect],
    [FlowNodeInputTypeEnum.timePointSelect, InputTypeEnum.timePointSelect],
    [FlowNodeInputTypeEnum.timeRangeSelect, InputTypeEnum.timeRangeSelect]
  ])('%s → %s', (input, expected) => {
    expect(nodeInputTypeToInputType([input])).toBe(expected);
  });

  it('空数组或未识别类型 → textarea', () => {
    expect(nodeInputTypeToInputType([])).toBe(InputTypeEnum.textarea);
    expect(nodeInputTypeToInputType()).toBe(InputTypeEnum.textarea);
    expect(nodeInputTypeToInputType([FlowNodeInputTypeEnum.reference])).toBe(
      InputTypeEnum.textarea
    );
  });
});

describe('secretInputTypeToInputType', () => {
  it.each([
    ['input', InputTypeEnum.input],
    ['numberInput', InputTypeEnum.numberInput],
    ['switch', InputTypeEnum.switch],
    ['select', InputTypeEnum.select]
  ] as const)('%s → %s', (input, expected) => {
    expect(secretInputTypeToInputType(input)).toBe(expected);
  });

  it('未识别 → textarea', () => {
    expect(secretInputTypeToInputType('unknown' as any)).toBe(InputTypeEnum.textarea);
  });
});
