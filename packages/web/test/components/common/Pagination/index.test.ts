// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Pagination from '../../../../components/common/Pagination';

const mocks = vi.hoisted(() => ({ isPc: true }));
vi.mock('../../../../hooks/useSystem', () => ({
  useSystem: () => ({ isPc: mocks.isPc })
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('../../../../components/common/Icon', () => ({ default: () => null }));

describe('controlled Pagination', () => {
  let root: Root, container: HTMLDivElement;
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  const ref = React.createRef<HTMLDivElement>();
  const render = async (props: Partial<React.ComponentProps<typeof Pagination>> = {}) => {
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(Pagination, {
            ref,
            total: 45,
            page: 2,
            pageSize: 20,
            pageSizeOptions: [20, 50],
            onPageChange,
            onPageSizeChange,
            ...props
          })
        )
      )
    );
  };
  const control = (name: string) =>
    container.querySelector<HTMLButtonElement>(`[aria-label="common:${name}_page"]`)!;

  beforeEach(() => {
    mocks.isPc = true;
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

  it('emits navigation targets without changing its controlled page and forwards the root ref', async () => {
    await render();
    for (const name of ['first', 'previous', 'next', 'last']) {
      await act(async () => control(name).click());
    }
    expect(onPageChange.mock.calls).toEqual([[1], [1], [3], [3]]);
    expect(ref.current?.textContent).toContain('2 / 3');
    expect(ref.current?.contains(control('next'))).toBe(true);
  });

  it.each([
    { total: 0, page: 1, previousDisabled: true, nextDisabled: true },
    { total: 45, page: 1, previousDisabled: true, nextDisabled: false },
    { total: 45, page: 3, previousDisabled: false, nextDisabled: true }
  ])('disables boundary actions for total=$total page=$page', async (props) => {
    await render(props);
    expect(control('first').disabled).toBe(props.previousDisabled);
    expect(control('previous').disabled).toBe(props.previousDisabled);
    expect(control('next').disabled).toBe(props.nextDisabled);
    expect(control('last').disabled).toBe(props.nextDisabled);
    for (const button of container.querySelectorAll<HTMLButtonElement>('button[disabled]')) {
      await act(async () => button.click());
    }
    expect(onPageChange).not.toHaveBeenCalled();
    if (props.total === 0) expect(ref.current?.textContent).toContain('1 / 1');
  });

  it('blocks navigation while loading and restores it after the request settles', async () => {
    await render({ isLoading: true });
    for (const name of ['first', 'previous', 'next', 'last']) {
      expect(control(name).disabled).toBe(true);
      await act(async () => control(name).click());
    }
    expect(onPageChange).not.toHaveBeenCalled();
    await render({ isLoading: false });
    await act(async () => control('next').click());
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('emits the selected page size without owning pagination state', async () => {
    await render();
    const menuButton = container.querySelector<HTMLButtonElement>('.chakra-menu__menu-button')!;
    await act(async () => menuButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    const menu = container.querySelector<HTMLElement>('[role="menu"]')!;
    menu.scrollTo = vi.fn();
    const option = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (item) => item.textContent === '50'
    )!;
    await act(async () => option.click());
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
    expect(onPageChange).not.toHaveBeenCalled();
    expect(ref.current?.textContent).toContain('20/common:page');
  });

  it('keeps only previous and next controls in the mobile layout', async () => {
    mocks.isPc = false;
    await render();
    expect(control('first')).toBeNull();
    expect(control('last')).toBeNull();
    expect(container.querySelector('.chakra-menu__menu-button')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(2);
    await act(async () => control('next').click());
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
