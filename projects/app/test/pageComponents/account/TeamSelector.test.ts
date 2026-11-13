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
  adminTeamsData: [] as any[],
  adminScrollData: (({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'admin-scroll-data' }, children)) as any,
  isAdminInitialLoading: false,
  lastScrollPaginationArgs: undefined as any,
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
vi.mock('@fastgpt/web/hooks/useScrollPagination', () => ({
  useScrollPagination: (api: any, options: any) => {
    mocks.lastScrollPaginationArgs = { api, options };
    return {
      data: mocks.adminTeamsData,
      ScrollData: mocks.adminScrollData,
      isInitialLoading: mocks.isAdminInitialLoading
    };
  }
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({
  default: (props: any) => React.createElement('img', { src: props.src })
}));
vi.mock('@fastgpt/web/components/common/Tag', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('span', { 'data-testid': 'my-team-tag' }, children)
}));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({
  default: (props: any) => {
    mocks.lastMySelectProps = props;
    return React.createElement('div', { 'data-testid': 'my-select' });
  }
}));

import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import TeamSelector from '@/pageComponents/account/TeamSelector';

describe('TeamSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lastMySelectProps = undefined;
    mocks.lastScrollPaginationArgs = undefined;
    mocks.teamsData = [];
    mocks.adminTeamsData = [];
    mocks.isAdminInitialLoading = false;
    mocks.router.pathname = '/account/info';
  });

  it('pins owner teams first with "my_team" tag, enables search, and keeps pure names for non-owner teams', async () => {
    mocks.userInfo = {
      _id: 'u-1',
      username: 'alice',
      team: {
        teamId: 't-1',
        teamName: 'Alice Team',
        avatar: '/a.png',
        role: TeamMemberRoleEnum.owner
      }
    };
    mocks.teamsData = [
      { teamId: 't-2', teamName: 'Shared Team', avatar: '/b.png', role: TeamMemberRoleEnum.member },
      { teamId: 't-1', teamName: 'Alice Team', avatar: '/a.png', role: TeamMemberRoleEnum.owner }
    ];

    renderToStaticMarkup(React.createElement(TeamSelector));

    expect(mocks.lastScrollPaginationArgs.options.disabled).toBe(true);
    expect(mocks.lastMySelectProps.isSearch).toBe(true);
    expect(mocks.lastMySelectProps.onSearchChange).toBeUndefined();
    expect(mocks.lastMySelectProps.ScrollData).toBeUndefined();
    expect(mocks.lastMySelectProps.list.map((item: any) => item.value)).toEqual(['t-1', 't-2']);
    expect(mocks.lastMySelectProps.list.map((item: any) => item.searchText)).toEqual([
      'Alice Team',
      'Shared Team'
    ]);
    expect(renderToStaticMarkup(mocks.lastMySelectProps.list[0].label)).toContain('Alice Team');
    expect(renderToStaticMarkup(mocks.lastMySelectProps.list[0].label)).toContain(
      'account_team:my_team'
    );
    expect(mocks.lastMySelectProps.list[1].label).toBe('Shared Team');
    expect(renderToStaticMarkup(mocks.lastMySelectProps.valueLabel)).toContain('Alice Team');
    expect(renderToStaticMarkup(mocks.lastMySelectProps.valueLabel)).not.toContain(
      'account_team:my_team'
    );
    expect(mocks.lastMySelectProps.list.some((item: any) => item.value === 'manage')).toBe(false);

    await mocks.lastMySelectProps.onChange('t-2');
    expect(mocks.putSwitchTeam).toHaveBeenCalledWith('t-2');
    expect(mocks.putAdminSwitchTeam).not.toHaveBeenCalled();
    expect(mocks.resetChatCache).toHaveBeenCalledTimes(1);
    expect(mocks.router.reload).toHaveBeenCalledTimes(1);
  });

  it('wires scroll pagination, server-backed search, owner tag and admin switch endpoint for root user', async () => {
    mocks.userInfo = {
      _id: 'root-id',
      username: 'root',
      team: {
        teamId: 'tenant-1',
        teamName: 'Tenant One',
        avatar: '/t1.png'
      }
    };
    mocks.adminTeamsData = [
      {
        teamId: 'root-team',
        teamName: 'Root Team',
        avatar: '/r.png',
        isOwner: true
      }
    ];

    renderToStaticMarkup(React.createElement(TeamSelector));

    expect(mocks.lastScrollPaginationArgs.api).toBe(mocks.getAdminTeamSelectorList);
    expect(mocks.lastScrollPaginationArgs.options.disabled).toBe(false);
    expect(mocks.lastScrollPaginationArgs.options.pageSize).toBe(30);
    expect(mocks.lastMySelectProps.isSearch).toBe(true);
    expect(typeof mocks.lastMySelectProps.onSearchChange).toBe('function');
    expect(mocks.lastMySelectProps.ScrollData).toBe(mocks.adminScrollData);
    // 自有团队置顶且带“我的团队”标签，未在列表中的当前切换团队紧随其后回显纯团队名
    expect(mocks.lastMySelectProps.list.map((item: any) => item.value)).toEqual([
      'root-team',
      'tenant-1'
    ]);
    expect(renderToStaticMarkup(mocks.lastMySelectProps.list[0].label)).toContain('Root Team');
    expect(renderToStaticMarkup(mocks.lastMySelectProps.list[0].label)).toContain(
      'account_team:my_team'
    );
    expect(mocks.lastMySelectProps.list[1].label).toBe('Tenant One');

    await mocks.lastMySelectProps.onChange('tenant-1');
    expect(mocks.putAdminSwitchTeam).toHaveBeenCalledWith({ teamId: 'tenant-1' });
    expect(mocks.putSwitchTeam).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalledWith('/account/cancel');
    expect(mocks.router.reload).toHaveBeenCalledTimes(1);
  });
});
