import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RechargeModal } from '@/components/support/wallet/NotSufficientModal';

vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children, ...props }: any) =>
    React.createElement(
      'div',
      {
        'data-modal': true,
        onClickCapture: props.onClickCapture,
        onPointerDownCapture: props.onPointerDownCapture,
        onWheelCapture: props.onWheelCapture,
        onTouchMoveCapture: props.onTouchMoveCapture,
        onScrollCapture: props.onScrollCapture,
        onKeyDownCapture: props.onKeyDownCapture
      },
      children
    )
}));
vi.mock('@chakra-ui/react', () => {
  const Element = ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', {}, children);
  return { Box: Element, Flex: Element, Button: Element, useDisclosure: () => ({}) };
});
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ subPlans: {} })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: {}, initTeamPlanStatus: vi.fn() })
}));
vi.mock('ahooks', () => ({ useMount: () => {} }));
vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/pageComponents/price/ExtraPlan', () => ({ default: () => null }));
vi.mock('@/pageComponents/price/PricePlanTabs', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({ default: () => null }));
vi.mock('@/pageComponents/price/Standard', () => ({
  default: ({ highlightShareBrand, shareBrandHighlightActive }: any) =>
    React.createElement('div', {
      'data-plan': true,
      'data-requested': String(highlightShareBrand),
      'data-active': String(shareBrandHighlightActive)
    }),
  BillingModeSwitch: () => null
}));

describe('RechargeModal share brand highlight', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLElement;

  beforeEach(async () => {
    dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.getElementById('root')!;
    root = createRoot(container);
    await act(async () =>
      root.render(
        React.createElement(RechargeModal, {
          onClose: vi.fn(),
          onPaySuccess: vi.fn(),
          highlightShareBrand: true
        })
      )
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('keeps highlighting while scrolling and clears it on click', async () => {
    const plan = container.querySelector('[data-plan]')!;
    for (const type of ['pointerdown', 'wheel', 'touchmove', 'scroll']) {
      await act(async () => plan.dispatchEvent(new dom.window.Event(type, { bubbles: true })));
      expect(plan.getAttribute('data-active')).toBe('true');
    }
    await act(async () =>
      plan.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'PageDown', bubbles: true })
      )
    );
    expect(plan.getAttribute('data-active')).toBe('true');
    await act(async () =>
      plan.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    );
    expect(plan.getAttribute('data-active')).toBe('false');
    expect(plan.getAttribute('data-requested')).toBe('true');
  });
});
