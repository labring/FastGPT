// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MySelect from '../../../../components/common/MySelect';

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;
HTMLElement.prototype.scrollTo ??= () => {};

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

  it.each([false, true])(
    'keeps click propagation separate from cancellation (%s)',
    async (cancel) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);
      const parentOnClick = vi.fn();
      try {
        await act(async () => {
          root.render(
            React.createElement(
              ChakraProvider,
              null,
              React.createElement(
                'div',
                { onClick: parentOnClick },
                React.createElement(MySelect, {
                  list: [{ label: 'Option', value: 'option' }],
                  onClick: (event) => {
                    event.stopPropagation();
                    if (cancel) event.preventDefault();
                  }
                })
              )
            )
          );
        });
        const trigger = host.querySelector('button')!;
        await act(async () => trigger.click());
        expect(trigger.getAttribute('aria-expanded')).toBe(String(!cancel));
        expect(parentOnClick).not.toHaveBeenCalled();
      } finally {
        await act(async () => root.unmount());
      }
    }
  );

  it.each([
    ['ArrowDown', 'Alpha'],
    ['ArrowUp', 'Beta']
  ])('opens with %s and restores focus to the same trigger', async (key, label) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const customOnOpen = vi.fn();
    const customOnClose = vi.fn();
    const addListener = vi.spyOn(window, 'addEventListener');
    const removeListener = vi.spyOn(window, 'removeEventListener');

    try {
      await act(async () => {
        root.render(
          React.createElement(
            ChakraProvider,
            null,
            React.createElement(MySelect, {
              list: [
                { label: 'Alpha', value: 'alpha' },
                { label: 'Beta', value: 'beta' }
              ],
              id: 'workflow-select-trigger',
              valueLabel: React.createElement('strong', null, 'Choose an option'),
              customOnOpen,
              customOnClose
            })
          )
        );
      });
      const trigger = host.querySelector('button')!;
      expect(trigger.id).toBe('workflow-select-trigger');
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
      expect(trigger.querySelector('strong')?.textContent).toBe('Choose an option');
      expect(host.querySelector('[role="menu"]')).toBeNull();
      expect(addListener).not.toHaveBeenCalledWith('scroll', expect.any(Function), {
        passive: true
      });

      await act(async () => {
        trigger.focus();
        trigger.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        );
      });
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(document.getElementById(trigger.getAttribute('aria-controls')!)).toBe(
        host.querySelector('[role="menu"]')
      );
      expect(customOnOpen).toHaveBeenCalledOnce();
      await vi.waitFor(() => expect(document.activeElement?.textContent).toBe(label));
      const popperScroll = addListener.mock.calls.filter(([name]) => name === 'scroll').at(-1);
      expect(popperScroll).toBeDefined();
      expect(removeListener).not.toHaveBeenCalledWith(...popperScroll!);

      await act(async () => {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        );
      });
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(customOnClose).toHaveBeenCalledOnce();
      await vi.waitFor(() => expect(host.querySelector('[role="menu"]')).toBeNull());
      expect(removeListener).toHaveBeenCalledWith(...popperScroll!);
      expect(host.querySelector('button')).toBe(trigger);
      expect(document.activeElement).toBe(trigger);
    } finally {
      await act(async () => root.unmount());
      addListener.mockRestore();
      removeListener.mockRestore();
    }
  });

  it('keeps search open on input click and clears it after reopening', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MySelect, {
            list: [{ label: 'Option', value: 'option' }],
            isSearch: true,
            onChange: () => undefined
          })
        )
      );
    });
    await act(async () => {
      host.querySelector('button')?.click();
    });
    const input = host.querySelector('input');
    expect(input).not.toBeNull();
    expect(input?.closest('button')).toBeNull();
    await act(async () => input?.click());
    expect(host.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setInputValue?.call(input, 'needle');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(input?.value).toBe('needle');

    await act(async () => {
      host.querySelector('button')?.click();
    });
    await act(async () => {
      host.querySelector('button')?.click();
    });

    expect(host.querySelector('input')?.value).toBe('');
    root.unmount();
  });

  it('keeps composition in the search input and searches only when it ends', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onSearchChange = vi.fn();
    try {
      await act(async () => {
        root.render(
          React.createElement(
            ChakraProvider,
            null,
            React.createElement(MySelect, {
              list: [{ label: 'Option', value: 'option' }],
              isSearch: true,
              onSearchChange
            })
          )
        );
      });
      const trigger = host.querySelector('button')!;
      await act(async () => trigger.click());
      const input = host.querySelector('input')!;
      expect(document.activeElement).toBe(input);
      await act(async () => {
        Simulate.compositionStart(input);
        input.value = 'zhong';
        Simulate.change(input);
      });
      expect(input.value).toBe('zhong');
      expect(onSearchChange).not.toHaveBeenCalled();

      for (const key of ['ArrowDown', 'Escape']) {
        const event = new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
          isComposing: true
        });
        await act(async () => input.dispatchEvent(event));
        expect(event.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(input);
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
      }
      await act(async () => {
        input.value = '中';
        Simulate.compositionEnd(input);
      });
      expect(onSearchChange).toHaveBeenCalledExactlyOnceWith('中');
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('shows search input even when the selected value has a custom label', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MySelect, {
            list: [{ label: 'Option', value: 'option' }],
            value: 'option',
            valueLabel: React.createElement('strong', null, 'Custom value'),
            isSearch: true,
            onChange: () => undefined
          })
        )
      );
    });
    await act(async () => {
      host.querySelector('button')?.click();
    });

    expect(host.querySelector('input')).not.toBeNull();
    root.unmount();
  });

  it('keeps numeric zero searchable', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MySelect, {
            list: [
              { label: 'Zero option', value: 0 },
              { label: 'Other option', value: 1 }
            ],
            isSearch: true,
            onChange: () => undefined
          })
        )
      );
    });
    await act(async () => {
      host.querySelector('button')?.click();
    });

    const input = host.querySelector('input');
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setInputValue?.call(input, '0');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(host.textContent).toContain('Zero option');
    expect(host.textContent).not.toContain('Other option');
    root.unmount();
  });

  it.each(['click', 'Enter', 'ArrowDown'])(
    'starts in the search field after opening with %s',
    async (openWith) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);
      const onChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(
            ChakraProvider,
            null,
            React.createElement(MySelect, {
              list: [
                { label: 'Alpha', value: 'alpha' },
                { label: 'Beta', value: 'beta' }
              ],
              isSearch: true,
              onChange
            })
          )
        );
      });
      const trigger = host.querySelector('button')!;
      try {
        await act(async () => {
          trigger.focus();
          if (openWith === 'click') {
            trigger.click();
          } else {
            trigger.dispatchEvent(
              new KeyboardEvent('keydown', { key: openWith, bubbles: true, cancelable: true })
            );
          }
        });
        // Chakra may schedule a second focus after the menu is painted.
        await act(async () => {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          });
        });

        const input = host.querySelector('input')!;
        expect(document.activeElement).toBe(input);
        const setInputValue = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        )!.set!;
        await act(async () => {
          setInputValue.call(input, 'Al');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const options = host.querySelectorAll('[role="menuitem"]');
        expect([...options].map((option) => option.textContent)).toEqual(['Alpha']);

        await act(async () => {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        });
        expect(document.activeElement).toBe(options[0]);

        await act(async () => {
          options[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(onChange).not.toHaveBeenCalled();
      } finally {
        await act(async () => root.unmount());
      }
    }
  );

  it('closes only after Tab settles outside, preserving focus through Chakra frames', async () => {
    vi.useRealTimers();
    const host = document.createElement('div');
    const outsideButton = document.createElement('button');
    outsideButton.textContent = 'outside';
    document.body.append(host, outsideButton);
    const root = createRoot(host);
    const customOnClose = vi.fn();
    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });

    try {
      await act(async () => {
        root.render(
          React.createElement(
            ChakraProvider,
            null,
            React.createElement(MySelect, {
              list: [{ label: 'Option', value: 'option' }],
              isSearch: true,
              customOnClose,
              onChange: () => undefined
            })
          )
        );
      });
      const trigger = host.querySelector('button')!;
      await act(async () => trigger.click());
      const input = host.querySelector('input')!;
      expect(document.activeElement).toBe(input);
      const pendingOpenFrames = frames.splice(0);
      expect(pendingOpenFrames.length).toBeGreaterThan(0);

      await act(async () => {
        const tabEvent = new KeyboardEvent('keydown', {
          key: 'Tab',
          bubbles: true,
          cancelable: true
        });
        input.dispatchEvent(tabEvent);
        expect(tabEvent.defaultPrevented).toBe(false);
        outsideButton.focus();
        expect(customOnClose).not.toHaveBeenCalled();
        pendingOpenFrames.forEach((callback) => callback(0));
        expect(document.activeElement).toBe(outsideButton);
      });
      expect(trigger.getAttribute('aria-expanded')).toBe('true');

      await act(async () => {
        frames.splice(0).forEach((callback) => callback(0));
      });
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(customOnClose).toHaveBeenCalledOnce();
      await act(async () => {
        frames.splice(0).forEach((callback) => callback(0));
      });
      expect(document.activeElement).toBe(outsideButton);
    } finally {
      await act(async () => root.unmount());
      requestFrame.mockRestore();
    }
  });
});

describe('MySelect remote search', () => {
  it('keeps remote results and the menu while list loading, and resets search on close', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onSearchChange = vi.fn();
    const render = (isListLoading: boolean) =>
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(MySelect, {
          list: [{ label: 'Remote result', value: 'remote' }],
          isSearch: true,
          isListLoading,
          onSearchChange
        })
      );
    await act(async () => root.render(render(false)));
    await act(async () => host.querySelector('button')?.click());
    const input = host.querySelector('input');
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setInputValue?.call(input, 'different search');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onSearchChange).toHaveBeenLastCalledWith('different search');
    expect(host.textContent).toContain('Remote result');
    await act(async () => root.render(render(true)));
    expect(host.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
    await act(async () => host.querySelector('button')?.click());
    expect(onSearchChange).toHaveBeenLastCalledWith('');
    await act(async () => root.unmount());
  });
});
