import React from 'react';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { ToastHandledError } from '@fastgpt/global/common/error/utils';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  router: {
    asPath: '/account/team?invitelinkid=invite-1&tab=member',
    replace: vi.fn(),
    reload: vi.fn()
  },
  getInvitationInfo: vi.fn(),
  acceptInvitation: vi.fn(),
  switchTeam: vi.fn(),
  initUserInfo: vi.fn(),
  navigate: vi.fn(),
  saveInvitationResultToast: vi.fn(),
  currentTeamId: 'team-1',
  toast: vi.fn(),
  effects: [] as (() => void | (() => void))[],
  invitationInfo: undefined as
    | {
        alreadyJoined: boolean;
        teamId: string;
        teamName?: string;
        creatorUsername?: string;
        creatorMemberName?: string;
      }
    | undefined,
  manualRequestOptions: undefined as
    | {
        errorToast?: string;
        onSuccess?: (data: { teamId: string }) => Promise<void> | void;
        onError?: (error: { statusText?: string; message?: string }) => Promise<void> | void;
      }
    | undefined
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (effect: () => void | (() => void)) => {
    mocks.effects.push(effect);
  }
}));
vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('@/web/support/user/team/api', () => ({
  getInvitationInfo: mocks.getInvitationInfo,
  postAcceptInvitationWithMemberName: mocks.acceptInvitation,
  putSwitchTeam: mocks.switchTeam
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({
    userInfo: { _id: 'user-1', team: { teamId: mocks.currentTeamId } },
    initUserInfo: mocks.initUserInfo
  })
}));
vi.mock('@/web/support/user/team/useInvitationResultToast', () => ({
  saveInvitationResultToast: mocks.saveInvitationResultToast
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { teamMode: 'multi' } })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/pageComponents/account/team/MemberNameForm/useMemberNameForm', () => ({
  useMemberNameForm: () => ({
    memberName: '',
    nameError: '',
    showNameError: false,
    markInteracted: vi.fn(),
    onNameChange: vi.fn(),
    parseMemberName: () => 'Member'
  })
}));
vi.mock('@/pageComponents/account/team/MemberNameForm/styles', () => ({
  memberNameButtonStyles: {},
  memberNameInputStyles: {},
  memberNameLabelStyles: {}
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: <TData>(service: () => Promise<TData>, options: Record<string, any>) => {
    if (options.manual) {
      mocks.manualRequestOptions = options;
    } else {
      mocks.effects.push(() => {
        void service().catch((error) => options.onError?.(error));
      });
    }

    return {
      data: options.manual ? undefined : mocks.invitationInfo,
      loading: false,
      runAsync: vi.fn()
    };
  }
}));
vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const Element = ({ children }: { children?: React.ReactNode }) =>
    createElement('div', {}, children);
  return { Box: Element, Button: Element, FormControl: Element, Input: Element, Flex: Element };
});
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children }: { children?: React.ReactNode }) => children
}));

import HandleInviteModal from '@/pageComponents/account/team/Invite/HandleInviteModal';

