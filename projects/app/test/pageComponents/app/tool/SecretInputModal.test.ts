import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  filterReferenceListByInputType,
  formatManualInputValue,
  normalizeInputValue,
  SecretInputForm,
  type SecretReferenceList
} from '@/pageComponents/app/tool/SecretInputModal';

vi.mock('@fastgpt/web/components/common/Icon', async () => {
  const React = await import('react');
  const MockIcon = React.forwardRef(() => null);
  MockIcon.displayName = 'MockIcon';
  return { default: MockIcon };
});

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));

vi.mock('@fastgpt/web/components/common/Radio/LeftRadio', async () => {
  const React = await import('react');
  const MockLeftRadio = React.forwardRef(({ list, value }: any, ref: any) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement('div', { ref }, list.find((item: any) => item.value === value)?.children)
    )
  );
  MockLeftRadio.displayName = 'MockLeftRadio';
  return { default: MockLeftRadio };
});

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
      vi.unstubAllGlobals();
    }
  });
});
