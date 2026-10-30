import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  manage: true,
  subPlans: undefined as { standard?: Record<string, never> } | undefined,
  standard: undefined as
    | { auditLogStoreDuration?: number; startTime?: Date; expiredTime?: Date }
    | undefined
}));
vi.mock('next/router', () => ({ useRouter: () => ({ query: { teamTab: 'audit' } }) }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: (select: (value: { subPlans: typeof state.subPlans }) => unknown) =>
    select({ subPlans: state.subPlans })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({
    userInfo: { team: { teamId: 'team-a', permission: { hasManagePer: state.manage } } },
    teamPlanStatus: { standard: state.standard }
  })
}));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, select: (value: unknown) => unknown) =>
    select({ teamSize: 1 })
}));
vi.mock('@/pageComponents/account/team/context', () => ({
  TeamContext: {},
  TeamModalContextProvider: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('@/pageComponents/account/AccountContainer', () => ({
  default: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('@/pageComponents/account/TeamSelector', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Tabs/FillRowTabs', () => ({ default: () => null }));
vi.mock('@chakra-ui/react', () => {
  const Container = ({ children }: React.PropsWithChildren) =>
    React.createElement('div', null, children);
  return { Box: Container, Flex: Container };
});
vi.mock('next/dynamic', () => ({
  default: (load: () => Promise<unknown>) => {
    const isAudit = load.toString().includes('/Audit/');
    return ({ Tabs }: { Tabs: React.ReactNode }) =>
      React.createElement('section', null, Tabs, isAudit ? 'audit-content' : 'other-content');
  }
}));

import Team from '@/pages/account/team';

const render = () => renderToStaticMarkup(React.createElement(Team));

describe('team audit access', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
    state.manage = true;
    state.subPlans = undefined;
    state.standard = undefined;
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([undefined, {}])('allows managers when subscriptions are disabled: %j', (subPlans) => {
    state.subPlans = subPlans;
    expect(render()).toContain('audit-content');
  });

  it('denies ordinary members even when subscriptions are disabled', () => {
    state.manage = false;
    expect(render()).not.toContain('audit-content');
    expect(render()).toContain('common:not_permission');
  });

  it.each([
    undefined,
    { auditLogStoreDuration: 0 },
    { auditLogStoreDuration: 365, expiredTime: new Date('2020-01-01') },
    { auditLogStoreDuration: 365, startTime: new Date('2099-01-01') }
  ])('denies unavailable plans when subscriptions are enabled: %j', (standard) => {
    state.subPlans = { standard: {} };
    state.standard = standard;
    expect(render()).not.toContain('audit-content');
    expect(render()).toContain('common:not_permission');
  });

  it('allows managers with an available audit plan', () => {
    state.subPlans = { standard: {} };
    state.standard = { auditLogStoreDuration: 365 };
    expect(render()).toContain('audit-content');
  });
});
