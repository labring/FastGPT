import getTeamPlanStatusHandler from '@/pages/api/support/user/team/plan/getTeamPlanStatus';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { GetTeamPlanStatusResponse } from '@fastgpt/global/openapi/support/user/team/api';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getFakeUsers, getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';
import { configureAgentQuota } from '../../../../core/app/quotaTestUtils';

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
});
