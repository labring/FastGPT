import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import StandDetailModal from '@/pageComponents/account/info/standardDetailModal';
import { SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';

const plans = vi.hoisted(() => [
  {
    _id: 'advanced',
    type: 'standard',
    currentSubLevel: 'advanced',
    canHideShareBrandOverride: false,
    startTime: '2026-01-01',
    expiredTime: '2099-01-01'
  },
  {
    _id: 'basic',
    type: 'standard',
    currentSubLevel: 'basic',
    canHideShareBrandOverride: true,
    startTime: '2026-01-01',
    expiredTime: '2099-01-01'
  }
]);
const modalProps = vi.hoisted(() => vi.fn());
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({
    feConfigs: { show_outlink_brand: true },
    subPlans: {
      standard: {
        advanced: { name: 'Advanced Plan', canHideShareBrand: true },
        basic: { name: 'Basic Plan', canHideShareBrand: false }
      }
    }
  })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: null })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ data: plans.map((plan) => ({ ...plan, status: 'active' })) })
}));
vi.mock('@fastgpt/web/hooks/useLoading', () => ({
  useLoading: () => ({ Loading: () => null })
}));
vi.mock('@/web/support/user/team/api', () => ({ getTeamPlans: vi.fn() }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children, ...props }: any) => {
    modalProps(props);
    return React.createElement('div', {}, children);
  }
}));
vi.mock('@fastgpt/web/components/common/FixedTable', () => ({
  FixedTableContainer: ({ children }: any) => React.createElement('div', {}, children)
}));
vi.mock('@chakra-ui/react', () => {
  const Element = ({ children, ...props }: any) =>
    React.createElement(
      'div',
      {
        'data-plan-feature': props['data-plan-feature'],
        'data-plan-level': props['data-plan-level']
      },
      children
    );
  return {
    ...Object.fromEntries(
      ['ModalBody', 'Table', 'Thead', 'Tbody', 'Tr', 'Th', 'Td', 'HStack', 'Box', 'Flex'].map(
        (key) => [key, Element]
      )
    ),
    ModalCloseButton: () => React.createElement('span', { 'data-body-close': true })
  };
});

describe('subscription details', () => {
  it('uses the modal header close button and passes through the close callback', () => {
    const onClose = vi.fn();
    const dom = new JSDOM(renderToStaticMarkup(React.createElement(StandDetailModal, { onClose })));

    expect(modalProps).toHaveBeenCalledWith(
      expect.objectContaining({ onClose, title: 'account_info:package_details' })
    );
    expect(dom.window.document.querySelector('[data-body-close]')).toBeNull();
    modalProps.mock.lastCall?.[0].onClose();
    expect(onClose).toHaveBeenCalledOnce();
    dom.window.close();
  });

  it('does not list the branding feature for subscriptions with either override', () => {
    expect(plans.map((plan) => plan.type)).toEqual([SubTypeEnum.standard, SubTypeEnum.standard]);
    const dom = new JSDOM(
      renderToStaticMarkup(React.createElement(StandDetailModal, { onClose: vi.fn() }))
    );
    expect(dom.window.document.querySelector('[data-plan-feature="share-brand"]')).toBeNull();
    expect(dom.window.document.body.textContent).toContain('Advanced Plan');
    expect(dom.window.document.body.textContent).toContain('Basic Plan');
    dom.window.close();
  });
});
