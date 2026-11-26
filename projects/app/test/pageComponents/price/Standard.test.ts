import { JSDOM } from 'jsdom';
import React, { act, forwardRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Standard from '@/pageComponents/price/Standard';
import StandardPlanContentList from '@/components/support/wallet/StandardPlanContentList';
import type { TeamPlanStandardType } from '@fastgpt/global/support/wallet/sub/type';

const mocks = vi.hoisted(() => {
  const plan = {
    price: 0,
    totalPoints: 100,
    maxTeamMember: 1,
    maxAppAmount: 1,
    maxDatasetAmount: 1,
    maxDatasetSize: 1,
    chatHistoryStoreDuration: 30,
    canHideShareBrand: true
  };
  return {
    feConfigs: {
      show_outlink_brand: true,
      limit: { uploadFileMaxSize: 10, uploadFileMaxAmount: 5 }
    },
    subPlans: {
      standard: {
        free: { ...plan },
        basic: { ...plan },
        advanced: { ...plan },
        custom: { ...plan, customFormUrl: 'https://example.com' }
      }
    }
  };
});
vi.mock('@/web/common/system/useSystemStore', () => ({ useSystemStore: () => mocks }));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: undefined })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-CN' } })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ data: [], runAsync: vi.fn(), loading: false })
}));
vi.mock('next-i18next', () => ({ Trans: () => null }));
vi.mock('next/dynamic', () => ({
  default:
    () =>
    ({ children }: any) =>
      children({ onOpen: vi.fn() })
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({
  default: () => React.createElement('span', { 'data-tip': true })
}));
vi.mock('@fastgpt/web/components/common/MyPopover', () => ({ default: () => null }));
vi.mock('@/components/Markdown', () => ({ default: () => null }));
vi.mock('@/components/support/wallet/QRCodePayModal', () => ({ default: () => null }));
vi.mock('@/web/support/wallet/bill/api', () => ({ postCreatePayBill: vi.fn() }));
vi.mock('@/web/support/wallet/sub/discountCoupon/api', () => ({
  getDiscountCouponList: vi.fn()
}));
vi.mock('@chakra-ui/react', () => {
  const Element = forwardRef<HTMLDivElement, any>(function Element(props, ref) {
    return React.createElement(
      'div',
      {
        ref,
        'data-plan-feature': props['data-plan-feature'],
        'data-plan-level': props['data-plan-level'],
        'data-bg': props.bg,
        'data-columns': props.gridTemplateColumns
      },
      props.children
    );
  });
  return { Box: Element, Flex: Element, Grid: Element, Text: Element, Button: Element };
});

let dom: JSDOM;
let container: HTMLDivElement;
let root: Root;
let scrollTargets: string[];
let scrollOptions: (boolean | ScrollIntoViewOptions | undefined)[];

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  scrollTargets = [];
  scrollOptions = [];
  dom.window.HTMLElement.prototype.scrollIntoView = function (options) {
    scrollTargets.push(this.getAttribute('data-plan-level') ?? '');
    scrollOptions.push(options);
  };
  mocks.feConfigs.show_outlink_brand = true;
  for (const plan of Object.values(mocks.subPlans.standard)) plan.canHideShareBrand = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

describe('Standard purchase plan branding features', () => {
  it('highlights every enabled plan first and scrolls only to advanced', async () => {
    await act(async () =>
      root.render(
        React.createElement(Standard, {
          highlightShareBrand: true,
          shareBrandPlacement: 'first',
          hideBillingToggle: true
        })
      )
    );
    const rows = Array.from(container.querySelectorAll('[data-plan-feature="share-brand"]'));
    expect(rows.map((row) => row.getAttribute('data-plan-level'))).toEqual([
      'free',
      'basic',
      'advanced',
      'custom'
    ]);
    for (const row of rows) {
      expect(row.parentElement?.firstElementChild).toBe(row);
      expect(row.querySelector('[data-bg="yellow.200"]')).not.toBeNull();
    }
    expect(scrollTargets).toEqual(['advanced']);
    expect(scrollOptions).toEqual([{ block: 'center', inline: 'nearest', behavior: 'smooth' }]);
  });

  it('does not scroll when advanced is disabled even if other plans are highlighted', async () => {
    mocks.subPlans.standard.free.canHideShareBrand = false;
    mocks.subPlans.standard.advanced.canHideShareBrand = false;
    await act(async () =>
      root.render(
        React.createElement(Standard, {
          highlightShareBrand: true,
          shareBrandPlacement: 'first',
          hideBillingToggle: true
        })
      )
    );
    const rows = Array.from(container.querySelectorAll('[data-plan-feature="share-brand"]'));
    expect(rows.map((row) => row.getAttribute('data-plan-level'))).toEqual(['basic', 'custom']);
    for (const row of rows) {
      expect(row.querySelector('[data-bg="yellow.200"]')).not.toBeNull();
    }
    expect(scrollTargets).toEqual([]);
  });

  it('keeps explanations but clears emphasis and skips pending positioning after interaction', async () => {
    await act(async () =>
      root.render(
        React.createElement(Standard, {
          highlightShareBrand: true,
          shareBrandHighlightActive: false
        })
      )
    );
    const rows = Array.from(container.querySelectorAll('[data-plan-feature="share-brand"]'));
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.querySelector('[data-bg="yellow.200"]')).toBeNull();
      expect(row.querySelector('[data-tip]')).not.toBeNull();
    }
    expect(scrollTargets).toEqual([]);
  });

  it('does not scroll when highlighting or the global feature is disabled', async () => {
    await act(async () =>
      root.render(React.createElement(Standard, { highlightShareBrand: false }))
    );
    expect(scrollTargets).toEqual([]);

    mocks.feConfigs.show_outlink_brand = false;
    await act(async () =>
      root.render(React.createElement(Standard, { highlightShareBrand: true }))
    );
    expect(container.querySelector('[data-plan-feature="share-brand"]')).toBeNull();
    expect(scrollTargets).toEqual([]);
  });

  it('waits for the responsive layout and does not scroll again on resize', async () => {
    let width = 800;
    let onResize: (() => void) | undefined;
    Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => width
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          onResize = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    let columnsAtScroll: string | null | undefined;
    dom.window.HTMLElement.prototype.scrollIntoView = function () {
      scrollTargets.push(this.getAttribute('data-plan-level') ?? '');
      columnsAtScroll = container.querySelector('[data-columns]')?.getAttribute('data-columns');
    };

    await act(async () =>
      root.render(
        React.createElement(Standard, {
          highlightShareBrand: true,
          shareBrandPlacement: 'first',
          hideBillingToggle: true,
          responsiveCardLayout: true
        })
      )
    );
    expect(scrollTargets).toEqual(['advanced']);
    expect(columnsAtScroll).toBe('repeat(2, minmax(0, 388px))');

    width = 400;
    await act(async () => onResize?.());
    expect(container.querySelector('[data-columns]')?.getAttribute('data-columns')).toBe(
      'repeat(1, minmax(0, 400px))'
    );
    expect(scrollTargets).toEqual(['advanced']);
  });

  it('waits for a measurable width before scrolling', async () => {
    let width = 0;
    let onResize: (() => void) | undefined;
    Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => width
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          onResize = callback;
        }
        observe() {}
        disconnect() {}
      }
    );

    await act(async () =>
      root.render(
        React.createElement(Standard, { highlightShareBrand: true, responsiveCardLayout: true })
      )
    );
    expect(scrollTargets).toEqual([]);

    width = 400;
    await act(async () => onResize?.());
    expect(scrollTargets).toEqual(['advanced']);
  });
});

