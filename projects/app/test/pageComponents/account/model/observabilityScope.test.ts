import { describe, expect, it } from 'vitest';
import { getObservabilityChannelType } from '@/pageComponents/account/model/observabilityScope';

describe('getObservabilityChannelType', () => {
  it('maps the root public scope to system channels', () => {
    expect(getObservabilityChannelType({ isRoot: true, activeGroupType: 'public' })).toBe('system');
  });

  it('maps the root team scope to the root member private group', () => {
    expect(getObservabilityChannelType({ isRoot: true, activeGroupType: 'team' })).toBe('team');
  });

  it.each(['public', 'team'] as const)(
    'forces a normal member with %s frontend state to the team scope',
    (activeGroupType) => {
      expect(getObservabilityChannelType({ isRoot: false, activeGroupType })).toBe('team');
    }
  );
});
