// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MultipleRowArraySelect,
  MultipleRowSelect
} from '../../../../components/common/MySelect/MultipleRowSelect';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

describe('MultipleRowSelect', () => {
  it('mounts the loading overlay only after opening', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MultipleRowSelect, {
            list: [],
            value: [],
            isLoading: true,
            emptyTip: '模型请求中',
            onSelect: () => {}
          })
        )
      );
    });

    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.textContent).not.toContain('模型请求中');

    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const spinner = host.querySelector('[role="status"] .chakra-spinner');
    expect(spinner).not.toBeNull();
    expect(host.querySelector('[role="status"][data-preserve-width="true"]')).not.toBeNull();
    root.unmount();
  });

  it('does not render menu items until opening and removes them after closing', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MultipleRowSelect, {
            list: [{ label: 'Deferred option', value: 'deferred', children: [] }],
            value: [],
            onSelect: () => {}
          })
        )
      );
    });

    expect(host.textContent).not.toContain('Deferred option');
    expect(host.querySelector('.chakra-menu__menu-list')).toBeNull();

    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(host.textContent).toContain('Deferred option');
    expect(host.querySelector('.chakra-menu__menu-list')).not.toBeNull();

    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(host.textContent).not.toContain('Deferred option');
    expect(host.querySelector('.chakra-menu__menu-list')).toBeNull();
    root.unmount();
  });

  it('keeps the closed server render free of menu and loading content', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(MultipleRowSelect, {
          list: [],
          value: [],
          isLoading: true,
          emptyTip: '模型请求中',
          onSelect: () => {}
        })
      )
    );

    expect(html).not.toContain('chakra-spinner');
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('模型请求中');
  });

  it('mounts the array menu only after opening and closes on outside click', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MultipleRowArraySelect, {
            list: [
              {
                label: 'Source',
                value: 'source',
                children: [{ label: 'Output', value: 'output' }]
              }
            ],
            value: [],
            placeholder: 'Choose a reference',
            onSelect: () => {}
          })
        )
      );
    });

    expect(host.textContent).toContain('Choose a reference');
    expect(host.textContent).not.toContain('Source');

    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(host.textContent).toContain('Source');

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(host.textContent).not.toContain('Source');
    root.unmount();
  });
});
