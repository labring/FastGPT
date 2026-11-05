import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShareBrandSetting from '@/pageComponents/app/detail/Publish/Link/ShareBrandSetting';
import type { OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import commonZh from '@fastgpt/web/i18n/zh-CN/common.json';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  init: vi.fn(),
  getBrand: vi.fn(),
  toast: vi.fn(),
  refresh: vi.fn(),
  team: { teamId: 'team', tmbId: 'member' },
  config: { show_outlink_brand: true, isPlus: true },
  recharge: undefined as any
}));
vi.mock('@/web/support/outLink/api', () => ({
  getShareChatList: mocks.list,
  getOutLinkBrand: mocks.getBrand,
  putShareChat: mocks.save
}));
vi.mock('@/web/support/user/useUserStore', () => {
  const state = () => ({ userInfo: { team: mocks.team }, initTeamPlanStatus: mocks.init });
  return {
    useUserStore: Object.assign(state, {
      getState: state
    })
  };
});
vi.mock('@/web/common/system/useSystemStore', () => {
  const state = () => ({ feConfigs: mocks.config });
  return { useSystemStore: Object.assign(state, { getState: state }) };
});
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: translate })
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@/components/ProTip/ProModal', () => ({
  default: () => React.createElement('div', { id: 'pro-upgrade' })
}));
vi.mock('@/components/support/wallet/NotSufficientModal', () => ({
  RechargeModal: (props: any) => {
    mocks.recharge = props;
    return React.createElement('div', { id: 'recharge' });
  }
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: any) => React.createElement('div', {}, children),
  Flex: ({ children }: any) => React.createElement('div', {}, children),
  Switch: ({ isChecked, isDisabled, onChange }: any) =>
    React.createElement('input', {
      type: 'checkbox',
      checked: isChecked,
      disabled: isDisabled,
      onChange
    })
}));
const translate = (key: string) =>
  key === 'common:share_brand_plan_load_failed' ? commonZh.share_brand_plan_load_failed : key;
const share = {
  _id: 'link',
  appId: 'app',
  teamId: 'team',
  name: 'name',
  isShowBrand: true
} as OutLinkSchemaType;
let dom: JSDOM;
let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
const settle = async () => {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
};
const render = async (link = share) => {
  await act(async () =>
    root.render(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(ShareBrandSetting, {
          key: `${link._id}-${mocks.team.tmbId}`,
          share: link,
          onRefresh: () => mocks.refresh()
        })
      )
    )
  );
  await settle();
};
const reset = async () => {
  await act(async () => root.render(null));
  queryClient.clear();
};
const toggle = async () => {
  await act(async () => container.querySelector('input')!.click());
  await settle();
};
const checked = () => (container.querySelector('input') as HTMLInputElement).checked;

beforeEach(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.recharge = undefined;
  mocks.team = { teamId: 'team', tmbId: 'member' };
  mocks.config = { show_outlink_brand: true, isPlus: true };
  mocks.list.mockResolvedValue([share]);
  mocks.getBrand.mockReset().mockResolvedValue({ isShowBrand: true, canHideShareBrand: false });
  mocks.save.mockResolvedValue('share');
  mocks.refresh.mockResolvedValue(undefined);
  mocks.init.mockResolvedValue({ standard: { canHideShareBrand: false } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: 0 } },
    logger: { log: console.log, warn: console.warn, error: () => {} }
  });
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  queryClient.clear();
  container.remove();
  vi.useRealTimers();
  dom.window.close();
  vi.unstubAllGlobals();
});

