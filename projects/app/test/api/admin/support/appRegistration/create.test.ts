import createAppRegistrationHandler from '@/pages/api/admin/support/appRegistration/create';
import getTeamPlanStatusHandler from '@/pages/api/support/user/team/plan/getTeamPlanStatus';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { GetTeamPlanStatusResponse } from '@fastgpt/global/openapi/support/user/team/api';
import { createEntityId } from '@fastgpt/global/common/string/entityId';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { deleteAppDataProcessor } from '@fastgpt/service/core/app/controller';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { appRegistrationService } from '@fastgpt/service/support/appRegistration/service';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, onTestFinished } from 'vitest';

describe('appRegistration create & plan integration', () => {
  it('validates input, enforces duplicate & quota limits, updates plan status count, and cleans up on app delete', async () => {
    const previousSubPlans = getSystemInstanceConfig().commercial.subPlans;
    getSystemInstanceConfig().commercial.subPlans = {
      standard: {
        free: {
          price: 0,
          totalPoints: 100,
          maxTeamMember: 10,
          maxAppAmount: 10,
          maxDatasetAmount: 10,
          maxDatasetSize: 1000,
          chatHistoryStoreDuration: 30,
          appRegistrationCount: 1
        }
      }
    };
    onTestFinished(() => {
      getSystemInstanceConfig().commercial.subPlans = previousSubPlans;
    });

    const { owner } = await getFakeUsers(0);
    const [app1, app2] = await MongoApp.create([
      {
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'app-1',
        type: AppTypeEnum.simple
      },
      {
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'app-2',
        type: AppTypeEnum.simple
      }
    ]);

    // 1. 未认证与非法 body 入参均被拦截
    const unauthRes = await Call(createAppRegistrationHandler, {
      body: { appId: String(app1._id) }
    });
    expect(unauthRes.code).not.toBe(200);

    const invalidInputRes = await Call(createAppRegistrationHandler, {
      auth: owner,
      body: { appId: 'not-a-valid-entity-id' }
    });
    expect(invalidInputRes.code).not.toBe(200);
    expect(invalidInputRes.error).toBeInstanceOf(ApiRequestInputParseError);

    // 2. 应用不存在时拒绝
    const notFoundRes = await Call(createAppRegistrationHandler, {
      auth: owner,
      body: { appId: createEntityId() }
    });
    expect(notFoundRes.code).not.toBe(200);
    expect(notFoundRes.error).toBe('App not found');

    // 3. 首次备案成功并反映到团队套餐已用量
    const createRes = await Call<{ appId: string }, Record<string, never>, { success: boolean }>(
      createAppRegistrationHandler,
      {
        auth: owner,
        body: { appId: String(app1._id) }
      }
    );
    expect(createRes.code).toBe(200);
    expect(createRes.data).toEqual({ success: true });

    const planAfterCreate = await Call<
      Record<string, never>,
      Record<string, never>,
      GetTeamPlanStatusResponse
    >(getTeamPlanStatusHandler, {
      auth: owner
    });
    expect(planAfterCreate.code).toBe(200);
    expect(planAfterCreate.data?.usedRegistrationCount).toBe(1);

    // 4. 大写 hex 入参经 OpenAPI BodySchema 规范化后同样命中防重与配额拦截，不重复入库
    const duplicateUpperRes = await Call(createAppRegistrationHandler, {
      auth: owner,
      body: { appId: String(app1._id).toUpperCase() }
    });
    expect(duplicateUpperRes.code).not.toBe(200);
    expect(duplicateUpperRes.error).toBe('Registration already exists for this app');

    const duplicateRes = await Call(createAppRegistrationHandler, {
      auth: owner,
      body: { appId: String(app1._id) }
    });
    expect(duplicateRes.code).not.toBe(200);
    expect(duplicateRes.error).toBe('Registration already exists for this app');

    const quotaExceededRes = await Call(createAppRegistrationHandler, {
      auth: owner,
      body: { appId: String(app2._id) }
    });
    expect(quotaExceededRes.code).not.toBe(200);
    expect(quotaExceededRes.error).toBe('Registration quota exceeded. Current: 1, Limit: 1');

    // 5. 标记应用待删除后，删除流程同步清理关联备案记录
    const deleteTime = new Date();
    await MongoApp.updateOne({ _id: app1._id }, { $set: { deleteTime } });
    await deleteAppDataProcessor({
      app: { ...app1.toObject(), deleteTime } as any,
      teamId: owner.teamId
    });
    expect(await appRegistrationService.countTeamRegistrations({ teamId: owner.teamId })).toBe(0);
  });
});
