// @vitest-environment jsdom
import React, { act } from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FilterSearchInput from '../../../../components/common/TagFilter/FilterSearchInput';

vi.mock('../../../../components/common/Icon/button', () => ({
  default: ({ onClick }: { onClick?: () => void }) =>
    React.createElement('button', { type: 'button', 'data-testid': 'clear', onClick })
}));

describe('FilterSearchInput IME composition', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('does not trigger onChange while composing pinyin and triggers once on compositionend', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(FilterSearchInput, {
            value: '',
            placeholder: 'Search',
            onChange
          })
        )
      );
    });

    const input = container.querySelector('input[placeholder="Search"]') as HTMLInputElement;
    const setNativeValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )!.set!;

    await act(async () => {
      input.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true }));
      setNativeValue.call(input, 'zh');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    expect(input.value).toBe('zh');
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      setNativeValue.call(input, '张');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      input.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('张');
  });
});
