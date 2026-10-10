// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, describe, expect, it } from 'vitest';
import MySelect from '../../../../components/common/MySelect';

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

describe('MySelect closed render', () => {
  it('does not render menu items before opening', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(MySelect, {
          list: [{ label: 'Deferred option', value: 'deferred' }],
          placeholder: 'Choose an option',
          onChange: () => undefined
        })
      )
    );

    expect(html).toContain('Choose an option');
    expect(html).not.toContain('Deferred option');
    expect(html).not.toContain('chakra-menu__menu-list');
  });

  it('mounts the menu items when opened', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MySelect, {
            list: [{ label: 'Deferred option', value: 'deferred' }],
            placeholder: 'Choose an option',
            onChange: () => undefined
          })
        )
      );
    });

    expect(host.textContent).not.toContain('Deferred option');

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
});
