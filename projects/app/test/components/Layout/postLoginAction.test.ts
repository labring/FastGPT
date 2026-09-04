import { describe, expect, it } from 'vitest';
import {
  finishPostLoginAction,
  getNextPostLoginAction,
  isPostLoginActionRoute,
  startPostLoginAction,
  type OneTimePostLoginAction,
  type PostLoginAction,
  type PostLoginActionState
} from '@/components/Layout/postLoginAction';

const getAction = (
  completed: OneTimePostLoginAction[] = [],
  hasImportantInform = true,
  currentAction?: PostLoginAction
) =>
  getNextPostLoginAction({
    canStart: true,
    currentAction,
    completed: new Set(completed),
    inviteLinkId: 'invite-1',
    hasPendingMemberName: true,
    shouldShowContact: true,
    contactHandled: false,
    isPlus: true,
    hasImportantInform
  });

describe('post login action order', () => {
  it('returns actions in the documented order', () => {
    expect(getAction()).toBe('invitation');
    expect(getAction(['invitation'])).toBe('memberName');
    expect(getAction(['invitation', 'memberName'])).toBe('resetExpiredPassword');
    expect(getAction(['invitation', 'memberName', 'resetExpiredPassword'])).toBe('contact');
    expect(getAction(['invitation', 'memberName', 'resetExpiredPassword', 'contact'])).toBe(
      'systemMessage'
    );
    expect(
      getAction(['invitation', 'memberName', 'resetExpiredPassword', 'contact', 'systemMessage'])
    ).toBe('importantInform');
    expect(
      getAction(
        ['invitation', 'memberName', 'resetExpiredPassword', 'contact', 'systemMessage'],
        false
      )
    ).toBe('activityAd');
    expect(
      getAction(
        [
          'invitation',
          'memberName',
          'resetExpiredPassword',
          'contact',
          'systemMessage',
          'activityAd'
        ],
        false
      )
    ).toBe('enterpriseAuthNotice');
  });

  it('skips contact after it has been handled and returns no action when all candidates are complete', () => {
    expect(
      getNextPostLoginAction({
        canStart: true,
        completed: new Set<OneTimePostLoginAction>([
          'memberName',
          'resetExpiredPassword',
          'contact',
          'systemMessage',
          'activityAd',
          'enterpriseAuthNotice'
        ]),
        inviteLinkId: '',
        hasPendingMemberName: false,
        shouldShowContact: true,
        contactHandled: true,
        isPlus: true,
        hasImportantInform: false
      })
    ).toBeUndefined();

    expect(
      getNextPostLoginAction({
        canStart: true,
        completed: new Set<OneTimePostLoginAction>([
          'memberName',
          'resetExpiredPassword',
          'systemMessage',
          'activityAd',
          'enterpriseAuthNotice'
        ]),
        inviteLinkId: '',
        hasPendingMemberName: false,
        shouldShowContact: true,
        contactHandled: true,
        isPlus: true,
        hasImportantInform: false
      })
    ).toBeUndefined();
  });

  it('does not let a current action bypass the startup guard', () => {
    expect(
      getNextPostLoginAction({
        canStart: false,
        currentAction: 'activityAd',
        completed: new Set(),
        inviteLinkId: '',
        hasPendingMemberName: false,
        shouldShowContact: false,
        contactHandled: false,
        isPlus: true,
        hasImportantInform: false
      })
    ).toBeUndefined();
  });

  it('supports non-plus member-name actions without adding plus-only actions', () => {
    expect(
      getNextPostLoginAction({
        canStart: true,
        completed: new Set(),
        inviteLinkId: '',
        hasPendingMemberName: true,
        shouldShowContact: false,
        contactHandled: false,
        isPlus: false,
        hasImportantInform: true
      })
    ).toBe('memberName');
  });
  it('skips actions completed after a failed or dismissed attempt', () => {
    expect(getAction(['invitation', 'memberName', 'resetExpiredPassword', 'contact'])).toBe(
      'systemMessage'
    );
    expect(
      getNextPostLoginAction({
        canStart: true,
        completed: new Set<OneTimePostLoginAction>([
          'invitation',
          'memberName',
          'resetExpiredPassword',
          'contact',
          'systemMessage',
          'activityAd'
        ]),
        inviteLinkId: '',
        hasPendingMemberName: false,
        shouldShowContact: false,
        contactHandled: true,
        isPlus: true,
        hasImportantInform: false
      })
    ).toBe('enterpriseAuthNotice');
  });

  it('keeps the current action ahead of newly arrived notifications', () => {
    expect(getAction([], true, 'activityAd')).toBe('activityAd');
  });

  it('can enqueue important notifications again after the first login flow', () => {
    const completed: OneTimePostLoginAction[] = [
      'invitation',
      'memberName',
      'resetExpiredPassword',
      'contact',
      'systemMessage',
      'activityAd',
      'enterpriseAuthNotice'
    ];

    expect(getAction(completed, true)).toBe('importantInform');
    expect(getAction(completed, false)).toBeUndefined();
  });

  it('does not start before the derived startup conditions are ready', () => {
    expect(
      getNextPostLoginAction({
        canStart: false,
        completed: new Set(),
        inviteLinkId: 'invite-1',
        hasPendingMemberName: true,
        shouldShowContact: true,
        contactHandled: false,
        isPlus: true,
        hasImportantInform: true
      })
    ).toBeUndefined();
  });

  it('recognizes every route excluded from post-login actions', () => {
    expect(
      [
        '/',
        '/login',
        '/login/provider',
        '/login/fastlogin',
        '/login/sso',
        '/appStore',
        '/account/cancel',
        '/chat',
        '/chat/share',
        '/tools/price',
        '/price',
        '/logout'
      ].every((pathname) => !isPostLoginActionRoute(pathname))
    ).toBe(true);
    expect(isPostLoginActionRoute('/dashboard/agent')).toBe(true);
  });
  it('does not start on the account cancellation page', () => {
    expect(isPostLoginActionRoute('/account/cancel')).toBe(false);
    expect(
      getNextPostLoginAction({
        canStart: isPostLoginActionRoute('/account/cancel'),
        completed: new Set(),
        inviteLinkId: 'invite-1',
        hasPendingMemberName: true,
        shouldShowContact: true,
        contactHandled: false,
        isPlus: true,
        hasImportantInform: true
      })
    ).toBeUndefined();
  });
});

