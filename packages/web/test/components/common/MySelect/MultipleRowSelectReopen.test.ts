// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MultipleRowSelect } from '../../../../components/common/MySelect/MultipleRowSelect';

vi.mock('../../../../components/common/MySelect/useMenuListPresence', () => ({
  useMenuListPresence: () => ({
    isMounted: true,
    mount: vi.fn(),
    onAnimationComplete: vi.fn()
  })
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;
HTMLElement.prototype.scrollTo ??= () => {};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('MultipleRowSelect exit animation', () => {
  it('can reopen immediately while the closed menu remains mounted', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MultipleRowSelect, {
            list: [
              {
                label: 'Group A',
                value: 'group-a',
                children: [{ label: 'Item A', value: 'item-a' }]
              }
            ],
            value: [],
            onSelect: () => {}
          })
        )
      );
    });

    const trigger = host.querySelector<HTMLButtonElement>('button');
    await act(async () => trigger?.click());
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');

    await act(async () => trigger?.click());

    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(trigger && getComputedStyle(trigger).pointerEvents).not.toBe('none');

    await act(async () => trigger?.click());
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    root.unmount();
  });
});
