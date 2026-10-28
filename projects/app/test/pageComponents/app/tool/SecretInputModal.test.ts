import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  filterReferenceListByInputType,
  formatReferenceValue,
  formatManualInputValue,
  getSecretInputModeType,
  getSecretInputValueForMode,
  isReferenceArrayValue,
  normalizeInputValue,
  shouldShowSecretInput,
  SecretInputForm,
  type SecretReferenceList
} from '@/pageComponents/app/tool/SecretInputModal';

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
    default: ({ onChange }: any) =>
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'switch-to-reference',
          onClick: () => onChange(FlowNodeInputTypeEnum.reference)
        },
        'Reference'
      )
  };
});

vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/Reference',
  async () => {
    const React = await import('react');
    return {
      ReferSelector: ({ onSelect }: any) =>
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'select-reference',
            onClick: () => onSelect(['node', 'token'])
          },
          'Select reference'
        )
    };
  }
);

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

describe('SecretInputModal helpers', () => {
  it('preserves structured tuple-array references during normalization', () => {
    const value = {
      ref: [
        ['node', 'output'],
        ['node-2', 'output-2']
      ]
    } as const;

    expect(normalizeInputValue(value)).toEqual(value);
    expect(isReferenceArrayValue(value)).toBe(true);
    expect(formatReferenceValue(value)).toBe('node / output, node-2 / output-2');
  });

  it('normalizes legacy dual-field values through the shared migration', () => {
    expect(normalizeInputValue({ value: 'plain', secret: 'cipher' })).toEqual({ value: 'plain' });
    expect(normalizeInputValue({ value: '', secret: 'cipher' })).toEqual({ secret: 'cipher' });
  });

  it('normalizes number and switch legacy scalars into string wrappers', () => {
    expect(normalizeInputValue(0, 'numberInput')).toEqual({ value: '0' });
    expect(normalizeInputValue({ value: false }, 'switch')).toEqual({ value: 'false' });
  });

  it('keeps false and zero when canonicalizing manual changes', () => {
    expect(formatManualInputValue(false)).toBe('false');
    expect(formatManualInputValue(0)).toBe('0');
  });

  it('does not treat malformed references as configured values', () => {
    expect(formatReferenceValue({ ref: ['node'] } as any)).toBe('');
    expect(isReferenceArrayValue({ ref: [] } as any)).toBe(false);
  });

  it('clears the incompatible branch when switching field mode', () => {
    expect(getSecretInputValueForMode('reference')).toBeUndefined();
    expect(getSecretInputValueForMode('manual')).toEqual({ value: '' });
  });

  it('maps each secret input type to its mode selector type', () => {
    expect(getSecretInputModeType('input')).toBe('input');
    expect(getSecretInputModeType('numberInput')).toBe('numberInput');
    expect(getSecretInputModeType('secret')).toBe('password');
    expect(getSecretInputModeType('switch')).toBe('switch');
    expect(getSecretInputModeType('select')).toBe('select');
  });

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

  it('keeps empty secret wrappers editable', () => {
    expect(shouldShowSecretInput({ value: { value: '' } })).toBe(true);
    expect(shouldShowSecretInput({ value: { secret: '' } })).toBe(true);
    expect(shouldShowSecretInput({ value: { secret: 'cipher' } })).toBe(false);
    expect(shouldShowSecretInput({ value: { value: 'plain' } })).toBe(false);
    expect(shouldShowSecretInput({ value: { value: 'plain' }, isEditing: true })).toBe(true);
  });

  it('submits a required secret after switching from an empty manual value to a reference', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://fastgpt.test'
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('localStorage', dom.window.localStorage);
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container);
    const onSubmit = vi.fn();

    try {
      await act(async () => {
        root.render(
          createElement(SecretInputForm, {
            nodeId: 'node',
            referenceList,
            inputConfig: {
              inputList: [{ key: 'token', label: 'Token', inputType: 'secret', required: true }]
            } as any,
            formId: 'secret-form',
            onSubmit
          })
        );
      });

      const modeButton = container.querySelector('[data-testid="switch-to-reference"]');
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
        value: { token: { ref: ['node', 'token'] } }
      });
    } finally {
      await act(async () => root.unmount());
      container.remove();
      dom.window.close();
      vi.unstubAllGlobals();
    }
  });
});
