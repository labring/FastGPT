// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MultipleRowSelect } from '../../../../components/common/MySelect/MultipleRowSelect';

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

HTMLElement.prototype.scrollTo ??= () => {};

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

  it('handles null or non-array value gracefully without throwing TypeError', () => {
    expect(() => {
      renderToStaticMarkup(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MultipleRowSelect, {
            list: [
              {
                label: 'Group A',
                value: 'groupA',
                children: [{ label: 'Item 1', value: 'item1' }]
              }
            ],
            value: null as any,
            onSelect: () => {}
          })
        )
      );
    }).not.toThrow();
  });

  it('handles undefined value gracefully', () => {
    expect(() => {
      renderToStaticMarkup(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MultipleRowSelect, {
            list: [{ label: 'Item 1', value: 'item1' }],
            value: undefined,
            onSelect: () => {}
          })
        )
      );
    }).not.toThrow();
  });

  it('updates an open menu when list props change', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const firstList = [
      {
        label: 'Group A',
        value: 'groupA',
        children: [{ label: 'Old item', value: 'old' }]
      }
    ];
    const nextList = [
      {
        label: 'Group A',
        value: 'groupA',
        children: [{ label: 'New item', value: 'new' }]
      }
    ];
    const render = (list: typeof firstList) =>
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(MultipleRowSelect, {
          list,
          value: ['groupA', 'old'],
          onSelect: () => {}
        })
      );

    await act(async () => {
      root.render(render(firstList));
    });
    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.textContent).toContain('Old item');

    await act(async () => {
      root.render(render(nextList));
    });
    await act(async () => undefined);

    expect(host.textContent).toContain('New item');
    expect(host.textContent).not.toContain('Old item');
    root.unmount();
  });

  it('enters the first source column when opened without a selection', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onSelect = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MultipleRowSelect, {
            list: [
              {
                label: 'Source A',
                value: 'source-a',
                children: [{ label: 'Output A', value: 'output-a' }]
              },
              {
                label: 'Source B',
                value: 'source-b',
                children: [{ label: 'Output B', value: 'output-b' }]
              }
            ],
            value: [],
            onSelect
          })
        )
      );
    });
    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const sourceA = Array.from(host.querySelectorAll('*')).find(
      (element) => element.textContent === 'Source A'
    );
    if (!sourceA) throw new Error('Missing first source');
    await act(async () => {
      sourceA.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(host.textContent).toContain('Output A');
    expect(onSelect).not.toHaveBeenCalled();
    root.unmount();
  });

  it('keeps the selected source when reopening an existing reference', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onSelect = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MultipleRowSelect, {
            list: [
              {
                label: 'Source A',
                value: 'source-a',
                children: [{ label: 'Output A', value: 'output-a' }]
              },
              {
                label: 'Source B',
                value: 'source-b',
                children: [{ label: 'Output B', value: 'output-b' }]
              }
            ],
            value: ['source-a', 'output-a'],
            onSelect
          })
        )
      );
    });
    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const sourceB = Array.from(host.querySelectorAll('*')).find(
      (element) => element.textContent === 'Source B'
    );
    if (!sourceB) throw new Error('Missing source B');
    await act(async () => {
      sourceB.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(host.textContent).toContain('Output B');
    expect(onSelect).not.toHaveBeenCalled();
    root.unmount();
  });

  it('submits a child selection without the opt-in every-select flag', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onSelect = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MultipleRowSelect, {
            list: [
              {
                label: 'Source A',
                value: 'source-a',
                children: [
                  { label: 'Output A', value: 'output-a' },
                  { label: 'Output B', value: 'output-b' }
                ]
              }
            ],
            value: ['source-a', 'output-a'],
            onSelect
          })
        )
      );
    });
    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const outputB = Array.from(host.querySelectorAll('*')).find(
      (element) => element.textContent === 'Output B'
    );
    if (!outputB) throw new Error('Missing output B');
    await act(async () => {
      outputB.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith(['source-a', 'output-b']);
    root.unmount();
  });

  it('reopens the current source column without clearing its selection', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onSelect = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MultipleRowSelect, {
            list: [
              {
                label: 'Source A',
                value: 'source-a',
                children: [{ label: 'Output A', value: 'output-a' }]
              }
            ],
            value: ['source-a', 'output-a'],
            onSelect
          })
        )
      );
    });
    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const sourceA = Array.from(host.querySelectorAll('*')).find(
      (element) => element.textContent === 'Source A'
    );
    if (!sourceA) throw new Error('Missing source A');
    await act(async () => {
      sourceA.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(host.textContent).toContain('Output A');
    expect(onSelect).not.toHaveBeenCalled();
    root.unmount();
  });
});
