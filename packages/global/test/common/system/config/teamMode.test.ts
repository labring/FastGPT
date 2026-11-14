import { describe, expect, it } from 'vitest';
import { resolveEffectiveTeamMode } from '../../../../common/system/config/teamMode';

describe('resolveEffectiveTeamMode', () => {
  it('downgrades sync to single when the external user system is not configured', () => {
    expect(
      resolveEffectiveTeamMode({ teamMode: 'sync', externalUserSystemConfigured: false })
    ).toBe('single');
  });

  it('keeps sync when the external user system is configured', () => {
    expect(resolveEffectiveTeamMode({ teamMode: 'sync', externalUserSystemConfigured: true })).toBe(
      'sync'
    );
  });

  it('does not change multi or single modes', () => {
    expect(
      resolveEffectiveTeamMode({ teamMode: 'multi', externalUserSystemConfigured: false })
    ).toBe('multi');
    expect(
      resolveEffectiveTeamMode({ teamMode: 'single', externalUserSystemConfigured: false })
    ).toBe('single');
  });
});
