// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider, Popover, PopoverTrigger } from '@chakra-ui/react';
import { describe, expect, it, vi } from 'vitest';
import MyIconButton from '../../../../components/common/Icon/button';

vi.mock('../../../../components/common/Icon/index', () => ({
  default: () => React.createElement('svg')
}));
vi.mock('../../../../components/common/MyTooltip', () => ({
  default: ({ children }: React.PropsWithChildren) => children
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('MyIconButton popover anchor', () => {
  it('forwards the trigger ref to its actual DOM node and retains click handling', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const ref = React.createRef<HTMLDivElement>();
    const onClick = vi.fn();
    try {
      await act(async () => {
        root.render(
          React.createElement(
            ChakraProvider,
            null,
            React.createElement(
              Popover,
              null,
              React.createElement(
                PopoverTrigger,
                null,
                React.createElement(MyIconButton, {
                  ref,
                  icon: 'common/trash',
                  onClick,
                  'aria-label': 'delete'
                })
              )
            )
          )
        );
      });
      const trigger = host.querySelector('[aria-label="delete"]');
      expect(trigger).not.toBeNull();
      expect(ref.current).toBe(trigger);
      await act(async () => {
        trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onClick).toHaveBeenCalledOnce();
      expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
