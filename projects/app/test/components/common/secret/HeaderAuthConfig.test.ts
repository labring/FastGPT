import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import {
  headerValue2StoreHeader,
  storeHeader2HeaderValue,
  type HeaderSecretConfigType
} from '@/components/common/secret/HeaderAuthConfig';
import {
  formatReferenceValue,
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

const bearerRef = { ref: ['node', 'token'] } as const;
const basicRef = { ref: ['node', 'credentials'] } as const;
const customRef = { ref: ['node', 'headerValue'] } as const;
const tupleArrayRef = {
  ref: [
    ['node', 'header-a'],
    ['node', 'header-b']
  ]
} as const;

describe('HeaderAuth ref helpers', () => {
  it('round-trips raw Bearer and Basic references without adding a scheme', () => {
    const bearer: HeaderSecretConfigType = { Bearer: bearerRef };
    const basic: HeaderSecretConfigType = { Basic: basicRef };

    expect(headerValue2StoreHeader(bearer)).toEqual({ Bearer: bearerRef });
    expect(headerValue2StoreHeader(basic)).toEqual({ Basic: basicRef });
    expect(storeHeader2HeaderValue({ Bearer: bearerRef } as StoreSecretValueType)).toEqual(bearer);
    expect(storeHeader2HeaderValue({ Basic: basicRef } as StoreSecretValueType)).toEqual(basic);
  });

  it('round-trips custom header references while keeping the key separate', () => {
    const custom: HeaderSecretConfigType = {
      customs: [{ key: 'X-Token', value: customRef }]
    };

    expect(headerValue2StoreHeader(custom)).toEqual({ 'X-Token': customRef });
    expect(storeHeader2HeaderValue({ 'X-Token': customRef } as StoreSecretValueType)).toEqual(
      custom
    );
  });

  it('keeps tuple-array references read-only for the single-reference UI', () => {
    expect(getSingleReference(tupleArrayRef)).toBeUndefined();
    expect(formatReferenceValue(tupleArrayRef)).toBe('node / header-a, node / header-b');
  });

  it('renders the reference selector before a value has been selected', () => {
    expect(shouldRenderReferenceSelector({ mode: 'reference' })).toBe(true);
  });

  it('shows the input only for empty or actively edited values', () => {
    expect(getShowInput({ secretValue: { value: '' }, index: 0 })).toBe(true);
    expect(getShowInput({ secretValue: { value: 'token' }, index: 0 })).toBe(false);
    expect(getShowInput({ secretValue: { secret: 'encrypted' }, index: 0 })).toBe(false);
    expect(getShowInput({ secretValue: { value: 'token' }, editingIndex: 0, index: 0 })).toBe(true);
  });

  it('keeps remaining custom headers in their own mode after deleting a reference row', async () => {
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
