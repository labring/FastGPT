import { describe, expect, it } from 'vitest';
import { getNextPostLoginAction, type PostLoginAction } from '@/components/Layout/postLoginAction';

const getAction = (completed: PostLoginAction[] = []) =>
  getNextPostLoginAction({
    canStart: true,
    completed: new Set(completed),
    inviteLinkId: 'invite-1',
    hasPendingMemberName: true,
    shouldShowContact: true,
    contactHandled: false,
    isPlus: true,
    hasImportantInform: true
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
      getAction([
        'invitation',
        'memberName',
        'resetExpiredPassword',
        'contact',
        'systemMessage',
        'importantInform'
      ])
    ).toBe('activityAd');
    expect(
      getAction([
        'invitation',
        'memberName',
        'resetExpiredPassword',
        'contact',
        'systemMessage',
        'importantInform',
        'activityAd'
      ])
    ).toBe('enterpriseAuthNotice');
  });

  it('skips actions completed after a failed or dismissed attempt', () => {
    expect(getAction(['invitation', 'memberName', 'resetExpiredPassword', 'contact'])).toBe(
      'systemMessage'
    );
    expect(
      getNextPostLoginAction({
        canStart: true,
        completed: new Set<PostLoginAction>([
          'invitation',
          'memberName',
          'resetExpiredPassword',
          'contact',
          'systemMessage',
          'importantInform'
        ]),
        inviteLinkId: '',
        hasPendingMemberName: false,
        shouldShowContact: false,
        contactHandled: true,
        isPlus: true,
        hasImportantInform: false
      })
    ).toBe('activityAd');
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
});
