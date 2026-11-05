import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StandardSubLevelEnum, SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { getTeamCanHideShareBrand } from '@fastgpt/service/support/wallet/sub/service';
import { MongoTeamSub } from '@fastgpt/service/support/wallet/sub/schema';
import { Types } from '@fastgpt/service/common/mongo';

const teamId = '507f1f77bcf86cd799439011';
const planConfig = {
  price: 99,
  totalPoints: 2000,
  maxTeamMember: 10,
  maxAppAmount: 50,
  maxDatasetAmount: 20,
  maxDatasetSize: 100,
  chatHistoryStoreDuration: 30
};

beforeEach(() => {
  global.subPlans = {
    standard: {
      basic: { ...planConfig, canHideShareBrand: true },
      advanced: { ...planConfig, canHideShareBrand: true },
      custom: { ...planConfig },
      free: { ...planConfig }
    }
  };
});
afterEach(() => vi.restoreAllMocks());

describe('getTeamCanHideShareBrand', () => {
  it('uses live configuration instead of a stored entitlement snapshot', async () => {
    const plan = await MongoTeamSub.create({
      teamId,
      type: SubTypeEnum.standard,
      currentSubLevel: StandardSubLevelEnum.basic,
      expiredTime: new Date('2099-01-01')
    });
    await MongoTeamSub.collection.updateOne(
      { _id: new Types.ObjectId(plan._id) },
      { $set: { canHideShareBrand: false } }
    );

    expect(await getTeamCanHideShareBrand(teamId)).toBe(true);
    global.subPlans!.standard!.basic!.canHideShareBrand = false;
    expect(await getTeamCanHideShareBrand(teamId)).toBe(false);
  });

  it.each([StandardSubLevelEnum.custom, StandardSubLevelEnum.free])(
    'does not inherit branding permission from other levels for %s',
    async (currentSubLevel) => {
      await MongoTeamSub.create({
        teamId,
        type: SubTypeEnum.standard,
        currentSubLevel,
        expiredTime: new Date('2099-01-01')
      });
      expect(await getTeamCanHideShareBrand(teamId)).toBe(false);
    }
  );

  it('uses the highest active plan and ignores expired higher plans', async () => {
    await MongoTeamSub.create([
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
        expiredTime: new Date('2099-01-01')
      }
    ]);
    global.subPlans!.standard!.advanced!.canHideShareBrand = false;
    expect(await getTeamCanHideShareBrand(teamId)).toBe(false);

    await MongoTeamSub.updateOne(
      { teamId, currentSubLevel: StandardSubLevelEnum.advanced },
      { $set: { expiredTime: new Date('2000-01-01') } }
    );
    expect(await getTeamCanHideShareBrand(teamId)).toBe(true);
  });

  it('denies hiding without a subscription or current plan configuration', async () => {
    expect(await getTeamCanHideShareBrand(teamId)).toBe(false);
    await MongoTeamSub.create({
      teamId,
      type: SubTypeEnum.standard,
      currentSubLevel: StandardSubLevelEnum.basic,
      expiredTime: new Date('2099-01-01')
    });
    delete global.subPlans!.standard;
    expect(await getTeamCanHideShareBrand(teamId)).toBe(false);
    delete global.subPlans;
    expect(await getTeamCanHideShareBrand(teamId)).toBe(false);
  });

  it('propagates database errors to the caller', async () => {
    vi.spyOn(MongoTeamSub, 'find').mockImplementationOnce(() => {
      throw new Error('primary unavailable');
    });
    await expect(getTeamCanHideShareBrand(teamId)).rejects.toThrow('primary unavailable');
  });
});