describe('post login action state', () => {
  const initialState: PostLoginActionState = {
    key: 'user-1:team-1',
    completed: new Set(['memberName'])
  };

  it('locks one current action and preserves it for the same user and team', () => {
    const started = startPostLoginAction({
      state: initialState,
      key: 'user-1:team-1',
      action: 'activityAd'
    });

    expect(started.currentAction).toBe('activityAd');
    expect(
      startPostLoginAction({
        state: started,
        key: 'user-1:team-1',
        action: 'importantInform'
      })
    ).toBe(started);
  });

  it('resets completed actions when the user or team key changes', () => {
    const started = startPostLoginAction({
      state: initialState,
      key: 'user-2:team-2',
      action: 'importantInform'
    });

    expect(started).toEqual({
      key: 'user-2:team-2',
      completed: new Set(),
      currentAction: 'importantInform'
    });
  });

  it('releases important notifications without marking them permanently complete', () => {
    const started = startPostLoginAction({
      state: initialState,
      key: 'user-1:team-1',
      action: 'importantInform'
    });

    expect(
      finishPostLoginAction({
        state: started,
        key: 'user-1:team-1',
        action: 'importantInform'
      })
    ).toEqual(initialState);
  });

  it('does not release an action when the current action or key does not match', () => {
    const started = startPostLoginAction({
      state: initialState,
      key: 'user-1:team-1',
      action: 'activityAd'
    });

    expect(
      finishPostLoginAction({
        state: started,
        key: 'user-1:team-1',
        action: 'systemMessage'
      })
    ).toBe(started);
    expect(
      finishPostLoginAction({
        state: started,
        key: 'user-2:team-2',
        action: 'activityAd'
      })
    ).toBe(started);
  });
  it('marks one-time actions complete when releasing them', () => {
    const started = startPostLoginAction({
      state: initialState,
      key: 'user-1:team-1',
      action: 'activityAd'
    });

    expect(
      finishPostLoginAction({
        state: started,
        key: 'user-1:team-1',
        action: 'activityAd'
      })
    ).toEqual({
      key: 'user-1:team-1',
      completed: new Set(['memberName', 'activityAd']),
      currentAction: undefined
    });
  });

  it('ignores stale completion callbacks from another user or team', () => {
    const started = startPostLoginAction({
      state: initialState,
      key: 'user-1:team-1',
      action: 'activityAd'
    });

    expect(
      finishPostLoginAction({
        state: started,
        key: 'user-2:team-2',
        action: 'activityAd'
      })
    ).toBe(started);
  });
});
