// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MultipleSelect, {
  resolveMultipleSelectItems
} from '../../../../components/common/MySelect/MultipleSelect';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

class ResizeObserverMock implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;
reactGlobals.ResizeObserver = ResizeObserverMock;

afterEach(() => {
  document.body.replaceChildren();
});

describe('resolveMultipleSelectItems', () => {
  it('marks missing options as invalid without exposing their raw value', () => {
    expect(
      resolveMultipleSelectItems({
        values: ['available', 'removed'],
        list: [{ value: 'available', label: '可用选项' }],
        invalidLabel: '无效值'
      })
    ).toEqual([
      { value: 'available', label: '可用选项', isInvalid: false },
      { value: 'removed', label: '无效值', isInvalid: true }
    ]);
  });
});

describe('MultipleSelect', () => {
  it('keeps options lazy and opens a virtualized list with ArrowDown', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const readLabel = vi.fn((index: number) => `Option ${index}`);
    const list = Array.from({ length: 100 }, (_, index) => ({
      value: index,
      get label() {
        return readLabel(index);
      }
    }));
    try {
      await act(async () =>
        root.render(
          React.createElement(
            ChakraProvider,
            null,
            React.createElement(MultipleSelect, {
              list,
              value: [],
              onSelect: () => {},
              virtualScroll: true
            })
          )
        )
      );
      const trigger = host.querySelector<HTMLElement>('[role="button"]')!;
      expect(readLabel).not.toHaveBeenCalled();
      await act(async () => {
        trigger.focus();
        trigger.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
        );
      });
      expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(host.querySelector('[role="button"]')).toBe(trigger);
      expect(host.querySelector('[role="menuitem"]')?.textContent).toBe('Option 0');
      expect(readLabel).not.toHaveBeenCalledWith(99);
    } finally {
      await act(async () => root.unmount());
    }
  });
});
