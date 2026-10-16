import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import InputFormEditModal, {
  defaultFormInput
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeFormInput/InputFormEditModal';
import type InputTypeConfig from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputTypeConfig';
import type { UserInputFormItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';

const mocks = vi.hoisted(() => ({
  selector: vi.fn<(props: { onTypeChange: (type: string) => void }) => null>(() => null),
  config: vi.fn<(props: React.ComponentProps<typeof InputTypeConfig>) => null>(() => null)
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/InputTypeSelector', () => ({ default: mocks.selector }));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputTypeConfig',
  () => ({ default: mocks.config })
);

/** 通过真实表单状态验证类型切换，不依赖弹窗与配置区的展示实现。 */
const renderModal = () => {
  const value = {
    ...defaultFormInput,
    type: FlowNodeInputTypeEnum.select,
    key: 'city',
    label: 'City',
    description: 'Choose a city',
    required: true,
    defaultValue: 'Beijing',
    list: [{ label: 'Beijing', value: 'Beijing' }],
    listInputType: FlowNodeInputTypeEnum.reference,
    listReference: [['upstream', 'cities']]
  } satisfies UserInputFormItemType;
  renderToStaticMarkup(
    React.createElement(
      ChakraProvider,
      null,
      React.createElement(InputFormEditModal, {
        nodeId: 'form',
        defaultValue: value,
        onClose: vi.fn(),
        onSubmit: vi.fn(),
        keys: []
      })
    )
  );
  return {
    value,
    onTypeChange: mocks.selector.mock.calls[0][0].onTypeChange,
    form: mocks.config.mock.calls[0][0].form
  };
};

describe('InputFormEditModal type changes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves configuration on repeated clicks and clears only the default when changing type', async () => {
    const { value, onTypeChange, form } = renderModal();
    onTypeChange(FlowNodeInputTypeEnum.select);
    expect(form.getValues()).toEqual(value);

    onTypeChange(FlowNodeInputTypeEnum.multipleSelect);
    // SSR 不执行挂载 effect，通过公开提交接口读取真正写入的表单值。
    const onSubmit = vi.fn();
    await form.handleSubmit(onSubmit)();
    expect(onSubmit).toHaveBeenCalledWith(
      { ...value, type: FlowNodeInputTypeEnum.multipleSelect, defaultValue: [] },
      undefined
    );
  });
});
