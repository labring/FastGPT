import { describe, expect, it } from 'vitest';
import { getUserModelListsLoading } from '@/web/core/ai/model/useUserModelLists';

describe('getUserModelListsLoading', () => {
  const identity = 'team-1:member-1';

  it('only marks the consumer waiting for catalog validation as loading', () => {
    expect(
      getUserModelListsLoading({
        enabled: true,
        expectedIdentity: identity,
        isCurrentIdentity: true,
        requestKey: identity,
        validatedRequestKey: identity
      })
    ).toBe(false);

    expect(
      getUserModelListsLoading({
        enabled: true,
        expectedIdentity: identity,
        isCurrentIdentity: true,
        requestKey: identity,
        validatedRequestKey: undefined
      })
    ).toBe(true);
  });

  it('keeps loading while the store is switching to the expected identity', () => {
    expect(
      getUserModelListsLoading({
        enabled: true,
        expectedIdentity: identity,
        isCurrentIdentity: false,
        requestKey: identity,
        validatedRequestKey: identity
      })
    ).toBe(true);
  });

  it('does not load when the consumer is disabled or has no identity', () => {
    expect(
      getUserModelListsLoading({
        enabled: false,
        expectedIdentity: identity,
        isCurrentIdentity: true,
        requestKey: identity,
        validatedRequestKey: undefined
      })
    ).toBe(false);
    expect(
      getUserModelListsLoading({
        enabled: true,
        expectedIdentity: undefined,
        isCurrentIdentity: false,
        requestKey: undefined,
        validatedRequestKey: undefined
      })
    ).toBe(false);
  });
});