describe('StandardPlanContentList team entitlements', () => {
  it('uses the effective team permissions instead of the plan template', async () => {
    const teamPlan = {
      canHideShareBrand: false,
      enableSandbox: false
    } as TeamPlanStandardType;
    await act(async () =>
      root.render(
        React.createElement(StandardPlanContentList, {
          level: 'advanced',
          mode: 'month',
          standplan: teamPlan
        })
      )
    );
    expect(container.querySelector('[data-plan-feature="share-brand"]')).toBeNull();
    expect(container.textContent).not.toContain('common:enable_sandbox');

    mocks.subPlans.standard.advanced.canHideShareBrand = false;
    await act(async () =>
      root.render(
        React.createElement(StandardPlanContentList, {
          level: 'advanced',
          mode: 'month',
          standplan: { ...teamPlan, canHideShareBrand: true, enableSandbox: true }
        })
      )
    );
    expect(container.querySelector('[data-plan-feature="share-brand"]')).not.toBeNull();
    expect(container.textContent).toContain('common:enable_sandbox');
  });

  it('does not grant a feature when an existing team status lacks the entitlement', async () => {
    await act(async () =>
      root.render(
        React.createElement(StandardPlanContentList, {
          level: 'advanced',
          mode: 'month',
          standplan: {} as TeamPlanStandardType
        })
      )
    );
    expect(container.querySelector('[data-plan-feature="share-brand"]')).toBeNull();
  });
});
