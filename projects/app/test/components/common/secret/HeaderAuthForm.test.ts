import { JSDOM } from 'jsdom';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Simulate } from 'react-dom/test-utils';
import type { HeaderSecretConfigType } from '@/components/common/secret/HeaderAuthConfig';
import {
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

describe('HeaderAuthForm', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://fastgpt.test',
      pretendToBeVisual: true
    });
    // React 在创建 JSDOM 之前已加载，补齐其旧输入事件补丁以验证真实聚焦。
    Object.assign(dom.window.HTMLElement.prototype, {
      attachEvent: vi.fn(),
      detachEvent: vi.fn()
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('localStorage', dom.window.localStorage);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  const render = async (initialValue: HeaderSecretConfigType) => {
    const Harness = () => {
      const [headerSecretValue, setHeaderSecretValue] = useState(initialValue);
      return createElement(HeaderAuthForm, {
        headerSecretValue,
        onChange: (value) => {
          onChange(value);
          setHeaderSecretValue(value);
        },
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
    await act(async () => root.render(createElement(Harness)));
  };

  const click = async (target: Element | null) => {
    expect(target).toBeTruthy();
    await act(async () => {
      target?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
  };
  const type = async (input: HTMLInputElement, value: string) => {
    await act(async () => Simulate.change(input, { target: { value } } as any));
  };
  const getRows = () =>
    Array.from(container.querySelectorAll<HTMLInputElement>('input[placeholder="key"]')).map(
      (input) => input.parentElement!.parentElement!
    );

  it('keeps remaining custom headers in their own mode after deleting a reference row', async () => {
    await render({
      customs: [
        { key: 'X-Reference', value: { value: 'replace-me' } },
        { key: 'X-Static', value: { secret: 'static-cipher' } }
      ]
    });
    const modeSelectors = container.querySelectorAll('.nodrag > div');
    expect(modeSelectors).toHaveLength(2);
    await click(modeSelectors[0]);
    await click(container.querySelector('[data-testid="select-reference"]'));
    await click(container.querySelector('button[aria-label="Remove header"]'));

    expect(container.querySelector('[data-testid="select-reference"]')).toBeNull();
    expect(container.textContent).toContain('common:had_auth_value');
  });

  it('preserves both replacement drafts and confirmed hidden values while renaming a header', async () => {
    await render({ customs: [{ key: 'X-Key', value: { secret: 'cipher' } }] });
    await click(container.querySelector('[aria-label="common:Edit"]'));
    const input = container.querySelector<HTMLInputElement>('input[placeholder="Value"]')!;
    await type(input, 'replacement');
    const name = container.querySelector<HTMLInputElement>('input[placeholder="key"]')!;
    await act(async () => Simulate.blur(input));
    await type(name, 'X-Renamed');

    expect(container.querySelector('input[placeholder="Value"]')).toBe(input);
    expect(input.value).toBe('replacement');
    expect(onChange).toHaveBeenLastCalledWith({
      customs: [{ key: 'X-Renamed', value: { secret: 'cipher' } }]
    });
    await click(container.querySelector('[aria-label="common:Save"]'));
    await type(name, 'X-Confirmed');
    expect(container.querySelector('input[placeholder="Value"]')).toBeNull();
    expect(container.textContent).toContain('common:had_auth_value');
    expect(onChange).toHaveBeenLastCalledWith({
      customs: [{ key: 'X-Confirmed', value: { value: 'replacement' } }]
    });
    await click(container.querySelector('[aria-label="common:Edit"]'));
    expect(container.querySelector<HTMLInputElement>('input[placeholder="Value"]')?.value).toBe('');
  });

  it('keeps draft and confirmation state on the surviving row when removing and adding headers', async () => {
    await render({
      customs: ['X-Removed', 'X-Keep', 'X-Untouched'].map((key) => ({
        key,
        value: { secret: key }
      }))
    });
    await click(getRows()[0].querySelector('[aria-label="common:Edit"]'));
    await type(getRows()[0].querySelector('input[placeholder="Value"]')!, 'discarded draft');
    await click(getRows()[1].querySelector('[aria-label="common:Edit"]'));
    const keptInput = getRows()[1].querySelector<HTMLInputElement>('input[placeholder="Value"]')!;
    await type(keptInput, 'kept draft');
    await click(getRows()[0].querySelector('[aria-label="Remove header"]'));

    expect(getRows()[0].querySelector('input[placeholder="Value"]')).toBe(keptInput);
    expect(keptInput.value).toBe('kept draft');
    expect(getRows()[1].querySelector('input[placeholder="Value"]')).toBeNull();
    await click(getRows()[0].querySelector('[aria-label="common:Save"]'));
    await click(getRows()[0].querySelector('[aria-label="Remove header"]'));
    expect(getRows()[0].querySelector('input[placeholder="Value"]')).toBeNull();
    await click(
      Array.from(container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('common:add_new')
      ) ?? null
    );
    expect(getRows()[0].querySelector('input[placeholder="Value"]')).toBeNull();
    expect(getRows()[1].querySelector<HTMLInputElement>('input[placeholder="Value"]')?.value).toBe(
      ''
    );
    expect(onChange).toHaveBeenLastCalledWith({
      customs: [
        { key: 'X-Untouched', value: { secret: 'X-Untouched' } },
        { key: '', value: { value: '' } }
      ]
    });
  });
});
