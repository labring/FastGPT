import { describe, expect, it, vi } from 'vitest';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';

vi.mock('@chakra-ui/react', () => ({
  Box: () => null,
  Button: () => null,
  Flex: () => null,
  FormControl: () => null,
  FormErrorMessage: () => null,
  ModalBody: () => null
}));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/core/workflow/NodeInputSelect', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Tag/index', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({ default: () => null }));
vi.mock('@/components/common/Modal/UseGuideModal', () => ({ default: () => null }));
vi.mock('@/components/core/app/formRender', () => ({ default: () => null }));
vi.mock('@/pageComponents/app/tool/SecretInputModal', () => ({ SecretInputForm: () => null }));
vi.mock('@/pageComponents/app/detail/Edit/FormComponent/ToolSelector/ToolSelectModal', () => ({
  childAppSystemKey: []
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/components/ToolSetList', () => ({
  getNodeToolSetList: vi.fn()
}));

import {
  parseConfigInputValue,
  resolveConfigInputSubmitValue,
  validateConfigInputValue
} from '@/pageComponents/app/detail/Edit/component/ConfigToolModal';

const createNumberInput = (
  overrides: Partial<FlowNodeTemplateType['inputs'][number]> = {}
): FlowNodeTemplateType['inputs'][number] => ({
  key: 'temperature',
  label: 'Temperature',
  valueType: WorkflowIOValueTypeEnum.number,
  renderTypeList: [FlowNodeInputTypeEnum.numberInput],
  customJsonSchema: {
    type: 'number',
    minimum: 0,
    maximum: 2
  },
  ...overrides
});

describe('ConfigToolModal numberInput normalization', () => {
  it('treats empty string on numberInput as undefined while preserving 0 and string inputs', () => {
    expect(
      parseConfigInputValue({
        inputType: FlowNodeInputTypeEnum.numberInput,
        value: ''
      })
    ).toEqual({ success: true, value: undefined });

    expect(
      parseConfigInputValue({
        inputType: FlowNodeInputTypeEnum.numberInput,
        value: 0
      })
    ).toEqual({ success: true, value: 0 });

    expect(
      parseConfigInputValue({
        inputType: FlowNodeInputTypeEnum.input,
        value: ''
      })
    ).toEqual({ success: true, value: '' });
  });

  it('passes validation when an optional numberInput is cleared to empty string', () => {
    expect(
      validateConfigInputValue({
        input: createNumberInput({ required: false }),
        inputType: FlowNodeInputTypeEnum.numberInput,
        value: '',
        jsonParseErrorText: 'Invalid JSON'
      })
    ).toBe(true);
  });

  it('rejects validation when a required numberInput is cleared to empty string', () => {
    expect(
      validateConfigInputValue({
        input: createNumberInput({ required: true }),
        inputType: FlowNodeInputTypeEnum.numberInput,
        value: '',
        jsonParseErrorText: 'Invalid JSON'
      })
    ).toBe(false);
  });

  it('still validates schema constraints for non-empty numberInput values', () => {
    expect(
      validateConfigInputValue({
        input: createNumberInput({ required: false }),
        inputType: FlowNodeInputTypeEnum.numberInput,
        value: 0,
        jsonParseErrorText: 'Invalid JSON'
      })
    ).toBe(true);

    expect(
      validateConfigInputValue({
        input: createNumberInput({ required: false }),
        inputType: FlowNodeInputTypeEnum.numberInput,
        value: 5,
        jsonParseErrorText: 'Invalid JSON'
      })
    ).toContain('<= 2');
  });

  it('normalizes cleared numberInput to undefined on submit while preserving 0 and text empty strings', () => {
    expect(
      resolveConfigInputSubmitValue({
        inputType: FlowNodeInputTypeEnum.numberInput,
        formValue: '',
        fallbackValue: 1
      })
    ).toBeUndefined();

    expect(
      resolveConfigInputSubmitValue({
        inputType: FlowNodeInputTypeEnum.numberInput,
        formValue: 0,
        fallbackValue: 1
      })
    ).toBe(0);

    expect(
      resolveConfigInputSubmitValue({
        inputType: FlowNodeInputTypeEnum.input,
        formValue: '',
        fallbackValue: undefined
      })
    ).toBe('');
  });
});
