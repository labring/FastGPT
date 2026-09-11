// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@chakra-ui/react', () => ({
  Table: 'table',
  Thead: 'thead',
  Box: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    function MockBox({ children, ...props }, ref) {
      return React.createElement('div', { ...props, ref }, children);
    }
  )
}));

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

import { FixedTableLayout, FixedTableContainer } from '../../../components/common/FixedTable';

const createTestRoot = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return { host, root: createRoot(host) };
};

const renderLayout = async (
  root: Root,
  bodyRef: React.RefObject<HTMLDivElement>,
  scrollMode: 'virtual' | 'normal'
) => {
  await act(async () => {
    root.render(
      React.createElement(FixedTableLayout, {
        scrollMode,
        bodyRef,
        headerProps: { 'data-testid': 'header' },
        bodyProps: { 'data-testid': 'body' },
        renderHeader: () => React.createElement('div', null, 'header content'),
        renderBody: () => React.createElement('div', null, 'body content'),
        footer: React.createElement('div', { 'data-testid': 'footer' }, 'pagination')
      })
    );
    await Promise.resolve();
  });
};

describe('FixedTableLayout', () => {
  it('defaults to horizontal spacing 4, no vertical padding and a 24px minimum container width', async () => {
    const { host, root } = createTestRoot();
    await act(async () =>
      root.render(React.createElement(FixedTableContainer, null, React.createElement('table')))
    );
    const layout = host.querySelector('[data-fixed-table-scroll-mode]');
    expect(layout?.getAttribute('py')).toBe('0');
    expect(layout?.getAttribute('minW')).toBe('24px');
    expect(host.querySelector('[data-fixed-table-body-content]')?.getAttribute('px')).toBe('4');
    await act(async () => root.unmount());
  });

  it.each([false, true])(
    'only enables content-sized horizontal layout when opted in: %s',
    async (horizontalScroll) => {
      const { host, root } = createTestRoot();
      await act(async () =>
        root.render(
          React.createElement(
            FixedTableContainer,
            horizontalScroll ? { horizontalScroll: true } : {},
            React.createElement('table')
          )
        )
      );
      const content = host.querySelector('[data-fixed-table-body-content]');
      expect(content?.getAttribute('w')).toBe(horizontalScroll ? 'fit-content' : '100%');
      expect(content?.getAttribute('whiteSpace')).toBe(horizontalScroll ? 'nowrap' : 'normal');
      expect(content?.getAttribute('overflowWrap')).toBe(horizontalScroll ? 'normal' : 'anywhere');
      await act(async () => root.unmount());
    }
  );

  it.each([24, 0])(
    'absorbs the scrollbar into %s px right padding without a filler',
    async (padding) => {
      const { host, root } = createTestRoot();
      const bodyRef = React.createRef<HTMLDivElement>();
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(120);
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(104);
      const originalGetComputedStyle = window.getComputedStyle.bind(window);
      vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
        const computed = originalGetComputedStyle(element);
        return new Proxy(computed, {
          get(target, key) {
            if (key === 'paddingRight') return `${padding}px`;
            return Reflect.get(target, key, target);
          }
        });
      });
      await renderLayout(root, bodyRef, 'normal');
      const headerPadding = host.querySelector<HTMLElement>('[data-fixed-table-header-padding]');
      const bodyPadding = host.querySelector<HTMLElement>('[data-fixed-table-body-content]');
      expect(headerPadding?.style.paddingRight).toBe(`${Math.max(padding, 16)}px`);
      expect(bodyPadding?.style.paddingRight).toBe(`${Math.max(0, padding - 16)}px`);
      expect(host.querySelector('[data-fixed-table-header-content]')?.children).toHaveLength(1);
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(120);
      await act(async () => window.dispatchEvent(new Event('resize')));
      expect(headerPadding?.style.paddingRight).toBe(`${padding}px`);
      expect(bodyPadding?.style.paddingRight).toBe(`${padding}px`);
      await act(async () => root.unmount());
    }
  );

  it.each(['th', 'tr', 'thead', 'table', 'none'])(
    'keeps the %s background on the original table without adding a filler',
    async (backgroundTag) => {
      const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 300,
        bottom: 30,
        width: 300,
        height: 30,
        toJSON: () => ({})
      });
      const { host, root } = createTestRoot();
      const propsFor = (tag: string) => ({
        style: { backgroundColor: tag === backgroundTag ? 'rgb(240, 242, 245)' : 'transparent' }
      });
      try {
        await act(async () => {
          root.render(
            React.createElement(
              FixedTableContainer,
              null,
              React.createElement(
                'table',
                propsFor('table'),
                React.createElement(
                  'thead',
                  propsFor('thead'),
                  React.createElement(
                    'tr',
                    propsFor('tr'),
                    React.createElement('th', propsFor('th'), 'Name')
                  )
                ),
                React.createElement(
                  'tbody',
                  null,
                  React.createElement('tr', null, React.createElement('td', null, 'Value'))
                )
              )
            )
          );
        });
        const header = host.querySelector<HTMLElement>('[data-fixed-table-header-content]');
        expect(header?.style.getPropertyValue('--fixed-table-header-background')).toBe('');
        expect(header?.children).toHaveLength(1);
        if (backgroundTag !== 'none') {
          expect(header?.querySelector<HTMLElement>(backgroundTag)?.style.backgroundColor).toBe(
            'rgb(240, 242, 245)'
          );
        }
        expect(header?.querySelector('table')?.style.getPropertyValue('--fixed-table-width')).toBe(
          '300px'
        );
      } finally {
        await act(async () => root.unmount());
        rectSpy.mockRestore();
      }
    }
  );

  it.each(['normal', 'virtual'] as const)(
    'moves horizontal padding inside the %s scroll container',
    async (scrollMode) => {
      const { host, root } = createTestRoot();
      const bodyRef = React.createRef<HTMLDivElement>();
      await act(async () => {
        root.render(
          React.createElement(FixedTableLayout, {
            scrollMode,
            bodyRef,
            rootProps: { p: 3, px: [3, 6] },
            renderHeader: () => 'Header',
            renderBody: () => 'Body',
            footer: 'Pagination'
          })
        );
      });
      const layout = host.firstElementChild;
      expect(layout?.hasAttribute('p')).toBe(false);
      expect(layout?.hasAttribute('px')).toBe(false);
      expect(layout?.getAttribute('py')).toBe('3');
      expect(bodyRef.current?.hasAttribute('px')).toBe(false);
      expect(bodyRef.current?.firstElementChild?.getAttribute('px')).toBe('3,6');
      expect(host.querySelector('[data-fixed-table-header-padding]')?.getAttribute('px')).toBe(
        '3,6'
      );
      expect(host.querySelector('[data-fixed-table-header-content]')?.hasAttribute('px')).toBe(
        false
      );
      expect(layout?.lastElementChild?.getAttribute('px')).toBe('3,6');
      await act(async () => root.unmount());
    }
  );

  afterEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('uses an external body ref as the only body scroll container', async () => {
    const { host, root } = createTestRoot();
    const bodyRef = React.createRef<HTMLDivElement>();
    await renderLayout(root, bodyRef, 'virtual');

    expect(bodyRef.current).toBe(host.querySelector('[data-testid="body"]'));
    expect(host.querySelector('[data-fixed-table-scroll-mode="virtual"]')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('keeps the pagination footer outside the scrolling body', async () => {
    const { host, root } = createTestRoot();
    const bodyRef = React.createRef<HTMLDivElement>();
    await renderLayout(root, bodyRef, 'normal');

    const body = host.querySelector('[data-testid="body"]');
    const footer = host.querySelector('[data-testid="footer"]');
    expect(body).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(body?.contains(footer)).toBe(false);
    expect(host.querySelector('[data-fixed-table-scroll-mode="normal"]')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('keeps the visible header outside the body, preserves colspan and fixes the footer outside it', async () => {
    const { host, root } = createTestRoot();
    const ref = React.createRef<HTMLDivElement>();
    await act(async () => {
      root.render(
        React.createElement(
          FixedTableContainer,
          {
            ref,
            footer: React.createElement('button', null, 'Next page')
          },
          React.createElement(
            'table',
            null,
            React.createElement(
              'thead',
              null,
              React.createElement('tr', null, React.createElement('th', { colSpan: 2 }, 'Columns'))
            ),
            React.createElement(
              'tbody',
              null,
              React.createElement('tr', null, React.createElement('td', null, 'Value'))
            )
          )
        )
      );
    });
    const table = host.querySelector('table');
    expect(host.querySelectorAll('table')).toHaveLength(2);
    expect(table?.tHead?.rows[0].cells[0].colSpan).toBe(2);
    expect(ref.current?.contains(table)).toBe(false);
    expect(ref.current?.querySelector('table')?.parentElement).toBe(ref.current?.firstElementChild);
    expect(ref.current?.querySelector('thead')?.getAttribute('aria-hidden')).toBe('true');
    expect(ref.current?.querySelector('thead')?.style.visibility).toBe('collapse');
    expect(ref.current?.contains(host.querySelector('button'))).toBe(false);
    await act(async () => root.unmount());
    expect(ref.current).toBeNull();
  });

  it('mounts interactive headers once and updates sizing columns without duplicate IDs or form controls', async () => {
    const { host, root } = createTestRoot();
    const mounted = vi.fn();
    const onChange = vi.fn();
    const Header = () => {
      React.useEffect(mounted, []);
      return React.createElement('input', {
        id: 'select-all',
        name: 'select',
        type: 'checkbox',
        onChange
      });
    };
    const render = async (extra: boolean) =>
      act(async () =>
        root.render(
          React.createElement(
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
                  React.createElement('th', null, React.createElement(Header)),
                  extra && React.createElement('th', null, 'Extra')
                )
              ),
              React.createElement(
                'tbody',
                null,
                React.createElement(
                  'tr',
                  null,
                  React.createElement('td', null, 'Value'),
                  extra && React.createElement('td', null, 'Extra value')
                )
              )
            )
          )
        )
      );
    await render(false);
    await act(async () => host.querySelector<HTMLInputElement>('#select-all')?.click());
    expect(onChange).toHaveBeenCalledTimes(1);
    await render(true);
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('#select-all')).toHaveLength(1);
    expect(host.querySelectorAll('[name="select"]')).toHaveLength(1);
    const sizing = host.querySelector('[data-fixed-table-sizing]');
    expect(sizing?.querySelectorAll('th')).toHaveLength(2);
    expect(sizing?.querySelector('input')?.disabled).toBe(true);
    expect(sizing?.hasAttribute('inert')).toBe(true);
    await render(false);
    expect(host.querySelectorAll('[data-fixed-table-sizing]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-fixed-table-sizing] th')).toHaveLength(1);
    await act(async () => root.unmount());
  });

  it.each(
    [0.65, 1, 1.4].flatMap((scale) =>
      [false, true].flatMap((flush) => [0, 15].map((gutter) => ({ scale, flush, gutter })))
    )
  )(
    'preserves native columns at zoom $scale, flush $flush, gutter $gutter',
    async ({ scale, flush, gutter }) => {
      const { host, root } = createTestRoot();
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300 + gutter);
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement
      ) {
        const isFirst = this instanceof HTMLTableCellElement && this.cellIndex === 0;
        const isSecond = this instanceof HTMLTableCellElement && this.cellIndex === 1;
        const width = (isFirst ? 80 : isSecond ? 220 : 300) * scale;
        const left = (isSecond ? 80 : 0) * scale;
        return {
          x: left,
          y: 0,
          left,
          right: left + width + (isFirst ? 0.000001 : 0),
          top: 0,
          bottom: 0,
          width,
          height: 0,
          toJSON: () => ({})
        };
      });
      await act(async () =>
        root.render(
          React.createElement(
            FixedTableContainer,
            { flush },
            React.createElement(
              'table',
              { style: { width: '300px' } },
              React.createElement(
                'thead',
                null,
                React.createElement(
                  'tr',
                  null,
                  React.createElement('th', null, 'A'),
                  React.createElement('th', null, 'B')
                )
              ),
              React.createElement('tbody')
            )
          )
        )
      );
      const headerTable = host.querySelector<HTMLTableElement>('[data-fixed-table-header] table');
      expect(headerTable?.style.getPropertyValue('--fixed-table-width')).toBe(
        `${300 + (flush ? gutter : 0)}px`
      );
      const widths = Array.from(headerTable?.querySelectorAll('col') ?? []).map((col) =>
        Number.parseFloat(col.style.width)
      );
      expect(widths).toHaveLength(2);
      expect(widths[0]).toBeCloseTo(80, 3);
      expect(widths[1]).toBeCloseTo(220 + (flush ? gutter : 0), 3);
      expect(host.querySelector('[data-fixed-table-body-content]')?.getAttribute('px')).toBe(
        flush ? '0' : '4'
      );
      await act(async () => {
        headerTable!.querySelector('th')!.textContent = 'Changed';
        await Promise.resolve();
      });
      expect(host.querySelector('[data-fixed-table-sizing] th')?.textContent).toBe('Changed');
      await act(async () => root.unmount());
    }
  );

  it('passes the actual scroll ref to a scroll-loading component without nesting another scroller', async () => {
    const { host, root } = createTestRoot();
    const ref = React.createRef<HTMLDivElement>();
    const onScroll = vi.fn();
    const ScrollData = ({
      children,
      ScrollContainerRef,
      ...props
    }: {
      children: React.ReactNode;
      ScrollContainerRef?: React.RefObject<HTMLDivElement>;
    }) =>
      React.createElement(
        'div',
        { ...props, ref: ScrollContainerRef, onScroll, 'data-testid': 'scroll-loader' },
        children
      );
    await act(async () => {
      root.render(
        React.createElement(
          FixedTableContainer,
          {
            ref,
            px: 6,
            scrollContainer: ScrollData
          },
          React.createElement('table')
        )
      );
    });
    const body = host.querySelector('[data-testid="scroll-loader"]');
    expect(ref.current).toBe(body);
    expect(body?.hasAttribute('px')).toBe(false);
    expect(body?.firstElementChild?.getAttribute('px')).toBe('6');
    expect(body?.parentElement?.hasAttribute('px')).toBe(false);
    expect(host.querySelector('table')?.parentElement).toBe(body?.firstElementChild);
    await act(async () => body?.dispatchEvent(new Event('scroll')));
    expect(onScroll).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