describe('ShareBrandSetting', () => {
  it.each([
    { preference: undefined, entitled: false, expected: false },
    { preference: undefined, entitled: true, expected: false },
    { preference: false, entitled: false, expected: true },
    { preference: false, entitled: true, expected: false },
    { preference: true, entitled: false, expected: true },
    { preference: true, entitled: true, expected: true }
  ])(
    'shows effective state for saved=$preference and entitled=$entitled without saving',
    async ({ preference, entitled, expected }) => {
      const link = { ...share, _id: 'another-link', isShowBrand: preference };
      mocks.getBrand.mockResolvedValue({ isShowBrand: preference, canHideShareBrand: entitled });
      await render(link);
      expect(checked()).toBe(expected);
      expect(mocks.save).not.toHaveBeenCalled();
      expect(container.querySelector('#recharge')).toBeNull();
    }
  );
  it('opens the upgrade flow for a saved hidden link without saving its preference', async () => {
    const link = { ...share, _id: 'hidden-link', isShowBrand: false };
    mocks.getBrand.mockResolvedValue({ isShowBrand: false, canHideShareBrand: false });
    await render(link);
    expect(checked()).toBe(true);

    await toggle();
    expect(container.querySelector('#recharge')).toBeTruthy();
    expect(mocks.recharge.highlightShareBrand).toBe(true);
    expect(checked()).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => mocks.recharge.onClose());
    expect(checked()).toBe(true);
    expect(container.querySelector('#recharge')).toBeNull();
  });
  it('waits for entitlement loading before enabling the switch', async () => {
    expect(mocks.getBrand).toHaveBeenCalledWith({ id: 'link' });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.init).not.toHaveBeenCalled();
    await reset();
    let finish!: (status: unknown) => void;
    mocks.getBrand.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    await render();
    expect((container.querySelector('input') as HTMLInputElement).disabled).toBe(true);
    await act(async () => finish({ isShowBrand: true, canHideShareBrand: false }));
    await settle();
    expect((container.querySelector('input') as HTMLInputElement).disabled).toBe(false);
  });
  it('keeps the switch disabled when entitlement loading fails', async () => {
    await reset();
    mocks.getBrand.mockRejectedValue(new Error('failed to load plan'));
    await render();
    expect((container.querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect(mocks.toast).toHaveBeenCalledWith({ status: 'error', title: '获取套餐内容失败' });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(container.querySelector('button')).toBeNull();
  });
  it.each([null, undefined])(
    'toasts an empty initial plan response (%s) without adding UI controls',
    async (status) => {
      await reset();
      const link = { ...share, isShowBrand: false };
      mocks.getBrand.mockResolvedValue(status);
      await render(link);
      expect((container.querySelector('input') as HTMLInputElement).disabled).toBe(true);
      expect(checked()).toBe(false);
      expect(mocks.toast).toHaveBeenCalledWith({ status: 'error', title: '获取套餐内容失败' });
      expect(mocks.save).not.toHaveBeenCalled();
      expect(container.querySelector('#recharge')).toBeNull();

      expect(container.querySelector('button')).toBeNull();
    }
  );
  it.each([null, undefined, new Error('plan unavailable')])(
    'preserves the last known state on a failed manual entitlement refresh (%s)',
    async (status) => {
      const link = { ...share, _id: 'hidden-link', isShowBrand: false };
      mocks.getBrand.mockResolvedValue({ isShowBrand: false, canHideShareBrand: false });
      await render(link);
      expect(checked()).toBe(true);
      if (status instanceof Error) mocks.getBrand.mockRejectedValueOnce(status);
      else mocks.getBrand.mockResolvedValueOnce(status);

      await toggle();
      expect(checked()).toBe(true);
      expect(mocks.toast).toHaveBeenCalledWith({ status: 'error', title: '获取套餐内容失败' });
      expect(mocks.save).not.toHaveBeenCalled();
      expect(container.querySelector('#recharge')).toBeNull();
      expect(container.querySelector('#pro-upgrade')).toBeNull();

      mocks.getBrand.mockResolvedValue({ isShowBrand: false, canHideShareBrand: true });
      await toggle();
      expect(mocks.save).toHaveBeenCalledOnce();
      expect(checked()).toBe(false);
    }
  );
  it('waits for a successful save before changing the switch and refreshes the list', async () => {
    mocks.getBrand.mockResolvedValue({ isShowBrand: true, canHideShareBrand: true });
    let finish!: () => void;
    mocks.save.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    await toggle();
    expect(checked()).toBe(true);
    expect(mocks.save).toHaveBeenCalledWith({ _id: 'link', isShowBrand: false });
    await act(async () => finish());
    await settle();
    expect(checked()).toBe(false);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it('lets a historical link opt in without another entitlement query or a saved name', async () => {
    const link = { ...share, _id: 'historical-link', isShowBrand: undefined };
    mocks.getBrand.mockResolvedValue({ canHideShareBrand: false });
    await render(link);
    const queries = mocks.getBrand.mock.calls.length;
    expect(checked()).toBe(false);

    await toggle();
    expect(mocks.save).toHaveBeenCalledWith({ _id: 'historical-link', isShowBrand: true });
    expect(mocks.getBrand).toHaveBeenCalledTimes(queries);
    expect(checked()).toBe(true);
  });
  it('does not update the interface when saving completes after switching members', async () => {
    mocks.getBrand.mockResolvedValue({ isShowBrand: true, canHideShareBrand: true });
    let finish!: () => void;
    mocks.save.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    await toggle();
    expect(mocks.save).toHaveBeenCalledOnce();

    mocks.team = { teamId: 'team', tmbId: 'another-member' };
    await render();
    await act(async () => finish());
    await settle();
    expect(checked()).toBe(true);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'requires another manual toggle after purchasing a plan for saved preference %s',
    async (preference) => {
      const link = { ...share, _id: 'upgrade-link', isShowBrand: preference };
      mocks.getBrand.mockResolvedValue({ isShowBrand: preference, canHideShareBrand: false });
      await render(link);
      await toggle();
      expect(container.querySelector('#recharge')).toBeTruthy();
      const initCalls = mocks.getBrand.mock.calls.length;

      mocks.getBrand.mockResolvedValue({ isShowBrand: preference, canHideShareBrand: true });
      await act(async () => mocks.recharge.onPaySuccess());
      expect(mocks.getBrand).toHaveBeenCalledTimes(initCalls);
      expect(mocks.save).not.toHaveBeenCalled();
      expect(checked()).toBe(true);
      expect(container.querySelector('#recharge')).toBeNull();

      await toggle();
      expect(mocks.save).toHaveBeenCalledOnce();
      expect(mocks.save).toHaveBeenCalledWith({
        _id: 'upgrade-link',
        isShowBrand: false
      });
      expect(checked()).toBe(false);
    }
  );
  it('closes the upgrade modal if the team changes', async () => {
    await toggle();
    mocks.team = { teamId: 'another-team', tmbId: 'another-member' };
    await render();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(container.querySelector('#recharge')).toBeNull();
    expect((container.querySelector('input') as HTMLInputElement).disabled).toBe(true);
  });
  it('preserves the displayed state if a manual save fails', async () => {
    mocks.getBrand.mockResolvedValue({ isShowBrand: true, canHideShareBrand: true });
    mocks.save.mockRejectedValue(new Error('permission revoked'));
    await toggle();
    expect(checked()).toBe(true);
    expect(mocks.toast).toHaveBeenCalledWith({ status: 'error', title: 'permission revoked' });
  });
  it('does not report a saved preference as failed when refreshing the parent list fails', async () => {
    mocks.getBrand.mockResolvedValue({ isShowBrand: true, canHideShareBrand: true });
    mocks.refresh.mockRejectedValueOnce(new Error('list unavailable'));
    await toggle();
    expect(checked()).toBe(false);
    expect(mocks.toast).not.toHaveBeenCalled();
  });
  it('ignores an entitlement response that completes after switching members', async () => {
    let finish!: (status: unknown) => void;
    mocks.getBrand.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    await toggle();
    mocks.team = { teamId: 'another-team', tmbId: 'another-member' };
    await render();
    await act(async () => finish({ isShowBrand: true, canHideShareBrand: true }));
    await settle();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(container.querySelector('#recharge')).toBeNull();
  });
  it('uses the commercial upgrade modal for the open source edition', async () => {
    mocks.config.isPlus = false;
    await render();
    await toggle();
    expect(container.querySelector('#pro-upgrade')).toBeTruthy();
    expect(mocks.recharge).toBeUndefined();
  });
  it('removes the setting entirely when globally disabled', async () => {
    mocks.config.show_outlink_brand = false;
    await render();
    expect(container.querySelector('input')).toBeNull();
  });
});
