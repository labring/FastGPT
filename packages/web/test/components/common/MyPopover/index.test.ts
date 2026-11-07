// @vitest-environment jsdom

import React, { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyPopover from '../../../../components/common/MyPopover';

describe('MyPopover compatibility', () => {
  let root: Root;
  let container: HTMLDivElement;
  const onOpenFunc = vi.fn();
  const onCloseFunc = vi.fn();
  const render = async (props: Partial<ComponentProps<typeof MyPopover>> = {}) => {
    const popoverProps: ComponentProps<typeof MyPopover> = {
      Trigger: React.createElement('button', { 'data-testid': 'trigger' }, 'Open'),
      usePortal: false,
      onOpenFunc,
      onCloseFunc,
      children: ({ onClose }) =>
        React.createElement('button', { id: 'close', onClick: onClose }, 'Close'),
      ...props
    };
    await act(async () => {
      root.render(
        React.createElement(ChakraProvider, null, React.createElement(MyPopover, popoverProps))
      );
    });
  };
  const trigger = () => container.querySelector<HTMLButtonElement>('[data-testid="trigger"]')!;
  const click = async (selector: string) => {
    const button = container.querySelector<HTMLButtonElement>(selector);
    expect(button).not.toBeNull();
    await act(async () => button!.click());
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('keeps the original uncontrolled click and render-prop close behavior', async () => {
    await render();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    await click('[data-testid="trigger"]');
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(onOpenFunc).toHaveBeenCalledOnce();
    await click('#close');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(onCloseFunc).toHaveBeenCalledOnce();
  });

  it('keeps controlled false closed and lets the caller decide when to open or close', async () => {
    await render({ isOpen: false });
    await click('[data-testid="trigger"]');
    expect(onOpenFunc).toHaveBeenCalledOnce();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    await render({ isOpen: true });
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    await click('#close');
    expect(onCloseFunc).toHaveBeenCalledOnce();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    await render({ isOpen: false });
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps popovers in separate component instances independent', async () => {
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          ...['left', 'right'].map((id) => {
            const props: ComponentProps<typeof MyPopover> = {
              Trigger: React.createElement('button', { 'data-testid': id }, id),
              usePortal: false,
              children: () => id
            };
            return React.createElement(MyPopover, { ...props, key: id });
          })
        )
      )
    );
    await click('[data-testid="left"]');
    expect(container.querySelector('[data-testid="left"]')?.getAttribute('aria-expanded')).toBe(
      'true'
    );
    expect(container.querySelector('[data-testid="right"]')?.getAttribute('aria-expanded')).toBe(
      'false'
    );
  });

  it.each([undefined, false])(
    'handles trigger-only hover with the original state ownership: %s',
    async (isOpen) => {
      await render({ trigger: 'hover', closeOnTriggerLeave: true, isOpen });
      const hoverTarget = trigger().parentElement!;
      await act(async () =>
        hoverTarget.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      );
      expect(onOpenFunc).toHaveBeenCalledOnce();
      expect(!!container.querySelector('#close')).toBe(isOpen === undefined);
      await act(async () =>
        hoverTarget.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
      );
      expect(onCloseFunc).toHaveBeenCalledOnce();
    }
  );
});
