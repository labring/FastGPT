import { afterEach, describe, expect, it, vi } from 'vitest';
import { StandardSubLevelEnum, SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { findActiveTeamStandardPlans } from '@fastgpt/service/support/wallet/sub/entity';
import { MongoTeamSub } from '@fastgpt/service/support/wallet/sub/schema';

afterEach(() => vi.restoreAllMocks());

describe('findActiveTeamStandardPlans', () => {
  it('reads only the owning team active standard subscriptions from the primary', async () => {
    const teamId = '507f1f77bcf86cd799439011';
    const [active] = await MongoTeamSub.create([
      {
        teamId,
        type: SubTypeEnum.standard,
        currentSubLevel: StandardSubLevelEnum.basic,
        expiredTime: new Date('2099-01-01')
      },
      {
        teamId,
        type: SubTypeEnum.standard,
        currentSubLevel: StandardSubLevelEnum.advanced,
        expiredTime: new Date('2000-01-01')
      },
      {
        teamId: '507f1f77bcf86cd799439012',
        type: SubTypeEnum.standard,
        currentSubLevel: StandardSubLevelEnum.basic,
        expiredTime: new Date('2099-01-01')
      },
      {
        teamId,
        type: SubTypeEnum.extraPoints,
        expiredTime: new Date('2099-01-01')
      }
    ]);
    const find = vi.spyOn(MongoTeamSub, 'find');

    const result = await findActiveTeamStandardPlans(teamId);

    expect(result.map((plan) => String(plan._id))).toEqual([String(active._id)]);
    expect(find).toHaveBeenCalledWith(
      { teamId, type: SubTypeEnum.standard, expiredTime: { $gt: expect.any(Date) } },
      undefined,
      { readPreference: 'primary' }
    );
  });

  it('returns an empty array when the team has no active standard subscription', async () => {
    expect(await findActiveTeamStandardPlans('507f1f77bcf86cd799439011')).toEqual([]);
  });
});
