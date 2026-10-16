import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import InputTypeConfig from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputTypeConfig';

const mocks = vi.hoisted(() => ({
  useReference: vi.fn(),
  referSelector: vi.fn()
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));
vi.mock('@/web/common/file/hooks/useFileUploadLimits', () => ({
  useFileUploadLimits: () => ({ maxUploadFileCount: 10 })
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/Reference',
  () => ({ useReference: mocks.useReference, ReferSelector: mocks.referSelector })
);
vi.mock('@/components/common/Textarea/MyTextarea', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Textarea/JsonEditor', () => ({ default: () => null }));
vi.mock('@/components/core/app/DatasetSelectModal', () => ({ DatasetSelectModal: () => null }));
vi.mock('@/components/Select/AIModelSelector', () => ({ default: () => null }));

type ConfigProps = React.ComponentProps<typeof InputTypeConfig>;

/** 渲染共享配置组件时不提供工作流上下文，覆盖简易应用和 ChatAgent 的使用边界。 */
const renderConfig = ({
  type,
  inputType,
  listInputType = FlowNodeInputTypeEnum.custom
}: Pick<ConfigProps, 'type' | 'inputType'> & { listInputType?: FlowNodeInputTypeEnum }) => {
  const Form = () => {
    const form = useForm({
      defaultValues: {
        label: 'City',
        list: [{ label: 'Beijing', value: 'Beijing' }],
        listInputType,
        listReference: [['upstream', 'cities']]
      }
    });

    return React.createElement(InputTypeConfig, {
      nodeId: type === 'formInput' ? 'form' : undefined,
      form,
      type,
      inputType,
      isEdit: false,
      onClose: vi.fn(),
      onSubmitSuccess: vi.fn(),
      onSubmitError: vi.fn()
    });
  };

  return renderToStaticMarkup(React.createElement(ChakraProvider, null, React.createElement(Form)));
};

describe('InputTypeConfig reference context isolation', () => {
  beforeEach(() => {
    mocks.useReference.mockReset();
    mocks.useReference.mockImplementation(() => {
      throw new Error('Workflow reference context is unavailable');
    });
    mocks.referSelector.mockReset();
    mocks.referSelector.mockReturnValue(null);
  });

  it('renders a variable without accessing the workflow reference context', () => {
    expect(() =>
      renderConfig({ type: 'variable', inputType: VariableInputEnum.input })
    ).not.toThrow();
    expect(mocks.useReference).not.toHaveBeenCalled();
  });

  it('resolves references for a dynamic option field', () => {
    const referenceList = [{ value: 'upstream', label: 'Source', children: [] }];
    mocks.useReference.mockReturnValue({ referenceList });

    renderConfig({
      type: 'formInput',
      inputType: FlowNodeInputTypeEnum.select,
      listInputType: FlowNodeInputTypeEnum.reference
    });

    expect(mocks.useReference).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'form' }));
    expect(mocks.referSelector.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        isArray: true,
        list: referenceList,
        value: [['upstream', 'cities']]
      })
    );
  });
});
