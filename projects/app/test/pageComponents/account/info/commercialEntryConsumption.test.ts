import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultInstanceConfig,
  getTestInstanceConfig,
  setTestLicenseActive
} from '@test/utils/instanceConfigSnapshot';
import { buildSystemFrontendConfig } from '@fastgpt/service/common/system/systemInstanceConfig/frontend';
import { BillPayWayEnum } from '@fastgpt/global/support/wallet/bill/constants';

const state = vi.hoisted(() => ({ feConfigs: {} as any, owner: true }));
const user = vi.hoisted(() => ({
  username: 'root',
  _id: 'owned-user',
  userId: 'owned-user',
  memberName: 'Owned',
  permission: { isOwner: true },
  team: { teamId: 'owned-team', permission: {}, balance: 0 }
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: Object.assign(
    () => ({ ...state, initd: true, subPlans: {}, setNotSufficientModalType: vi.fn() }),
    { getState: () => state }
  )
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({
    userInfo: { ...user, permission: { isOwner: state.owner } },
    teamPlanStatus: {
      standard: { currentSubLevel: 'free', maxTeamMember: 1, maxAppAmount: 1, maxDatasetAmount: 1 },
      datasetMaxSize: 10,
      totalPoints: 10
    },
    initTeamPlanStatus: async () => undefined,
    updateUserInfo: vi.fn()
  })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ runAsync: vi.fn(), loading: false, data: undefined })
}));
vi.mock('@fastgpt/web/common/file/hooks/useUploadAvatar', () => ({
  useUploadAvatar: () => ({ Component: () => null, handleFileSelectorOpen: vi.fn() })
}));
vi.mock('@/web/support/user/account/password/store', () => ({
  usePasswordChangeStore: (select: (value: unknown) => unknown) => select({ session: null })
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/account/info', query: {}, replace: vi.fn(), push: vi.fn() })
}));
vi.mock('next-i18next', () => ({
  Trans: ({ components }: { components: Record<string, React.ReactElement> }) =>
    React.createElement(
      React.Fragment,
      null,
      ...Object.entries(components).map(([key, child]) => React.cloneElement(child, { key }, key))
    )
}));
vi.mock('@fastgpt/global/common/i18n/utils', () => ({ i18nT: (key: string) => key }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyDivider', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/LightTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/pageComponents/account/AccountContainer', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/pageComponents/account/TeamSelector', () => ({ default: () => null }));
vi.mock('@/pageComponents/account/cancel/AccountCancellationConfirmModal', () => ({
  AccountCancellationConfirmModal: () => null
}));
vi.mock('@/components/support/wallet/StandardPlanContentList', () => ({ default: () => null }));
vi.mock('@/components/Markdown', () => ({
  default: ({ source }: { source: string }) => React.createElement('pre', null, source)
}));
vi.mock('@chakra-ui/react', async () => {
  const React = await import('react');
  const component = React.forwardRef<HTMLDivElement, any>(({ children, onClick }, ref) =>
    React.createElement('div', { ref, onClick }, children)
  );
  component.displayName = 'ConfigConsumerLayout';
  return {
    Box: component,
    Flex: component,
    Button: component,
    Grid: component,
    Link: ({ children, href }: { children?: React.ReactNode; href?: string }) =>
      React.createElement('a', { href }, children),
    useTheme: () => ({ borders: { base: '1px solid' } }),
    useDisclosure: () => ({ isOpen: false, onOpen: vi.fn(), onClose: vi.fn() })
  };
});

import AccountInfo from '@/pages/account/info';
import QRCodePayModal from '@/components/support/wallet/QRCodePayModal';

/** 仅验证入口条件/链接；请求 hook 不执行，不查询账单、生成二维码或提交支付。 */
describe('commercial configuration entry consumption', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLDivElement;
  const publish = (coupon: boolean, discount: boolean, payFormUrl = '') => {
    global.systemInstanceConfig = createDefaultInstanceConfig();
    setTestLicenseActive(true);
    Object.assign(getTestInstanceConfig().commercial, {
      showCoupon: coupon,
      showDiscountCoupon: discount,
      payFormUrl
    });
    state.feConfigs = buildSystemFrontendConfig(getTestInstanceConfig(), {
      commercialService: true
    });
  };
  const render = async (node: React.ReactNode) => {
    await act(async () => root.render(node));
  };
  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    state.owner = true;
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('independently shows coupon and discount entries only to the owner', async () => {
    for (const [coupon, discount] of [
      [true, false],
      [false, true],
      [false, false],
      [true, true]
    ]) {
      publish(coupon, discount);
      await render(React.createElement(AccountInfo, { key: `${coupon}-${discount}` }));
      expect(container.textContent?.includes('account_info:redeem_coupon')).toBe(coupon);
      expect(container.textContent?.includes('account_info:discount_coupon')).toBe(discount);
    }
    state.owner = false;
    await render(React.createElement(AccountInfo, { key: 'non-owner' }));
    expect(container.textContent).not.toContain('account_info:redeem_coupon');
    expect(container.textContent).not.toContain('account_info:discount_coupon');
  });
  it('uses current payment-form links and removes the cleared link without payment requests', async () => {
    for (const phase of ['a', 'b', '']) {
      const url = phase ? `https://pay-${phase}.example.test/form` : '';
      publish(false, false, url);
      await render(
        React.createElement(QRCodePayModal, {
          key: phase,
          billId: 'owned-bill',
          readPrice: 1,
          payment: BillPayWayEnum.bank,
          markdown: 'owned payment explanation'
        })
      );
      expect([...container.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual(
        url ? [url] : []
      );
    }
  });
});
