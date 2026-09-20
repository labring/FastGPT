import { describe, expect, it } from 'vitest';
import {
  finishPostLoginAction,
  getNextPostLoginAction,
  isMandatoryPostLoginActionRoute,
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
    canStartMandatory: true,
    canStartOptional: true,
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
        canStartMandatory: true,
        canStartOptional: true,
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
        canStartMandatory: true,
        canStartOptional: true,
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
        canStartMandatory: false,
        canStartOptional: false,
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
        canStartMandatory: true,
        canStartOptional: true,
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
        canStartMandatory: true,
        canStartOptional: true,
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
        canStartMandatory: false,
        canStartOptional: false,
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
    expect(isMandatoryPostLoginActionRoute('/account/cancel')).toBe(false);
    expect(
      getNextPostLoginAction({
        canStartMandatory: isMandatoryPostLoginActionRoute('/account/cancel'),
        canStartOptional: isPostLoginActionRoute('/account/cancel'),
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

  it('keeps notification-excluded routes open for mandatory actions', () => {
    expect(isPostLoginActionRoute('/chat')).toBe(false);
    expect(isMandatoryPostLoginActionRoute('/chat')).toBe(true);
    expect(isPostLoginActionRoute('/appStore')).toBe(false);
    expect(isMandatoryPostLoginActionRoute('/appStore')).toBe(true);
  });

  it('still starts invitation and member name when only mandatory actions are admitted', () => {
    expect(
      getNextPostLoginAction({
        canStartMandatory: true,
        canStartOptional: false,
        completed: new Set(),
        inviteLinkId: 'invite-1',
        hasPendingMemberName: true,
        shouldShowContact: true,
        contactHandled: false,
        isPlus: true,
        hasImportantInform: true
      })
    ).toBe('invitation');
    expect(
      getNextPostLoginAction({
        canStartMandatory: true,
        canStartOptional: false,
        completed: new Set(['invitation']),
        inviteLinkId: '',
        hasPendingMemberName: true,
        shouldShowContact: true,
        contactHandled: false,
        isPlus: true,
        hasImportantInform: true
      })
    ).toBe('memberName');
  });

  it('lets an invitation preempt a locked optional action hidden by the current route', () => {
    expect(
      getNextPostLoginAction({
        canStartMandatory: true,
        canStartOptional: false,
        currentAction: 'activityAd',
        completed: new Set(),
        inviteLinkId: 'invite-1',
        hasPendingMemberName: false,
        shouldShowContact: false,
        contactHandled: false,
        isPlus: true,
        hasImportantInform: false
      })
    ).toBe('invitation');
  });

  it('hides a locked optional action when no mandatory action is pending', () => {
    expect(
      getNextPostLoginAction({
        canStartMandatory: true,
        canStartOptional: false,
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

  it('keeps a locked mandatory action visible on notification-excluded routes', () => {
    expect(
      getNextPostLoginAction({
        canStartMandatory: true,
        canStartOptional: false,
        currentAction: 'memberName',
        completed: new Set(),
        inviteLinkId: '',
        hasPendingMemberName: true,
        shouldShowContact: false,
        contactHandled: false,
        isPlus: true,
        hasImportantInform: false
      })
    ).toBe('memberName');
  });

  it('does not start optional actions before the unread query settles', () => {
    expect(
      getNextPostLoginAction({
        canStartMandatory: true,
        canStartOptional: false,
        completed: new Set(['invitation', 'memberName']),
        inviteLinkId: '',
        hasPendingMemberName: false,
        shouldShowContact: true,
        contactHandled: false,
        isPlus: true,
        hasImportantInform: true
      })
    ).toBeUndefined();
  });

  it('recognizes every route excluded from mandatory actions', () => {
    expect(
      [
        '/',
        '/login',
        '/login/provider',
        '/login/fastlogin',
        '/login/sso',
        '/account/cancel',
        '/logout'
      ].every((pathname) => !isMandatoryPostLoginActionRoute(pathname))
    ).toBe(true);
    expect(isMandatoryPostLoginActionRoute('/dashboard/agent')).toBe(true);
  });
});

describe('post login action state', () => {
  const initialState: PostLoginActionState = {
    key: 'user-1:team-1',
    completed: new Set(['memberName'])
  };

  it('pauses a locked optional action while a mandatory action runs and restores it afterwards', () => {
    const optionalStarted = startPostLoginAction({
      state: initialState,
      key: 'user-1:team-1',
      action: 'activityAd'
    });
    const mandatoryStarted = startPostLoginAction({
      state: optionalStarted,
      key: 'user-1:team-1',
      action: 'invitation',
      linkId: 'invite-1'
    });

    expect(mandatoryStarted.currentAction).toBe('invitation');
    expect(mandatoryStarted.currentLinkId).toBe('invite-1');
    expect(mandatoryStarted.pausedOptionalAction).toBe('activityAd');

    const mandatoryFinished = finishPostLoginAction({
      state: mandatoryStarted,
      key: 'user-1:team-1',
      action: 'invitation'
    });

    expect(mandatoryFinished.currentAction).toBe('activityAd');
    expect(mandatoryFinished.currentLinkId).toBeUndefined();
    expect(mandatoryFinished.pausedOptionalAction).toBeUndefined();
    expect(mandatoryFinished.completed.has('invitation')).toBe(true);
    expect(mandatoryFinished.completed.has('activityAd')).toBe(false);
  });

  it('does not let another optional action preempt the current optional action', () => {
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

  it('snapshots the invite link when locking the invitation action', () => {
    const started = startPostLoginAction({
      state: initialState,
      key: 'user-1:team-1',
      action: 'invitation',
      linkId: 'invite-1'
    });

    expect(started.currentAction).toBe('invitation');
    expect(started.currentLinkId).toBe('invite-1');
  });

  it('keeps the invite link snapshot while the invitation action stays locked', () => {
    const started = startPostLoginAction({
      state: initialState,
      key: 'user-1:team-1',
      action: 'invitation',
      linkId: 'invite-1'
    });

    // the route query is cleared while the modal is open, so the lock must not be rewritten
    expect(
      startPostLoginAction({ state: started, key: 'user-1:team-1', action: 'memberName' })
    ).toBe(started);
    expect(started.currentLinkId).toBe('invite-1');
  });

  it('clears the invite link snapshot when the invitation action is released', () => {
    const started = startPostLoginAction({
      state: initialState,
      key: 'user-1:team-1',
      action: 'invitation',
      linkId: 'invite-1'
    });

    const finished = finishPostLoginAction({
      state: started,
      key: 'user-1:team-1',
      action: 'invitation'
    });

    expect(finished.currentLinkId).toBeUndefined();
    expect(finished.completed.has('invitation')).toBe(true);
  });

  it('does not carry an invite link snapshot into a non-invitation action', () => {
    const released = finishPostLoginAction({
      state: startPostLoginAction({
        state: initialState,
        key: 'user-1:team-1',
        action: 'invitation',
        linkId: 'invite-1'
      }),
      key: 'user-1:team-1',
      action: 'invitation'
    });

    expect(
      startPostLoginAction({ state: released, key: 'user-1:team-1', action: 'memberName' })
        .currentLinkId
    ).toBeUndefined();
  });

  it('drops the invite link snapshot when the user or team key changes', () => {
    const started = startPostLoginAction({
      state: initialState,
      key: 'user-1:team-1',
      action: 'invitation',
      linkId: 'invite-1'
    });

    expect(
      startPostLoginAction({ state: started, key: 'user-2:team-2', action: 'memberName' })
        .currentLinkId
    ).toBeUndefined();
  });
});
