// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@chakra-ui/react', () => ({
  Tooltip: ({ children, closeOnScroll }: React.PropsWithChildren<{ closeOnScroll?: boolean }>) =>
    React.createElement(
      'div',
      {
        'data-testid': 'tooltip',
        'data-close-on-scroll': String(closeOnScroll)
      },
      children
    ),
  useMergeRefs:
    (...refs: Array<React.Ref<HTMLElement> | undefined>) =>
    (node: HTMLElement | null) => {
      refs.forEach((ref) => {
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLElement | null>).current = node;
        }
      });
    }
}));

import MyTooltip from '../../../components/common/MyTooltip';

const createTestRoot = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);

  return { host, root };
};

const renderTooltip = async (root: Root, props: Record<string, unknown> = {}) => {
  await act(async () => {
    root.render(
      React.createElement(
        MyTooltip,
        { label: 'tooltip', ...props },
        React.createElement('button', null, 'trigger')
      )
    );
    await Promise.resolve();
  });
};

describe('MyTooltip', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('enables closeOnScroll by default', async () => {
    const { host, root } = createTestRoot();
    await renderTooltip(root);

    expect(
      host.querySelector('[data-testid="tooltip"]')?.getAttribute('data-close-on-scroll')
    ).toBe('true');

    root.unmount();
  });

  it('allows callers to override closeOnScroll', async () => {
    const { host, root } = createTestRoot();
    await renderTooltip(root, { closeOnScroll: false });

    expect(
      host.querySelector('[data-testid="tooltip"]')?.getAttribute('data-close-on-scroll')
    ).toBe('false');

    root.unmount();
  });
});
