// @vitest-environment jsdom

import React, { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MultipleRowSelect } from '../../../../components/common/MySelect/MultipleRowSelect';

describe('MultipleRowSelect', () => {
  let root: Root;
  let container: HTMLDivElement;
  const onSelect = vi.fn();
  const render = async (props: Partial<ComponentProps<typeof MultipleRowSelect>> = {}) => {
    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MultipleRowSelect, {
            label: 'Choose model',
            list: [],
            value: [],
            onSelect,
            ...props
          })
        )
      );
    });
    const menu = container.querySelector<HTMLElement>('[role="menu"]');
    // Chakra 关闭菜单时会重置滚动；JSDOM 未实现此浏览器 API。
    if (menu) menu.scrollTo = vi.fn();
  };
  const toggleMenu = async () => {
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
  };
  const options = (prefix: string) =>
    Array.from({ length: 20 }, (_, index) => ({
      value: `${prefix}-${index}`,
      label: React.createElement(
        'span',
        { 'data-option-offset': 20 + index * 40 },
        `${prefix} ${index}`
      )
    }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    // JSDOM 不计算布局；为每个选项提供确定的位置，验证异步挂载后的真实滚动副作用。
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      const option = this.querySelector<HTMLElement>(':scope > [data-option-offset]');
      return option ? Number(option.dataset.optionOffset) : 20;
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the shared local loading overlay without collapsing its indicator', async () => {
    await render({ isLoading: true, emptyTip: '模型请求中' });
    await toggleMenu();
    expect(container.querySelector('.chakra-spinner')?.getAttribute('data-preserve-width')).toBe(
      'true'
    );
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.textContent).not.toContain('模型请求中');
  });

  it.each([null, undefined, 'invalid'])(
    'handles an invalid value %s without selecting an option',
    async (value) => {
      await render({ list: options('model'), value: value as any });
      await toggleMenu();
      expect(container.querySelector('.nowheel')?.scrollTop).toBe(0);
      expect(onSelect).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])(
    'scrolls to asynchronously loaded selected options with grouping=%s',
    async (grouped) => {
      await render({ isLoading: true });
      await toggleMenu();

      const models = options('model');
      const list = grouped
        ? options('provider').map((item) => ({ ...item, children: models }))
        : models;
      const value = grouped ? ['provider-15', 'model-18'] : ['model-18'];
      await render({ list, value, isLoading: false });

      const columns = container.querySelectorAll<HTMLElement>('.nowheel');
      expect([...columns].map((column) => column.scrollTop)).toEqual(grouped ? [500, 620] : [620]);
      expect(onSelect).not.toHaveBeenCalled();

      // 相同内容重新渲染不能打断用户浏览；再次展开仍需定位当前选中项。
      columns[columns.length - 1].scrollTop = 80;
      await render({ list: [...list], value: [...value] });
      expect(
        container.querySelectorAll<HTMLElement>('.nowheel')[columns.length - 1].scrollTop
      ).toBe(80);
      await toggleMenu();
      await toggleMenu();
      expect(
        container.querySelectorAll<HTMLElement>('.nowheel')[columns.length - 1].scrollTop
      ).toBe(620);
    }
  );

  it('scrolls when options arrive without an explicit loading state', async () => {
    await render({ value: ['model-18'] });
    await toggleMenu();
    await render({ value: ['model-18'], list: options('model') });
    expect(container.querySelector<HTMLElement>('.nowheel')?.scrollTop).toBe(620);
  });

  it('positions child columns when group options arrive asynchronously', async () => {
    const models = options('model');
    const value = ['provider-0', 'model-18'];
    await render({ value, list: [{ value: 'provider-0', label: 'Provider' }] });
    await toggleMenu();
    await render({ value, list: [{ value: 'provider-0', label: 'Provider', children: models }] });
    expect(container.querySelectorAll<HTMLElement>('.nowheel')[1].scrollTop).toBe(620);
  });
});
