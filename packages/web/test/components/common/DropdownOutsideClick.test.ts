// @vitest-environment jsdom

import React, { act } from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DateTimePicker from '../../../components/common/DateTimePicker';
import { FixedTableContainer } from '../../../components/common/FixedTable';
import MyMenu from '../../../components/common/MyMenu';
import MySelect from '../../../components/common/MySelect';
import MultipleSelect from '../../../components/common/MySelect/MultipleSelect';
import {
  MultipleRowArraySelect,
  MultipleRowSelect
} from '../../../components/common/MySelect/MultipleRowSelect';

vi.mock('../../../hooks/useSystem', () => ({
  useSystem: () => ({ isPc: true, isMac: false })
}));

type DropdownKind =
  | 'MyMenu'
  | 'MySelect'
  | 'MultipleSelect'
  | 'MultipleRowSelect'
  | 'MultipleRowArraySelect'
  | 'DateTimePicker';

describe('workflow dropdown outside click', () => {
  let root: Root;
  let container: HTMLDivElement;
  let scrollToDescriptor: PropertyDescriptor | undefined;

  const render = async (kind: DropdownKind) => {
    const menu =
      kind === 'MyMenu'
        ? React.createElement(MyMenu, {
            trigger: 'click',
            Button: React.createElement('button', { type: 'button' }, 'Choose'),
            menuList: [{ children: [{ label: 'Option' }] }]
          })
        : kind === 'MySelect'
          ? React.createElement(MySelect, {
              value: 'current',
              list: [
                { label: 'Current', value: 'current' },
                { label: 'Other', value: 'other' }
              ],
              onChange: vi.fn()
            })
          : kind === 'MultipleRowSelect'
            ? React.createElement(MultipleRowSelect, {
                label: 'Choose',
                list: [],
                value: [],
                onSelect: vi.fn()
              })
            : kind === 'MultipleRowArraySelect'
              ? React.createElement(MultipleRowArraySelect, {
                  label: 'Choose',
                  list: [],
                  value: [],
                  onSelect: vi.fn()
                })
              : kind === 'MultipleSelect'
                ? React.createElement(MultipleSelect, {
                    placeholder: 'Choose',
                    list: [],
                    value: [],
                    onSelect: vi.fn(),
                    itemWrap: true
                  })
                : React.createElement(DateTimePicker, {
                    selectedDateTime: new Date(2024, 0, 1),
                    onChange: vi.fn(),
                    'data-testid': 'date-picker-trigger'
                  });

    let selected = false;
    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(
            'div',
            {
              className: 'react-flow__node',
              onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => {
                if ((event.target as HTMLElement).closest('.nodrag')) return;
                selected = true;

                // ReactFlow's drag listener captures mouseup on window before document listeners.
                window.addEventListener(
                  'mouseup',
                  (mouseEvent) => {
                    mouseEvent.preventDefault();
                    mouseEvent.stopImmediatePropagation();
                  },
                  { capture: true, once: true }
                );
                event.nativeEvent.stopImmediatePropagation();
              }
            },
            menu,
            React.createElement('div', { 'data-testid': 'drag-area' }, 'Draggable node area'),
            React.createElement(
              'div',
              { className: 'nodrag', 'data-testid': 'no-drag-area' },
              'Non-draggable node area'
            )
          )
        )
      );
    });

    const trigger =
      kind === 'DateTimePicker'
        ? container.querySelector<HTMLElement>('[data-testid="date-picker-trigger"]')
        : container.querySelector<HTMLElement>('[aria-haspopup="menu"]');
    if (!trigger) throw new Error(`Missing ${kind} trigger`);

    await act(async () => trigger.click());

    return {
      trigger,
      dragArea: container.querySelector<HTMLElement>('[data-testid="drag-area"]')!,
      noDragArea: container.querySelector<HTMLElement>('[data-testid="no-drag-area"]')!,
      isNodeSelected: () => selected
    };
  };

  const clickNodeArea = async (target: HTMLElement) => {
    await act(async () => {
      target.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
      target.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })
      );
      target.dispatchEvent(
        new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 })
      );
    });
  };

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      }
    );
    scrollToDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn()
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    if (scrollToDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'scrollTo', scrollToDescriptor);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    'MyMenu',
    'MySelect',
    'MultipleSelect',
    'MultipleRowSelect',
    'MultipleRowArraySelect'
  ] as const)('closes %s when clicking outside on a draggable node area', async (kind) => {
    const { trigger, dragArea } = await render(kind);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    await clickNodeArea(dragArea);

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it.each([
    'MyMenu',
    'MySelect',
    'MultipleSelect',
    'MultipleRowSelect',
    'MultipleRowArraySelect'
  ] as const)('closes %s when clicking outside on a non-draggable node area', async (kind) => {
    const { trigger, noDragArea } = await render(kind);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    await clickNodeArea(noDragArea);

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps MyMenu open for targets marked to ignore outside clicks', async () => {
    const { trigger, dragArea } = await render('MyMenu');
    dragArea.dataset.myMenuIgnoreOutsideClick = '';

    await clickNodeArea(dragArea);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes DateTimePicker and selects the node on a draggable outside click', async () => {
    const { dragArea, isNodeSelected } = await render('DateTimePicker');
    expect(isNodeSelected()).toBe(false);
    expect(document.querySelector('.rdp-root, .rdp')).not.toBeNull();

    await clickNodeArea(dragArea);

    expect(document.querySelector('.rdp-root, .rdp')).toBeNull();
    expect(isNodeSelected()).toBe(true);
  });

  it('does not keep a disabled open menu in the fixed table sizing header', async () => {
    const TableWithFilter = () => {
      const [isOpen, setIsOpen] = React.useState(false);
      const [selected, setSelected] = React.useState(false);

      return React.createElement(
        FixedTableContainer,
        null,
        React.createElement(
          'table',
          null,
          React.createElement(
            'thead',
            null,
            React.createElement(
              'tr',
              null,
              React.createElement(
                'th',
                null,
                React.createElement(
                  'button',
                  { type: 'button', 'aria-haspopup': 'menu', onClick: () => setIsOpen(!isOpen) },
                  'Filter'
                ),
                isOpen &&
                  React.createElement(
                    'div',
                    { 'data-popper-placement': 'bottom' },
                    React.createElement(
                      'div',
                      { role: 'menu' },
                      React.createElement(
                        'button',
                        { type: 'button', role: 'menuitem', onClick: () => setSelected(true) },
                        selected ? 'Selected' : 'Option'
                      )
                    )
                  )
              )
            )
          ),
          React.createElement(
            'tbody',
            null,
            React.createElement('tr', null, React.createElement('td', null, 'Row'))
          )
        )
      );
    };

    await act(async () => {
      root.render(React.createElement(ChakraProvider, null, React.createElement(TableWithFilter)));
    });
    const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
    expect(trigger).not.toBeNull();

    await act(async () => trigger!.click());
    const menuItem = container.querySelector<HTMLButtonElement>(
      '[data-fixed-table-header-content] > table [role="menuitem"]'
    );
    expect(menuItem).not.toBeNull();

    await act(async () => {
      menuItem!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      container.querySelectorAll('[data-fixed-table-sizing] [data-popper-placement]')
    ).toHaveLength(0);
    expect(container.querySelectorAll('[data-fixed-table-sizing] [role="menu"]')).toHaveLength(0);
  });
});
