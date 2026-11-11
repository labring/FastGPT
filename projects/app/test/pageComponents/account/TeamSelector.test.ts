import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  router: {
    pathname: '/account/info',
    replace: vi.fn(),
    reload: vi.fn()
  },
  userInfo: undefined as any,
  setLoading: vi.fn(),
  resetChatCache: vi.fn(),
  getTeamList: vi.fn(),
  putSwitchTeam: vi.fn(),
  getAdminTeamSelectorList: vi.fn(),
  putAdminSwitchTeam: vi.fn(),
  teamsData: [] as any[],
  lastMySelectProps: undefined as any
}));

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: mocks.userInfo })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ setLoading: mocks.setLoading })
}));
vi.mock('@/web/core/chat/context/useChatStore', () => ({
  useChatStore: () => ({ resetChatCache: mocks.resetChatCache })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/web/support/user/team/api', () => ({
  getTeamList: mocks.getTeamList,
  putSwitchTeam: mocks.putSwitchTeam
}));
vi.mock('@/web/admin/team/api', () => ({
  getAdminTeamSelectorList: mocks.getAdminTeamSelectorList,
  putAdminSwitchTeam: mocks.putAdminSwitchTeam
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (fn: (...args: any[]) => any, options?: { manual?: boolean }) => {
    if (options?.manual === false) {
      return { data: mocks.teamsData, loading: false };
    }
    return {
      runAsync: fn,
      loading: false
    };
  }
}));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({
  default: (props: any) => {
    mocks.lastMySelectProps = props;
    return React.createElement('div', { 'data-testid': 'my-select' });
  }
}));

import TeamSelector from '@/pageComponents/account/TeamSelector';

describe('TeamSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lastMySelectProps = undefined;
    mocks.router.pathname = '/account/info';
  });

  it('removes manage_team item globally, enables search and renders pure team names for normal users', async () => {
    mocks.userInfo = {
      _id: 'u-1',
      username: 'alice',
      team: { teamId: 't-1', teamName: 'Alice Team', avatar: '/a.png' }
    };
    mocks.teamsData = [
      { teamId: 't-1', teamName: 'Alice Team', avatar: '/a.png' },
      { teamId: 't-2', teamName: 'Shared Team', avatar: '/b.png' }
    ];

    renderToStaticMarkup(React.createElement(TeamSelector));

    expect(mocks.lastMySelectProps.isSearch).toBe(true);
    expect(mocks.lastMySelectProps.onSearchChange).toBeUndefined();
    expect(mocks.lastMySelectProps.list).toEqual([
      { icon: '/a.png', iconSize: '1.25rem', label: 'Alice Team', value: 't-1' },
      { icon: '/b.png', iconSize: '1.25rem', label: 'Shared Team', value: 't-2' }
    ]);
    expect(mocks.lastMySelectProps.list.some((item: any) => item.value === 'manage')).toBe(false);

    await mocks.lastMySelectProps.onChange('t-2');
    expect(mocks.putSwitchTeam).toHaveBeenCalledWith('t-2');
    expect(mocks.putAdminSwitchTeam).not.toHaveBeenCalled();
    expect(mocks.resetChatCache).toHaveBeenCalledTimes(1);
    expect(mocks.router.reload).toHaveBeenCalledTimes(1);
  });

  it('wires server-backed search and admin switch endpoint for root user without cancellation redirect', async () => {
    mocks.userInfo = {
      _id: 'root-id',
      username: 'root',
      team: { teamId: 'root-team', teamName: 'Root Team', avatar: '/r.png' }
    };
    mocks.teamsData = [
      {
        teamId: 'tenant-1',
        teamName: 'Tenant One',
        avatar: '/t1.png',
        accountCancellation: { status: 'pending' }
      }
    ];

    renderToStaticMarkup(React.createElement(TeamSelector));

    expect(mocks.lastMySelectProps.isSearch).toBe(true);
    expect(typeof mocks.lastMySelectProps.onSearchChange).toBe('function');
    // 当前团队不在列表切片中时应自动保留回显，且仅展示纯团队名
    expect(mocks.lastMySelectProps.list.map((item: any) => item.label)).toEqual([
      'Root Team',
      'Tenant One'
    ]);

    await mocks.lastMySelectProps.onChange('tenant-1');
    expect(mocks.putAdminSwitchTeam).toHaveBeenCalledWith({ teamId: 'tenant-1' });
    expect(mocks.putSwitchTeam).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalledWith('/account/cancel');
    expect(mocks.router.reload).toHaveBeenCalledTimes(1);
  });
});
