import getTeamPlanStatusHandler from '@/pages/api/support/user/team/plan/getTeamPlanStatus';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type {
  GetTeamPlanStatusResponse,
  GetTeamPlanEntitlementsResponse
} from '@fastgpt/global/openapi/support/user/team/api';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoTeamSub } from '@fastgpt/service/support/wallet/sub/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { StandardSubLevelEnum, SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { getFakeUsers, getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureAgentQuota } from '../../../../core/app/quotaTestUtils';

afterEach(() => vi.restoreAllMocks());

describe('getTeamPlanStatus', () => {
  it('reports the real Agent count above quota, includes chatAgent, and excludes tools and folders', async () => {
    configureAgentQuota();
    const { owner } = await getFakeUsers(0);
    const otherTeamUser = await getUser('other team');
    await MongoApp.insertMany([
      ...Array.from({ length: 10 }, () => ({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'simple Agent',
        type: AppTypeEnum.simple
      })),
      ...[
        AppTypeEnum.chatAgent,
        AppTypeEnum.workflow,
        AppTypeEnum.workflowTool,
        AppTypeEnum.mcpToolSet,
        AppTypeEnum.httpToolSet,
        AppTypeEnum.folder,
        AppTypeEnum.toolFolder,
        AppTypeEnum.httpPlugin,
        AppTypeEnum.hidden
      ].map((type) => ({ teamId: owner.teamId, tmbId: owner.tmbId, name: type, type })),
      {
        teamId: otherTeamUser.teamId,
        tmbId: otherTeamUser.tmbId,
        name: 'other team Agent',
        type: AppTypeEnum.chatAgent
      }
    ]);

    const readUsage = () =>
      Call<Record<string, never>, Record<string, never>, GetTeamPlanStatusResponse>(
        getTeamPlanStatusHandler,
        { auth: owner }
      );
    const initialUsage = await readUsage();
    expect(initialUsage.code).toBe(200);
    expect(initialUsage.data?.standard?.maxAppAmount).toBe(10);
    expect(initialUsage.data?.usedAppAmount).toBe(12);

    await MongoApp.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'legacy extra Agent',
      type: AppTypeEnum.chatAgent
    });
    expect((await readUsage()).data?.usedAppAmount).toBe(13);
  });

  it('reads an explicit entitlement override without plan configuration or resource statistics', async () => {
    const { owner } = await getFakeUsers(0);
    const originalPlans = global.subPlans;
    await MongoTeamSub.create({
      teamId: owner.teamId,
      type: SubTypeEnum.standard,
      currentSubLevel: StandardSubLevelEnum.custom,
      expiredTime: new Date('2099-01-01'),
      canHideShareBrandOverride: true
    });
    const count = vi.spyOn(MongoTeamMember, 'countDocuments').mockImplementation(() => {
      throw new Error('resource statistics unavailable');
    });
    try {
      global.subPlans = undefined;
      const result = await Call<
        Record<string, never>,
        { scope: 'entitlements' },
        GetTeamPlanEntitlementsResponse
      >(getTeamPlanStatusHandler, { auth: owner, query: { scope: 'entitlements' } });
      expect(result.code).toBe(200);
      expect(result.data).toEqual({ scope: 'entitlements', canHideShareBrand: true });
      expect(count).not.toHaveBeenCalled();
    } finally {
      global.subPlans = originalPlans;
    }
  });

  it('does not treat an entitlement database failure as a missing entitlement', async () => {
    const { owner } = await getFakeUsers(0);
    vi.spyOn(MongoTeamSub, 'find').mockImplementationOnce(() => {
      throw new Error('entitlement database unavailable');
    });
    const result = await Call(getTeamPlanStatusHandler, {
      auth: owner,
      query: { scope: 'entitlements' }
    });
    expect(result.code).not.toBe(200);
  });

  it('rejects an unsupported scope', async () => {
    const { owner } = await getFakeUsers(0);
    const result = await Call(getTeamPlanStatusHandler, {
      auth: owner,
      query: { scope: 'unknown' }
    });
    expect(result.code).not.toBe(200);
  });

  it('requires authentication for entitlement requests', async () => {
    const result = await Call(getTeamPlanStatusHandler, { query: { scope: 'entitlements' } });
    expect(result.code).not.toBe(200);
  });
});
