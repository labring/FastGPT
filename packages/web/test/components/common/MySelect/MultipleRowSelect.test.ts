// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MultipleRowArraySelect,
  MultipleRowSelect
} from '../../../../components/common/MySelect/MultipleRowSelect';
import ReferenceRemoveButton from '../../../../../../projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/ReferenceRemoveButton';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const inChakra = (element: React.ReactElement) =>
  React.createElement(ChakraProvider, null, element);
const renderSelect = (element: React.ReactElement) => act(async () => root.render(element));

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

HTMLElement.prototype.scrollTo ??= () => {};

describe('MultipleRowSelect', () => {
  it('opens with ArrowDown and focuses the first option on the same trigger', async () => {
    await renderSelect(
      inChakra(
        React.createElement(MultipleRowSelect, {
          placeholder: 'Choose an option',
          list: [{ label: 'First option', value: 'first' }],
          onSelect: () => undefined
        })
      )
    );
    const trigger = host.querySelector('button')!;
    await act(async () => {
      trigger.focus();
      trigger.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
      );
    });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('button')).toBe(trigger);
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('First option'));
  });

  it('keeps the menu in the canvas scaling layer and selects an option', async () => {
    const onSelect = vi.fn();
    await renderSelect(
      inChakra(
        React.createElement(
          'div',
          { className: 'react-flow' },
          React.createElement(
            'div',
            { className: 'react-flow__viewport', style: { transform: 'scale(3)' } },
            React.createElement(MultipleRowSelect, {
              list: [{ label: 'First option', value: 'first' }],
              onSelect
            })
          )
        )
      )
    );
    const trigger = host.querySelector('button');
    await act(async () => trigger?.click());

    const option = host.querySelector<HTMLButtonElement>('.react-flow__viewport [role="menuitem"]');
    expect(option).not.toBeNull();
    await act(async () => option?.click());

    expect(onSelect).toHaveBeenCalledWith(['first']);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });

  it('mounts the loading overlay only after opening', async () => {
    await renderSelect(
      inChakra(
        React.createElement(MultipleRowSelect, {
          list: [],
          value: [],
          isLoading: true,
          emptyTip: '模型请求中',
          onSelect: () => {}
        })
      )
    );

    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.textContent).not.toContain('模型请求中');

    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const spinner = host.querySelector('[role="status"] .chakra-spinner');
    expect(spinner).not.toBeNull();
    expect(host.querySelector('[role="status"][data-preserve-width="true"]')).not.toBeNull();
  });

  it.each([null, undefined])('renders with an empty selection (%s)', (value) => {
    expect(() =>
      renderToStaticMarkup(
        inChakra(
          React.createElement(MultipleRowSelect, {
            list: [{ label: 'Item 1', value: 'item1' }],
            value: value as React.ComponentProps<typeof MultipleRowSelect>['value'],
            onSelect: () => {}
          })
        )
      )
    ).not.toThrow();
  });

  it('updates an open menu when list props change', async () => {
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
      inChakra(
        React.createElement(MultipleRowSelect, {
          list,
          value: ['groupA', 'old'],
          onSelect: () => {}
        })
      );

    await renderSelect(render(firstList));
    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.textContent).toContain('Old item');

    await renderSelect(render(nextList));
    await act(async () => undefined);

    expect(host.textContent).toContain('New item');
    expect(host.textContent).not.toContain('Old item');
  });

  it('restores the full selected path when list and value finish loading after opening', async () => {
    const groupedList = [
      {
        label: 'Group A',
        value: 'groupA',
        children: [{ label: 'Async item', value: 'async-item' }]
      }
    ];
    const render = (list: typeof groupedList, value: string[]) =>
      inChakra(
        React.createElement(MultipleRowSelect, {
          list,
          value,
          onSelect: () => {}
        })
      );

    await renderSelect(render([], []));
    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.textContent).not.toContain('Async item');

    await renderSelect(render(groupedList, ['groupA', 'async-item']));
    await act(async () => undefined);

    expect(host.textContent).toContain('Group A');
    expect(host.textContent).toContain('Async item');
  });

  it('enters the first source column when opened without a selection', async () => {
    const onSelect = vi.fn();

    await renderSelect(
      inChakra(
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
  });

  it('preserves the selected path while navigating and submits a child selection', async () => {
    const onSelect = vi.fn();

    await renderSelect(
      inChakra(
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
              children: [
                { label: 'Output B', value: 'output-b' },
                { label: 'Output C', value: 'output-c' }
              ]
            }
          ],
          value: ['source-a', 'output-a'],
          onSelect
        })
      )
    );
    await act(async () => host.querySelector<HTMLButtonElement>('button')?.click());
    const clickItem = async (label: string) => {
      const item = Array.from(host.querySelectorAll('*')).find(
        (element) => element.textContent === label
      );
      if (!item) throw new Error(`Missing ${label}`);
      await act(async () => item.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    };

    await clickItem('Source A');
    expect(host.textContent).toContain('Output A');
    await clickItem('Source B');
    expect(host.textContent).toContain('Output B');
    expect(onSelect).not.toHaveBeenCalled();
    await clickItem('Output B');
    expect(onSelect).toHaveBeenCalledWith(['source-b', 'output-b']);
  });

  it('scrolls a newly loaded child column to its selected option after opening', async () => {
    const selectedOptions = Array.from({ length: 20 }, (_, index) => ({
      label: React.createElement('span', { 'data-scroll-offset': index * 40 }, `Output ${index}`),
      value: `output-${index}`
    }));
    const list = Array.from({ length: 20 }, (_, index) => ({
      label: `Source ${index}`,
      value: `source-${index}`
    })) as { label: string; value: string; children?: typeof selectedOptions }[];
    const value = ['source-18', 'output-18'];

    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return Number(
        this.querySelector<HTMLElement>(':scope > [data-scroll-offset]')?.dataset.scrollOffset ?? 0
      );
    });

    const render = (placeholder = 'Choose source') =>
      inChakra(
        React.createElement(MultipleRowSelect, {
          label: placeholder,
          list,
          value,
          onSelect: () => {}
        })
      );

    await renderSelect(render());
    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.querySelectorAll('.nowheel')).toHaveLength(1);

    // The async loader fills the already supplied list in place while the menu remains open.
    list[18].children = selectedOptions;
    await renderSelect(render('Loaded source'));

    const columns = host.querySelectorAll<HTMLElement>('.nowheel');
    expect(columns).toHaveLength(2);
    expect(
      Array.from(columns[1].querySelectorAll('*')).some((item) => item.textContent === 'Output 18')
    ).toBe(true);
    expect(columns[1].scrollTop).toBe(620);
  });

  it('scrolls a newly selected source into view while the menu stays open', async () => {
    const list = Array.from({ length: 20 }, (_, index) => ({
      label: React.createElement('span', { 'data-scroll-offset': index * 40 }, `Source ${index}`),
      value: `source-${index}`,
      children: [{ label: `Output ${index}`, value: `output-${index}` }]
    }));

    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return Number(
        this.querySelector<HTMLElement>(':scope > [data-scroll-offset]')?.dataset.scrollOffset ?? 0
      );
    });

    await renderSelect(
      inChakra(
        React.createElement(MultipleRowSelect, {
          list,
          value: ['source-0'],
          onSelect: () => {}
        })
      )
    );
    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const source = Array.from(host.querySelectorAll('*')).find(
      (item) => item.textContent === 'Source 18'
    );
    if (!source) throw new Error('Missing source 18');
    await act(async () => {
      source.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const columns = host.querySelectorAll<HTMLElement>('.nowheel');
    expect(columns).toHaveLength(2);
    expect(columns[0].scrollTop).toBe(620);
    expect(host.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('preserves manual scroll when the parent recreates the list', async () => {
    const createList = () =>
      Array.from({ length: 20 }, (_, index) => ({
        label: React.createElement('span', { 'data-scroll-offset': index * 40 }, `Source ${index}`),
        value: `source-${index}`,
        children: [{ label: `Output ${index}`, value: `output-${index}` }]
      }));

    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return Number(
        this.querySelector<HTMLElement>(':scope > [data-scroll-offset]')?.dataset.scrollOffset ?? 0
      );
    });

    const render = () =>
      inChakra(
        React.createElement(MultipleRowSelect, {
          list: createList(),
          value: ['source-18', 'output-18'],
          onSelect: () => {}
        })
      );

    await renderSelect(render());
    await act(async () => host.querySelector('button')?.click());
    const menu = host.querySelectorAll<HTMLElement>('.nowheel')[0];
    expect(menu.scrollTop).toBe(620);

    menu.scrollTop = 123;
    await renderSelect(render());

    expect(menu.scrollTop).toBe(123);
  });

  it('renders the array menu outside overflow-clipped containers', async () => {
    host.style.overflow = 'hidden';

    await renderSelect(
      inChakra(
        React.createElement(MultipleRowArraySelect, {
          list: [
            {
              label: 'Source A',
              value: 'source-a',
              children: [{ label: 'Output A', value: 'output-a' }]
            }
          ],
          value: [],
          popDirection: 'top',
          onSelect: () => {}
        })
      )
    );
    await act(async () => {
      host.querySelector('button')?.click();
    });

    const menu = document.body.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect((menu?.parentElement as HTMLElement).style.position).toBe('fixed');
    expect(menu?.parentElement?.getAttribute('data-popper-placement')).toContain('top');
  });

  it('preserves a historical reference when adding another option', async () => {
    const onSelect = vi.fn();
    const missing = ['missing-source', 'previous-output'];
    await renderSelect(
      inChakra(
        React.createElement(MultipleRowArraySelect, {
          value: [missing],
          list: [
            {
              label: 'Source',
              value: 'source',
              children: [{ label: 'Output', value: 'output' }]
            }
          ],
          onSelect
        })
      )
    );
    await act(async () => host.querySelector('button')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click());
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!.click()
    );
    expect(onSelect).toHaveBeenCalledWith([missing, ['source', 'output']]);
  });

  it('removes a label item without toggling the open array menu', async () => {
    const onSelect = vi.fn();
    const selectedValues = [
      ['source-a', 'output-a'],
      ['source-b', 'output-b']
    ];
    const label = React.createElement('div', null, 'Source A Output A Source B Output B');
    const labelActions = React.createElement(
      'div',
      null,
      React.createElement(ReferenceRemoveButton, {
        label: 'Delete Source A Output A',
        onRemove: () => onSelect(selectedValues.filter((_, index) => index !== 0))
      }),
      React.createElement(ReferenceRemoveButton, {
        label: 'Delete Source B Output B',
        onRemove: () => onSelect(selectedValues.filter((_, index) => index !== 1))
      })
    );

    await renderSelect(
      inChakra(
        React.createElement(MultipleRowArraySelect, {
          label,
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
          value: selectedValues,
          labelActions,
          onSelect: () => {}
        })
      )
    );
    const trigger = host.querySelector('button');
    expect(trigger).not.toBeNull();
    await act(async () => trigger!.click());
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');

    const remove = host.querySelector<HTMLElement>('[aria-label="Delete Source A Output A"]');
    expect(remove).not.toBeNull();
    expect(trigger?.contains(remove)).toBe(false);
    expect(remove?.getAttribute('role')).toBe('button');
    expect(remove?.tabIndex).toBe(0);
    await act(async () => {
      remove!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      remove!.click();
    });

    expect(onSelect).toHaveBeenCalledWith([['source-b', 'output-b']]);
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[role="menu"]')).not.toBeNull();
    const removeSecond = host.querySelector<HTMLElement>('[aria-label="Delete Source B Output B"]');
    await act(async () => {
      removeSecond?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onSelect).toHaveBeenLastCalledWith([['source-a', 'output-a']]);
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    await act(async () => trigger?.click());
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });

  it.each(['isDisabled', 'disabled'] as const)(
    'forwards %s button props to the menu trigger and hides label actions',
    async (disabledProp) => {
      await renderSelect(
        inChakra(
          React.createElement(MultipleRowArraySelect, {
            list: [],
            value: [],
            ButtonProps: {
              [disabledProp]: true,
              'aria-label': 'Select references',
              style: { marginTop: '4px' }
            },
            labelActions: React.createElement(ReferenceRemoveButton, {
              label: 'Delete Source A Output A',
              onRemove: vi.fn()
            }),
            onSelect: () => {}
          })
        )
      );

      const trigger = host.querySelector<HTMLButtonElement>('button');
      expect(trigger?.disabled).toBe(true);
      expect(trigger?.getAttribute('aria-label')).toBe('Select references');
      expect(trigger?.style.marginTop).toBe('4px');
      expect(host.querySelector('[aria-label="Delete Source A Output A"]')).toBeNull();
      await act(async () => trigger?.click());
      expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    }
  );

  it('supports keyboard navigation and selection in the array menu', async () => {
    const onSelect = vi.fn();
    const list = [
      {
        label: 'Source A',
        value: 'source-a',
        children: [{ label: 'Output A', value: 'output-a' }]
      }
    ];

    await renderSelect(
      inChakra(
        React.createElement(MultipleRowArraySelect, {
          list,
          value: [],
          onSelect
        })
      )
    );
    const trigger = host.querySelector('button');
    await act(async () => trigger?.click());

    const source = Array.from(host.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent === 'Source A'
    );
    source?.focus();
    expect(document.activeElement).toBe(source);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => {
      source?.dispatchEvent(enter);
    });
    expect(enter.defaultPrevented).toBe(true);

    const output = Array.from(host.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')).find(
      (item) => item.textContent === 'Output A'
    );
    output?.focus();
    expect(document.activeElement).toBe(output);
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    await act(async () => output?.dispatchEvent(space));

    expect(space.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith([['source-a', 'output-a']]);
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
  });

  it('moves focus through array menu items with ArrowDown and ArrowUp', async () => {
    await renderSelect(
      inChakra(
        React.createElement(MultipleRowArraySelect, {
          list: [
            { label: 'Source A', value: 'source-a', children: [{ label: 'A1', value: 'a1' }] },
            { label: 'Source B', value: 'source-b', children: [{ label: 'B1', value: 'b1' }] }
          ],
          value: [],
          onSelect: () => {}
        })
      )
    );

    const trigger = host.querySelector<HTMLButtonElement>('button');
    await act(async () => trigger?.click());

    // 等待 Chakra 完成打开时的焦点调度，再验证菜单项之间的键盘导航。
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
    });

    const [first, second] = Array.from(host.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(first?.textContent).toBe('Source A');
    expect(second?.textContent).toBe('Source B');

    await act(async () => first?.focus());
    expect(document.activeElement).toBe(first);

    await act(async () => {
      first?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement).toBe(second);

    await act(async () => {
      second?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    expect(document.activeElement).toBe(first);
  });
});
