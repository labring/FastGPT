import React, { act, useState } from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { JSDOM } from 'jsdom';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SecretValueInput from '@/components/common/secret/SecretValueInput';
import AdminSecretInput from '@/pageComponents/admin/settings/AdminSecretInput';

vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));

describe('SecretValueInput', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  const onChange = vi.fn();
  const onSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
    // React 在 JSDOM 初始化前加载，会启用旧浏览器输入补丁；补齐接口以保留真实聚焦行为。
    Object.assign(dom.window.HTMLElement.prototype, {
      attachEvent: vi.fn(),
      detachEvent: vi.fn()
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
    vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
    vi.stubGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

  const render = async ({
    isConfigured = false,
    isDisabled = false,
    isRequired = false,
    value = '',
    multiline = false
  } = {}) => {
    const Harness = () => {
      const [current, setCurrent] = useState({ value, isConfigured });
      return React.createElement(
        'form',
        { onSubmit },
        React.createElement(SecretValueInput, {
          ...current,
          isDisabled,
          isRequired,
          multiline,
          onChange: (value) => {
            onChange(value);
            setCurrent({ value, isConfigured: false });
          }
        })
      );
    };
    await act(async () =>
      root.render(React.createElement(ChakraProvider, null, React.createElement(Harness)))
    );
  };
  const click = async (label: string) => {
    const button = container.querySelector<HTMLButtonElement>(`[aria-label="common:${label}"]`);
    expect(button).not.toBeNull();
    await act(async () => button!.click());
    if (label === 'Edit') {
      expect(document.activeElement).toBe(container.querySelector('input'));
    }
  };
  const type = async (value: string) => {
    const input = container.querySelector('input')!;
    await act(async () => Simulate.change(input, { target: { value } } as any));
  };

  it.each(['', 'initial plaintext'])(
    'keeps first-time plaintext visible after blur: %j',
    async (value) => {
      await render({ value });
      expect(container.querySelector('input')?.type).toBe('text');
      expect(container.querySelector('input')?.value).toBe(value);
      await type('first value');
      await act(async () => Simulate.blur(container.querySelector('input')!));
      expect(container.querySelector('input')?.value).toBe('first value');
      expect(container.querySelector('button')).toBeNull();
      expect(onChange).toHaveBeenLastCalledWith('first value');
    }
  );

  it('isolates drafts, cancels without changes, and clears every replacement editor', async () => {
    // 即使调用方仍持有旧明文，替换编辑器也不能回填它。
    await render({ value: 'previous plaintext', isConfigured: true });
    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).toContain('common:had_auth_value');
    await click('Edit');
    expect(container.querySelector('input')?.value).toBe('');
    expect(container.querySelector('input')?.type).toBe('text');
    await type('cancelled draft');
    await act(async () => Simulate.blur(container.querySelector('input')!));
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector('input')?.value).toBe('cancelled draft');
    await click('Close');
    expect(container.querySelector('input')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    await click('Edit');
    expect(container.querySelector('input')?.value).toBe('');
    await type('confirmed replacement');
    await click('Save');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('confirmed replacement');
    expect(container.querySelector('input')).toBeNull();
    await click('Edit');
    expect(container.querySelector('input')?.value).toBe('');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('only clears an existing key after confirming an empty replacement', async () => {
    await render({ isConfigured: true });
    await click('Edit');
    expect(onChange).not.toHaveBeenCalled();
    await click('Save');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('');
    expect(container.querySelector('input')?.value).toBe('');
    expect(container.querySelector('button')).toBeNull();
  });

  it('disables confirming an empty or whitespace-only draft when required', async () => {
    await render({ isConfigured: true, isRequired: true });
    await click('Edit');
    const saveButton = container.querySelector<HTMLButtonElement>('[aria-label="common:Save"]');
    expect(saveButton?.disabled).toBe(true);
    await click('Save');
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector('input')).not.toBeNull();

    await type('   ');
    expect(saveButton?.disabled).toBe(true);
    await click('Save');
    expect(onChange).not.toHaveBeenCalled();

    await type('new-token');
    expect(saveButton?.disabled).toBe(false);
    await click('Save');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('new-token');
    expect(container.querySelector('input')).toBeNull();

    await click('Edit');
    await click('Close');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(container.querySelector('input')).toBeNull();
  });

  it('preserves line breaks while replacing a configured multiline secret', async () => {
    await render({ isConfigured: true, multiline: true });
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="common:Edit"]')!.click()
    );
    const textarea = container.querySelector('textarea');
    expect(textarea?.value).toBe('');
    await act(async () =>
      Simulate.change(textarea!, { target: { value: 'first line\nsecond line' } } as any)
    );
    await click('Save');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('first line\nsecond line');
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('treats an untouched configured admin secret differently from an explicit clear', async () => {
    const Harness = () => {
      const [value, setValue] = useState<string>();
      return React.createElement(AdminSecretInput, {
        value,
        isConfigured: true,
        onChange: (next) => {
          onChange(next);
          setValue(next);
        }
      });
    };
    await act(async () =>
      root.render(React.createElement(ChakraProvider, null, React.createElement(Harness)))
    );
    expect(container.textContent).toContain('common:had_auth_value');
    await click('Edit');
    await type('cancelled');
    await click('Close');
    expect(onChange).not.toHaveBeenCalled();
    await click('Edit');
    await type('replacement');
    await click('Save');
    expect(onChange).toHaveBeenLastCalledWith('replacement');
    expect(container.textContent).toContain('common:had_auth_value');
    await click('Edit');
    await click('Save');
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(container.querySelector('input')?.value).toBe('');
    expect(container.textContent).not.toContain('common:had_auth_value');
  });

  it.each([false, true])(
    'keeps disabled inputs and configured values read-only: %j',
    async (isConfigured) => {
      await render({ isConfigured, isDisabled: true });
      expect(container.querySelector('button')).toBeNull();
      expect(
        isConfigured
          ? container.querySelector('input') === null
          : container.querySelector('input')?.disabled
      ).toBe(true);
    }
  );
});
