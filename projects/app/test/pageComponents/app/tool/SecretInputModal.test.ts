import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  filterReferenceListByInputType,
  formatManualInputValue,
  normalizeInputValue,
  SecretInputForm,
  type SecretReferenceList,
  type ToolParamsFormType
} from '@/pageComponents/app/tool/SecretInputModal';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  getNodeInputValueSchema,
  valueMatchesSchema
} from '@fastgpt/workflow-core/template/valueSchema';
import { createWorkflowDocument } from '@fastgpt/workflow-core/domain/document';
import { validateNodeIO } from '@fastgpt/workflow-core/validation/io';
import type { WorkflowDiagnostic } from '@fastgpt/workflow-core/domain/diagnostic';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));
vi.mock('@chakra-ui/react', async () => {
  const { createElement, forwardRef } = await import('react');
  const box = ({ as = 'div', children, id, onSubmit, onClick }: any) =>
    createElement(as, { id, onSubmit, onClick }, children);
  return {
    Box: box,
    Flex: box,
    HStack: box,
    Button: ({ children, onClick }: any) =>
      createElement('button', { type: 'button', onClick }, children),
    Input: forwardRef<HTMLInputElement, any>(
      ({ name, onChange, onBlur, value, placeholder }, ref) =>
        createElement('input', { name, onChange, onBlur, value, placeholder, ref })
    ),
    useDisclosure: () => ({ isOpen: false, onToggle: vi.fn() })
  };
});
vi.mock('@fastgpt/web/components/common/Radio/LeftRadio', () => ({
  default: ({ list, onChange }: any) =>
    React.createElement(
      React.Fragment,
      null,
      ...list.map((item: any) =>
        React.createElement(
          'div',
          { key: item.value },
          React.createElement(
            'button',
            { type: 'button', 'data-mode': item.value, onClick: () => onChange(item.value) },
            item.title
          ),
          item.children
        )
      )
    )
}));
vi.mock('@fastgpt/web/components/core/workflow/NodeInputSelect', async () => {
  const React = await import('react');
  const { FlowNodeInputTypeEnum } = await import('@fastgpt/global/core/workflow/node/constant');
  return {
    default: ({ onChange, selectedType }: any) =>
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'switch-mode',
          onClick: () =>
            onChange(
              selectedType === FlowNodeInputTypeEnum.reference
                ? FlowNodeInputTypeEnum.password
                : FlowNodeInputTypeEnum.reference
            )
        },
        'Reference'
      )
  };
});

vi.mock('@fastgpt/web/hooks/useRequest', () => ({ useRequest: () => ({ data: [] }) }));
vi.mock('@/web/core/app/api/tool', () => ({ getAppToolTemplates: vi.fn() }));
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@/pageComponents/account/team/OrgManage/IconButton', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({ default: () => null }));
vi.mock('@/components/core/app/formRender', () => ({ default: () => null }));
vi.mock('@/components/common/Modal/UseGuideModal', () => ({ default: () => null }));

const input: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.systemInputConfig,
  label: 'Authorization',
  renderTypeList: [FlowNodeInputTypeEnum.hidden],
  inputList: [{ key: 'apiKey', label: 'API key', inputType: 'secret' }]
};

describe('SecretInputForm authorization output', () => {
  let dom: JSDOM;
  let root: ReturnType<typeof createRoot>;
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    dom = new JSDOM('<div id="root"></div>');
    for (const name of ['window', 'document', 'HTMLElement', 'FileList', 'Blob'] as const)
      vi.stubGlobal(name, name === 'window' ? dom.window : dom.window[name]);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createRoot(dom.window.document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });
  const render = async (value?: ToolParamsFormType, hasSystemSecret = true) => {
    await act(async () =>
      root.render(
        React.createElement(SecretInputForm, {
          inputConfig: { ...input, value },
          hasSystemSecret,
          onChange,
          onSubmit,
          formId: 'authorization'
        })
      )
    );
  };
  const submit = async () => {
    await act(async () =>
      dom.window.document
        .querySelector('form')!
        .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
    );
    const value = onSubmit.mock.lastCall![0];
    expect(valueMatchesSchema(value, getNodeInputValueSchema({ input })!)).toBe(true);
    const node: StoreNodeItemType = {
      nodeId: 'authorized-tool',
      name: 'Tool',
      flowNodeType: FlowNodeTypeEnum.tool,
      inputs: [{ ...input, value }],
      outputs: []
    };
    const document = createWorkflowDocument({ nodes: [node], edges: [] });
    const diagnostics: WorkflowDiagnostic[] = [];
    validateNodeIO({ document, node, diagnostics });
    expect(diagnostics).toEqual([]);
    return value;
  };

  it.each([
    undefined,
    { type: SystemToolSecretInputTypeEnum.system, value: { apiKey: { secret: '', value: '' } } },
    {
      type: SystemToolSecretInputTypeEnum.system,
      value: { apiKey: { secret: 'stale-ciphertext', value: 'stale-text' } }
    }
  ])('emits only type for default or legacy platform authorization: %j', async (value) => {
    await render(value);
    expect(onChange).toHaveBeenLastCalledWith({ type: 'system' });
    expect(await submit()).toEqual({ type: 'system' });
  });

  it('normalizes legacy manual credentials and removes value when switching to platform authorization', async () => {
    const value: ToolParamsFormType = {
      type: SystemToolSecretInputTypeEnum.manual,
      value: { apiKey: { secret: 'existing-ciphertext', value: '' } }
    };
    await render(value);
    const expected = { type: 'manual', value: { apiKey: { secret: 'existing-ciphertext' } } };
    expect(onChange).toHaveBeenLastCalledWith(expected);
    expect(await submit()).toEqual(expected);
    await act(async () =>
      (dom.window.document.querySelector('[data-mode="system"]') as HTMLButtonElement).click()
    );
    expect(onChange).toHaveBeenLastCalledWith({ type: 'system' });
    expect(await submit()).toEqual({ type: 'system' });
  });

  it('keeps default manual input wrappers when no platform credential exists', async () => {
    await render(undefined, false);
    const expected = { type: 'manual', value: { apiKey: { value: '' } } };
    expect(onChange).toHaveBeenLastCalledWith(expected);
    expect(await submit()).toEqual(expected);
  });
});

