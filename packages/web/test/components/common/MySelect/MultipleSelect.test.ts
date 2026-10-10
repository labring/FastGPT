// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
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

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
  ResizeObserver?: typeof ResizeObserverMock;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;
reactGlobals.ResizeObserver = ResizeObserverMock;

afterEach(() => {
  document.body.replaceChildren();
});

const props = {
  list: [{ label: 'Deferred option', value: 'deferred' }],
  value: [],
  onSelect: () => {}
};

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
  it('mounts the menu only after opening and removes it after closing', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(ChakraProvider, null, React.createElement(MultipleSelect, props))
      );
    });

    expect(host.textContent).not.toContain('Deferred option');
    expect(host.querySelector('.chakra-menu__menu-list')).toBeNull();

    await act(async () => {
      host
        .querySelector('[role="button"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(host.textContent).toContain('Deferred option');
    expect(host.querySelector('.chakra-menu__menu-list')).not.toBeNull();

    await act(async () => {
      host
        .querySelector('[aria-expanded="true"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(host.textContent).not.toContain('Deferred option');
    expect(host.querySelector('.chakra-menu__menu-list')).toBeNull();
    root.unmount();
  });

  it('keeps the closed server render free of menu content', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChakraProvider, null, React.createElement(MultipleSelect, props))
    );

    expect(html).not.toContain('Deferred option');
    expect(html).not.toContain('chakra-menu__menu-list');
  });
});
