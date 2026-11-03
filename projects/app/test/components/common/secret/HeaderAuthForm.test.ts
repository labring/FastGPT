import { JSDOM } from 'jsdom';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { HeaderSecretConfigType } from '@/components/common/secret/HeaderAuthConfig';
import {
  getShowInput,
  getSingleReference,
  shouldRenderReferenceSelector
} from '@/components/common/secret/HeaderAuthForm';
import HeaderAuthForm from '@/components/common/secret/HeaderAuthForm';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('@fastgpt/web/components/common/Icon', async () => {
  const React = await import('react');
  const MockIcon = React.forwardRef(() => null);
  MockIcon.displayName = 'MockIcon';
  return { default: MockIcon };
});
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({ default: () => null }));

describe('getSingleReference', () => {
  it('returns only single references supported by the selector', () => {
    expect(getSingleReference({ ref: ['node', 'token'] })).toEqual(['node', 'token']);
    expect(getSingleReference({ ref: [['node', 'token']] })).toBeUndefined();
    expect(getSingleReference()).toBeUndefined();
  });
});

describe('shouldRenderReferenceSelector', () => {
  it('selects only reference mode and keeps legacy arrays read-only', () => {
    expect(shouldRenderReferenceSelector({ mode: 'reference' })).toBe(true);
    expect(shouldRenderReferenceSelector({ mode: 'manual' })).toBe(false);
    expect(
      shouldRenderReferenceSelector({
        mode: 'reference',
        secretValue: { ref: [['node', 'token']] }
      })
    ).toBe(false);
  });
});

describe('getShowInput', () => {
  it('shows empty or actively edited inputs', () => {
    expect(getShowInput({ secretValue: { value: '' }, index: 0 })).toBe(true);
    expect(getShowInput({ secretValue: { value: 'token' }, index: 0 })).toBe(false);
    expect(getShowInput({ secretValue: { secret: 'cipher' }, index: 0 })).toBe(false);
    expect(getShowInput({ secretValue: { value: 'token' }, editingIndex: 0, index: 0 })).toBe(true);
  });
});

describe('HeaderAuthForm', () => {
  it('keeps remaining custom headers in their own mode after deleting a reference row', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://fastgpt.test',
      pretendToBeVisual: true
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('localStorage', dom.window.localStorage);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const HeaderAuthFormHarness = () => {
      const [headerSecretValue, setHeaderSecretValue] = useState<HeaderSecretConfigType>({
        customs: [
          { key: 'X-Reference', value: { value: 'replace-me' } },
          { key: 'X-Static', value: { value: 'static-token' } }
        ]
      });

      return createElement(HeaderAuthForm, {
        headerSecretValue,
        onChange: setHeaderSecretValue,
        renderReference: ({ onChange }) =>
          createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'select-reference',
              onClick: () => onChange(['node', 'token'])
            },
            'Select reference'
          )
      });
    };

    const click = async (target: Element | null) => {
      expect(target).not.toBeNull();
      await act(async () => {
        target?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });
    };

    try {
      await act(async () => root.render(createElement(HeaderAuthFormHarness)));

      const modeSelectors = container.querySelectorAll('.nodrag > div');
      expect(modeSelectors).toHaveLength(2);
      await click(modeSelectors[0]);
      await click(container.querySelector('[data-testid="select-reference"]'));
      await click(container.querySelector('button[aria-label="Remove header"]'));

      expect(container.querySelector('[data-testid="select-reference"]')).toBeNull();
      expect(container.textContent).toContain('common:had_auth_value');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      dom.window.close();
      vi.unstubAllGlobals();
    }
  });
});