const referenceList: SecretReferenceList = [
  {
    label: 'Node',
    value: 'node',
    children: [
      { label: 'Text', value: 'text', valueType: WorkflowIOValueTypeEnum.string },
      { label: 'Number', value: 'number', valueType: WorkflowIOValueTypeEnum.number },
      { label: 'Boolean', value: 'boolean', valueType: WorkflowIOValueTypeEnum.boolean },
      { label: 'Unknown', value: 'unknown' }
    ]
  }
];

describe('normalizeInputValue', () => {
  it('initializes unsupported or missing values as an editable empty wrapper', () => {
    expect(normalizeInputValue(undefined)).toEqual({ value: '' });
    expect(normalizeInputValue({ business: true })).toEqual({ value: '' });
  });
});

describe('formatManualInputValue', () => {
  it('preserves falsy scalar values and clears missing changes', () => {
    expect(formatManualInputValue(0)).toBe('0');
    expect(formatManualInputValue(false)).toBe('false');
    expect(formatManualInputValue(undefined)).toBe('');
    expect(formatManualInputValue(null)).toBe('');
  });
});

describe('filterReferenceListByInputType', () => {
  it('filters reference outputs to the existing input type contract', () => {
    expect(
      filterReferenceListByInputType(referenceList, 'input')[0].children.map((item) => item.value)
    ).toEqual(['text', 'unknown']);
    expect(
      filterReferenceListByInputType(referenceList, 'numberInput')[0].children.map(
        (item) => item.value
      )
    ).toEqual(['number', 'unknown']);
    expect(
      filterReferenceListByInputType(referenceList, 'switch')[0].children.map((item) => item.value)
    ).toEqual(['boolean', 'unknown']);
  });
});

describe('SecretInputForm', () => {
  it('submits a required secret after switching from an empty manual value to a reference', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://fastgpt.test',
      pretendToBeVisual: true
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('localStorage', dom.window.localStorage);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('Document', dom.window.Document);
    vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
    vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
    vi.stubGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
    // 只验证凭据校验；避免 JSDOM 聚焦触发 React 的旧浏览器输入补丁。
    const focus = vi.spyOn(dom.window.HTMLElement.prototype, 'focus').mockImplementation(() => {});
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onSubmit = vi.fn();

    try {
      await act(async () => {
        root.render(
          createElement(SecretInputForm, {
            referenceList,
            renderReference: ({ onSelect }) =>
              createElement(
                'button',
                {
                  type: 'button',
                  'data-testid': 'select-reference',
                  onClick: () => onSelect(['node', 'token'])
                },
                'Select reference'
              ),
            inputConfig: {
              key: 'system_input_config',
              label: 'Config',
              renderTypeList: [],
              inputList: [
                { key: 'token', label: 'Token', inputType: 'secret', required: true },
                { key: 'count', label: 'Count', inputType: 'numberInput', required: true },
                { key: 'enabled', label: 'Enabled', inputType: 'switch', required: true }
              ],
              value: { type: 'manual', value: { count: { value: 0 }, enabled: { value: false } } }
            },
            formId: 'secret-form',
            onSubmit
          })
        );
      });

      const modeButton = container.querySelector('[data-testid="switch-mode"]');
      expect(modeButton).not.toBeNull();
      await act(async () => {
        modeButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });

      const referenceButton = container.querySelector('[data-testid="select-reference"]');
      expect(referenceButton).not.toBeNull();
      await act(async () => {
        referenceButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });

      const form = container.querySelector('form');
      expect(form).not.toBeNull();
      await act(async () => {
        form?.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
        value: {
          token: { ref: ['node', 'token'] },
          count: { value: '0' },
          enabled: { value: 'false' }
        }
      });

      // 回到手动模式必须清除 ref，并恢复空必填密码的校验。
      await act(async () => {
        container
          .querySelector('[data-testid="switch-mode"]')
          ?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });
      expect(container.querySelector<HTMLInputElement>('input[placeholder="Token"]')?.value).toBe(
        ''
      );
      await act(async () => {
        form?.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      });
      expect(onSubmit).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      dom.window.close();
      focus.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
