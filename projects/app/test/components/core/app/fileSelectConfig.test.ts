import { describe, expect, it } from 'vitest';
import { resolveFileSelectConfigMaxFiles } from '@/components/core/app/fileSelectConfig';

describe('resolveFileSelectConfigMaxFiles', () => {
  it('uses the system upload limit when the team plan has no file limit', () => {
    expect(
      resolveFileSelectConfigMaxFiles({
        systemMaxFiles: 100
      })
    ).toBe(100);
  });

  it('uses the team plan limit when it is configured', () => {
    expect(
      resolveFileSelectConfigMaxFiles({
        teamPlanMaxFiles: 20,
        systemMaxFiles: 100
      })
    ).toBe(20);
  });

  it('does not replace an explicit zero limit with the system limit', () => {
    expect(
      resolveFileSelectConfigMaxFiles({
        teamPlanMaxFiles: 0,
        systemMaxFiles: 100
      })
    ).toBe(0);
  });
});
