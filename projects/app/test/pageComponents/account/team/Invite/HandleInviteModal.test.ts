import React from 'react';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
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
  toast: vi.fn(),
  effects: [] as (() => void | (() => void))[],
  invitationInfo: undefined as
    | {
        alreadyJoined: boolean;
        teamName?: string;
        creatorUsername?: string;
        creatorMemberName?: string;
      }
    | undefined,
  manualRequestOptions: undefined as
    | {
        onSuccess?: (data: { teamId: string }) => Promise<void> | void;
        onError?: (error: { statusText?: string }) => Promise<void> | void;
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
  useUserStore: () => ({ initUserInfo: mocks.initUserInfo })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { teamMode: 'multi' } })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));
vi.mock('@fastgpt/web/i18n/useClientTranslation', () => ({
  useClientTranslation: () => ({ t: (key: string) => key })
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

  it('releases the action without rendering a modal when the user already joined', async () => {
    mocks.invitationInfo = { alreadyJoined: true };
    mocks.router.replace.mockRejectedValue(new Error('navigation cancelled'));
    const onFinish = await render();

    await vi.waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));

    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'error',
      title: 'account_team:already_joined'
    });
  });

  it('clears the invitation when accepting fails because it is no longer usable', async () => {
    const onFinish = await render();

    await mocks.manualRequestOptions?.onError?.({
      statusText: TeamErrEnum.youHaveBeenInTheTeam
    });

    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'error',
      title: 'account_team:already_joined'
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(mocks.router.replace).toHaveBeenCalledWith('/account/team?tab=member', undefined, {
      shallow: true
    });
  });

  it('does not report a switch failure when only route cleanup fails after accepting', async () => {
    mocks.invitationInfo = {
      alreadyJoined: false,
      teamName: 'Team',
      creatorUsername: 'Creator'
    };
    mocks.router.replace.mockRejectedValue(new Error('navigation cancelled'));
    const onFinish = await render();
    await vi.waitFor(() => expect(mocks.manualRequestOptions).toBeDefined());

    await mocks.manualRequestOptions?.onSuccess?.({ teamId: 'team-2' });

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(mocks.switchTeam).toHaveBeenCalledWith('team-2');
    expect(mocks.router.reload).toHaveBeenCalledTimes(1);
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'account_team:switch_team_failed' })
    );
  });
});