describe('HandleInviteModal', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  const render = async (onFinish = vi.fn()) => {
    renderToStaticMarkup(
      React.createElement(HandleInviteModal, { inviteLinkId: 'invite-1', onFinish })
    );
    mocks.effects.forEach((effect) => effect());
    return onFinish;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('React', React);
    mocks.router.asPath = '/account/team?invitelinkid=invite-1&tab=member';
    vi.stubGlobal('window', {
      location: {
        href: 'https://fastgpt.example.com/account/team?invitelinkid=invite-1&tab=member',
        replace: mocks.navigate
      }
    });
    mocks.currentTeamId = 'team-1';
    mocks.effects = [];
    mocks.manualRequestOptions = undefined;
    mocks.invitationInfo = undefined;
    mocks.getInvitationInfo.mockResolvedValue({
      alreadyJoined: false,
      teamName: 'Team',
      creatorUsername: 'Creator'
    });
    mocks.router.replace.mockResolvedValue(true);
    mocks.switchTeam.mockResolvedValue(undefined);
    mocks.initUserInfo.mockResolvedValue(undefined);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('releases the action when the invitation request and route cleanup both fail', async () => {
    mocks.getInvitationInfo.mockRejectedValue(new Error('invalid invitation'));
    mocks.router.replace.mockRejectedValue(new Error('navigation cancelled'));
    const onFinish = await render();

    await vi.waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));

    expect(mocks.router.replace).toHaveBeenCalledWith('/account/team?tab=member', undefined, {
      shallow: true
    });
    expect(consoleError).toHaveBeenCalledWith(
      '[Team invitation] Failed to clear invitation route:',
      expect.any(Error)
    );
  });

  it('navigates once without refreshing user info or releasing the invitation lock first', async () => {
    mocks.invitationInfo = { alreadyJoined: true, teamId: 'team-2' };
    const onFinish = await render();
    mocks.effects.forEach((effect) => effect());

    await vi.waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));

    expect(mocks.switchTeam).toHaveBeenCalledExactlyOnceWith('team-2');
    expect(mocks.saveInvitationResultToast).toHaveBeenCalledExactlyOnceWith({
      userId: 'user-1',
      teamId: 'team-2',
      status: 'info'
    });
    expect(mocks.navigate).toHaveBeenCalledWith('/account/team?tab=member');
    expect(mocks.initUserInfo).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.router.reload).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.switchTeam.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveInvitationResultToast.mock.invocationCallOrder[0]
    );
    expect(mocks.saveInvitationResultToast.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.navigate.mock.invocationCallOrder[0]
    );
  });

  it.each(['/fastgpt', '/zh-CN', '/fastgpt/zh-CN'])(
    'preserves the browser path prefix %s, other query parameters and hash when switching teams',
    async (prefix) => {
      // Next Router 的 asPath 不含部署和语言前缀，整页跳转必须保留浏览器中的实际路径。
      mocks.router.asPath =
        '/account/team?invitelinkid=invite-1&inviteLinkId=invite-1&tab=member#members';
      window.location.href = `https://fastgpt.example.com${prefix}${mocks.router.asPath}`;
      mocks.invitationInfo = { alreadyJoined: true, teamId: 'team-2' };
      await render();

      await vi.waitFor(() =>
        expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith(
          `${prefix}/account/team?tab=member#members`
        )
      );
    }
  );

  it('only clears the link and shows info for 3 seconds when already in the target team', async () => {
    mocks.invitationInfo = { alreadyJoined: true, teamId: 'team-1' };
    const onFinish = await render();

    await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));

    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'info',
      title: 'account_team:already_joined',
      duration: 3000
    });
    expect(mocks.router.replace).toHaveBeenCalledWith('/account/team?tab=member', undefined, {
      shallow: true
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(mocks.switchTeam).not.toHaveBeenCalled();
    expect(mocks.initUserInfo).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.saveInvitationResultToast).not.toHaveBeenCalled();
  });

  it('still shows info and releases the action if clearing a same-team invitation fails', async () => {
    mocks.invitationInfo = { alreadyJoined: true, teamId: 'team-1' };
    mocks.router.replace.mockRejectedValue(new Error('navigation cancelled'));
    const onFinish = await render();

    await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'info' }));
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('defers the info toast when the user joins before accepting', async () => {
    mocks.invitationInfo = { alreadyJoined: false, teamId: 'team-2' };
    const onFinish = await render();

    await mocks.manualRequestOptions?.onError?.({
      statusText: TeamErrEnum.youHaveBeenInTheTeam
    });

    expect(mocks.manualRequestOptions?.errorToast).toBe('');
    expect(mocks.saveInvitationResultToast).toHaveBeenCalledWith({
      userId: 'user-1',
      teamId: 'team-2',
      status: 'info'
    });
    expect(mocks.switchTeam).toHaveBeenCalledWith('team-2');
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.initUserInfo).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('cleans up and shows a warning when switching fails', async () => {
    mocks.invitationInfo = { alreadyJoined: true, teamId: 'team-2' };
    mocks.switchTeam.mockRejectedValueOnce(new Error('switch failed'));
    const onFinish = await render();

    await vi.waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));

    expect(mocks.initUserInfo).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      status: 'warning',
      title: 'account_team:switch_team_failed'
    });
    expect(mocks.router.replace).toHaveBeenCalledTimes(1);
    expect(mocks.saveInvitationResultToast).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('releases the action even when switching and the fallback user refresh both fail', async () => {
    mocks.invitationInfo = { alreadyJoined: true, teamId: 'team-2' };
    mocks.switchTeam.mockRejectedValueOnce(new Error('switch failed'));
    mocks.initUserInfo.mockRejectedValueOnce(new Error('refresh failed'));
    const onFinish = await render();

    await vi.waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));

    expect(consoleError).toHaveBeenCalledWith(
      '[Team invitation] Failed to refresh user info:',
      expect.any(Error)
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('clears invalid invitations while keeping their error toast', async () => {
    const onFinish = await render();

    await mocks.manualRequestOptions?.onError?.({
      statusText: TeamErrEnum.invitationLinkInvalid,
      message: 'Invitation expired'
    });

    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      status: 'error',
      title: 'Invitation expired'
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(mocks.switchTeam).not.toHaveBeenCalled();
    expect(mocks.router.reload).not.toHaveBeenCalled();
  });

  it('keeps a retryable invitation open and displays other errors', async () => {
    const onFinish = await render();

    await mocks.manualRequestOptions?.onError?.({ message: 'Network error' });

    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      status: 'error',
      title: 'Network error'
    });
    expect(onFinish).not.toHaveBeenCalled();
    expect(mocks.switchTeam).not.toHaveBeenCalled();
  });

  it('does not repeat an error toast already handled by the request layer', async () => {
    await render();

    await mocks.manualRequestOptions?.onError?.(new ToastHandledError('Already handled'));

    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('defers the success toast until after navigation when accepting a new invitation', async () => {
    mocks.invitationInfo = { alreadyJoined: false, teamId: 'team-2' };
    const onFinish = await render();

    await mocks.manualRequestOptions?.onSuccess?.({ teamId: 'team-2' });

    expect(mocks.switchTeam).toHaveBeenCalledWith('team-2');
    expect(mocks.saveInvitationResultToast).toHaveBeenCalledWith({
      userId: 'user-1',
      teamId: 'team-2',
      status: 'success'
    });
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('/account/team?tab=member');
    expect(mocks.initUserInfo).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
