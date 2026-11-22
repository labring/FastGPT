import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SecondaryNavigationTab } from '@/pageComponents/common/SecondaryNavigationContainer';

const state = vi.hoisted(() => ({
  feConfigs: {} as Record<string, any>,
  hasManagePer: false,
  hasApikeyCreatePer: false
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: state.feConfigs })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({
    userInfo: {
      team: {
        permission: {
          hasManagePer: state.hasManagePer,
          hasApikeyCreatePer: state.hasApikeyCreatePer
        }
      }
    },
    setUserInfo: vi.fn()
  })
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/account/info', replace: vi.fn() })
}));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({ openConfirm: vi.fn(), ConfirmModal: () => null })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/pageComponents/common/SecondaryNavigationContainer', () => ({
  default: ({ tabs }: { tabs: SecondaryNavigationTab<string>[] }) =>
    React.createElement(
      'pre',
      null,
      JSON.stringify(
        tabs.map((tab) => ({ value: tab.value, dividerAfter: Boolean(tab.dividerAfter) }))
      )
    )
}));

import AccountContainer from '@/pageComponents/account/AccountContainer';

const parseRenderedTabs = (html: string) => {
  const match = html.match(/<pre>(.*)<\/pre>/);
  return JSON.parse(match?.[1].replace(/&quot;/g, '"') ?? '[]') as {
    value: string;
    dividerAfter: boolean;
  }[];
};

describe('AccountContainer', () => {
  it('places dividerAfter on apikey when all plus tabs and apikey permission are enabled', () => {
    state.feConfigs = {
      isPlus: true,
      show_pay: true,
      customDomain: { enable: true }
    };
    state.hasManagePer = true;
    state.hasApikeyCreatePer = true;

    const tabs = parseRenderedTabs(
      renderToStaticMarkup(React.createElement(AccountContainer, null, 'body'))
    );
    const dividerTabs = tabs.filter((tab) => tab.dividerAfter).map((tab) => tab.value);

    expect(dividerTabs).toEqual(['apikey']);
    expect(tabs.findIndex((tab) => tab.value === 'inform')).toBe(
      tabs.findIndex((tab) => tab.value === 'apikey') + 1
    );
  });

  it('falls back dividerAfter to info when optional primary tabs and notifications are hidden', () => {
    state.feConfigs = { isPlus: false };
    state.hasManagePer = false;
    state.hasApikeyCreatePer = false;

    const tabs = parseRenderedTabs(
      renderToStaticMarkup(React.createElement(AccountContainer, null, 'body'))
    );

    expect(tabs).toEqual([
      { value: 'info', dividerAfter: true },
      { value: 'setting', dividerAfter: false },
      { value: 'loginout', dividerAfter: false }
    ]);
  });
});
