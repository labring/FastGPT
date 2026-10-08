import { getCachedModelHandle } from '@fastgpt/service/core/ai/model/handle';
import { setModelTestSnapshot } from '@test/modelCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { TmpDataEnum } from '@fastgpt/global/support/tmpData/constants';
import { getTmpData, setTmpData } from '@fastgpt/service/support/tmpData/controller';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import {
  assertMemberModelPermission,
  authModelManage,
  authModelScopeOperation,
  authModelUse,
  getMemberModelCatalogPermission,
  getMemberModelIds
} from '@fastgpt/service/support/permission/model/controller';
import {
  clearAllMyModelsCache,
  clearMyModelsCache
} from '@fastgpt/service/support/permission/model/cache';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { SystemErrEnum } from '@fastgpt/global/common/error/code/system';
import type { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoGroupMemberModel } from '@fastgpt/service/support/permission/memberGroup/groupMemberSchema';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';

describe('model permission cache', () => {
  it('separates permission-filtered inactive display models from active execution cache', async () => {
    const teamId = new Types.ObjectId().toString();
    const tmbId = new Types.ObjectId().toString();
    const activeId = new Types.ObjectId().toString();
    const inactiveId = new Types.ObjectId().toString();
    const hiddenId = new Types.ObjectId();
    setModelTestSnapshot({
      models: [{ modelId: activeId }] as ReturnType<
        NonNullable<ReturnType<typeof getCachedModelHandle>>['getActiveModels']
      >
    });
    setModelTestSnapshot({
      models: [
        { modelId: activeId },
        { modelId: inactiveId, isActive: false },
        { modelId: String(hiddenId), isActive: false }
      ] as ReturnType<NonNullable<ReturnType<typeof getCachedModelHandle>>['getAllModels']>
    });
    await MongoResourcePermission.collection.insertOne({
      teamId: new Types.ObjectId(teamId),
      resourceType: PerResourceTypeEnum.model,
      resourceId: hiddenId,
      tmbId: new Types.ObjectId(),
      permission: ReadPermissionVal
    });
    expect(await getMemberModelIds({ teamId, tmbId, isTeamOwner: false })).toEqual([activeId]);
    const display = await getMemberModelCatalogPermission({
      teamId,
      tmbId,
      isTeamOwner: false,
      includeInactive: true
    });
    expect(display.modelIds).toEqual([activeId, inactiveId]);
    expect(await getMemberModelIds({ teamId, tmbId, isTeamOwner: false })).toEqual([activeId]);
  });
  beforeEach(async () => {
    await Promise.all([
      MongoTmpData.deleteMany({}),
      MongoResourcePermission.deleteMany({}),
      MongoGroupMemberModel.deleteMany({}),
      MongoMemberGroupModel.deleteMany({}),
      MongoOrgMemberModel.deleteMany({})
    ]);
    global.feConfigs = { isPlus: true } as typeof global.feConfigs;
    setModelTestSnapshot({ models: [] });
  });

  it('caches calculated model IDs for one hour and ignores expired records', async () => {
    const teamId = new Types.ObjectId().toString();
    const tmbId = new Types.ObjectId().toString();
    const firstModelId = new Types.ObjectId().toString();
    const secondModelId = new Types.ObjectId().toString();

    setModelTestSnapshot({
      models: [{ modelId: firstModelId, model: 'first-model' }] as ReturnType<
        NonNullable<ReturnType<typeof getCachedModelHandle>>['getActiveModels']
      >
    });

    await expect(getMemberModelIds({ teamId, tmbId, isTeamOwner: false })).resolves.toEqual([
      firstModelId
    ]);

    const cached = await getTmpData({
      type: TmpDataEnum.MyModels,
      metadata: { teamId, tmbId }
    });
    expect(cached).toMatchObject({
      dataId: `${TmpDataEnum.MyModels}--${teamId}--${tmbId}`,
      data: { teamId, tmbId, modelIds: [firstModelId], version: expect.any(String) }
    });
    expect(cached?.expireAt.getTime()).toBeGreaterThan(Date.now() + 59 * 60 * 1000);

    setModelTestSnapshot({
      models: [{ modelId: secondModelId, model: 'second-model' }] as ReturnType<
        NonNullable<ReturnType<typeof getCachedModelHandle>>['getActiveModels']
      >
    });
    await expect(getMemberModelIds({ teamId, tmbId, isTeamOwner: false })).resolves.toEqual([
      firstModelId
    ]);

    await MongoTmpData.updateOne(
      { dataId: cached?.dataId },
      { $set: { expireAt: new Date(Date.now() - 1000) } }
    );
    await expect(getMemberModelIds({ teamId, tmbId, isTeamOwner: false })).resolves.toEqual([
      secondModelId
    ]);
  });

  it('uses the same permission version for the same model ID set regardless of order', async () => {
    const teamId = new Types.ObjectId().toString();
    const tmbId = new Types.ObjectId().toString();
    const modelIds = [new Types.ObjectId().toString(), new Types.ObjectId().toString()];
    setModelTestSnapshot({
      models: modelIds.map((modelId) => ({
        modelId,
        model: modelId
      })) as ReturnType<NonNullable<ReturnType<typeof getCachedModelHandle>>['getActiveModels']>
    });

    const first = await getMemberModelCatalogPermission({ teamId, tmbId, isTeamOwner: true });
    setModelTestSnapshot({ models: [...getCachedModelHandle()!.getActiveModels()].reverse() });
    const second = await getMemberModelCatalogPermission({ teamId, tmbId, isTeamOwner: true });

    expect(first.version).toBe(second.version);
  });

  it('uses only resourceId and ignores legacy resourceName permissions', async () => {
    const teamId = new Types.ObjectId().toString();
    const currentTmbId = new Types.ObjectId().toString();
    const otherTmbId = new Types.ObjectId().toString();
    const modelId = new Types.ObjectId().toString();
    setModelTestSnapshot({
      models: [{ modelId, model: 'legacy-name' }] as ReturnType<
        NonNullable<ReturnType<typeof getCachedModelHandle>>['getActiveModels']
      >
    });

    await MongoResourcePermission.create({
      teamId,
      tmbId: otherTmbId,
      resourceType: 'model',
      resourceName: 'legacy-name',
      permission: 1
    });
    await expect(
      getMemberModelIds({ teamId, tmbId: currentTmbId, isTeamOwner: false })
    ).resolves.toEqual([modelId]);

    await MongoTmpData.deleteMany({});
    await MongoResourcePermission.create({
      teamId,
      tmbId: otherTmbId,
      resourceType: 'model',
      resourceId: modelId,
      permission: 1
    });
    await expect(
      getMemberModelIds({ teamId, tmbId: currentTmbId, isTeamOwner: false })
    ).resolves.toEqual([]);
  });

  it('deletes only caches belonging to the changed team', async () => {
    const firstTeamId = new Types.ObjectId().toString();
    const secondTeamId = new Types.ObjectId().toString();
    const firstTmbId = new Types.ObjectId().toString();
    const secondTmbId = new Types.ObjectId().toString();

    await Promise.all([
      setTmpData({
        type: TmpDataEnum.MyModels,
        metadata: { teamId: firstTeamId, tmbId: firstTmbId },
        data: { teamId: firstTeamId, tmbId: firstTmbId, modelIds: [], version: 'first' }
      }),
      setTmpData({
        type: TmpDataEnum.MyModels,
        metadata: { teamId: firstTeamId, tmbId: secondTmbId },
        data: { teamId: firstTeamId, tmbId: secondTmbId, modelIds: [], version: 'second' }
      }),
      setTmpData({
        type: TmpDataEnum.MyModels,
        metadata: { teamId: secondTeamId, tmbId: firstTmbId },
        data: { teamId: secondTeamId, tmbId: firstTmbId, modelIds: [], version: 'third' }
      })
    ]);

    await clearMyModelsCache({ teamId: firstTeamId });

    await expect(MongoTmpData.countDocuments({ 'data.teamId': firstTeamId })).resolves.toBe(0);
    await expect(MongoTmpData.countDocuments({ 'data.teamId': secondTeamId })).resolves.toBe(1);
  });

  it('deletes every model cache without deleting unrelated temporary data', async () => {
    const firstTeamId = new Types.ObjectId().toString();
    const secondTeamId = new Types.ObjectId().toString();
    const firstTmbId = new Types.ObjectId().toString();
    const secondTmbId = new Types.ObjectId().toString();

    await Promise.all([
      setTmpData({
        type: TmpDataEnum.MyModels,
        metadata: { teamId: firstTeamId, tmbId: firstTmbId },
        data: { teamId: firstTeamId, tmbId: firstTmbId, modelIds: [], version: 'first' }
      }),
      setTmpData({
        type: TmpDataEnum.MyModels,
        metadata: { teamId: secondTeamId, tmbId: secondTmbId },
        data: { teamId: secondTeamId, tmbId: secondTmbId, modelIds: [], version: 'second' }
      }),
      MongoTmpData.create({
        dataId: `unrelated--${firstTeamId}--${firstTmbId}`,
        data: { teamId: firstTeamId, tmbId: firstTmbId },
        expireAt: new Date(Date.now() + 60_000)
      })
    ]);

    await clearAllMyModelsCache();

    await expect(MongoTmpData.countDocuments({ dataId: { $regex: /^my_models--/ } })).resolves.toBe(
      0
    );
    await expect(MongoTmpData.countDocuments({ dataId: /^unrelated--/ })).resolves.toBe(1);
  });

  it('allows team members to use team models when explicitly granted via collaborators', async () => {
    const teamId = new Types.ObjectId().toString();
    const ownerTmbId = new Types.ObjectId().toString();
    const collaboratorTmbId = new Types.ObjectId().toString();
    const otherMemberTmbId = new Types.ObjectId().toString();
    const teamModelId = new Types.ObjectId().toString();

    setModelTestSnapshot({
      models: [
        {
          modelId: teamModelId,
          model: 'custom-team-model',
          scope: 'team',
          tmbId: ownerTmbId,
          isActive: true
        }
      ] as any
    });

    // 1. 模型所有者天然有权限
    const ownerModels = await getMemberModelIds({
      teamId,
      tmbId: ownerTmbId,
      isTeamOwner: false
    });
    expect(ownerModels).toContain(teamModelId);

    // 2. 未授权成员无权限
    const otherModels = await getMemberModelIds({
      teamId,
      tmbId: otherMemberTmbId,
      isTeamOwner: false
    });
    expect(otherModels).not.toContain(teamModelId);

    // 3. 授权协作者权限给 collaboratorTmbId
    await MongoResourcePermission.create({
      teamId: new Types.ObjectId(teamId),
      resourceType: PerResourceTypeEnum.model,
      resourceId: new Types.ObjectId(teamModelId),
      tmbId: new Types.ObjectId(collaboratorTmbId),
      permission: ReadPermissionVal
    });

    // 4. 被授权成员刷新后可用
    const collaboratorModels = await getMemberModelIds({
      teamId,
      tmbId: collaboratorTmbId,
      isTeamOwner: false
    });
    expect(collaboratorModels).toContain(teamModelId);

    // 5. 团队模型未授权时，即使是 teamOwner 也无法使用
    const teamOwnerModels = await getMemberModelIds({
      teamId,
      tmbId: otherMemberTmbId,
      isTeamOwner: true
    });
    expect(teamOwnerModels).not.toContain(teamModelId);
  });

  it('rejects external team models even if registered in MongoResourcePermission', async () => {
    const teamIdA = new Types.ObjectId().toString();
    const tmbIdA = new Types.ObjectId().toString();
    const teamIdB = new Types.ObjectId().toString();
    const tmbIdB = new Types.ObjectId().toString();
    const externalTeamModelId = new Types.ObjectId().toString();

    setModelTestSnapshot({
      models: [
        {
          modelId: externalTeamModelId,
          model: 'external-team-model',
          scope: 'team',
          teamId: teamIdB,
          tmbId: tmbIdB,
          isActive: true
        }
      ] as any
    });

    // 恶意或错误在团队 A 插入对团队 B 模型的协作者权限
    await MongoResourcePermission.create({
      teamId: new Types.ObjectId(teamIdA),
      resourceType: PerResourceTypeEnum.model,
      resourceId: new Types.ObjectId(externalTeamModelId),
      tmbId: new Types.ObjectId(tmbIdA),
      permission: ReadPermissionVal
    });

    const memberIds = await getMemberModelIds({
      teamId: teamIdA,
      tmbId: tmbIdA,
      isTeamOwner: false
    });
    expect(memberIds).not.toContain(externalTeamModelId);
  });

  it('updates catalog version when team model content is modified even if model IDs remain the same', async () => {
    const teamId = new Types.ObjectId().toString();
    const tmbId = new Types.ObjectId().toString();
    const teamModelId = new Types.ObjectId().toString();

    const baseModel = {
      modelId: teamModelId,
      model: 'my-team-model',
      name: 'Initial Name',
      scope: 'team',
      teamId,
      tmbId,
      isActive: true,
      type: 'llm',
      config: { maxResponse: 4000 }
    };

    setModelTestSnapshot({
      models: [baseModel] as any,
      revision: 1
    });

    const first = await getMemberModelCatalogPermission({
      teamId,
      tmbId,
      isTeamOwner: false
    });

    // 修改模型名称与配置，快照版本递增
    setModelTestSnapshot({
      models: [{ ...baseModel, name: 'Updated Name', config: { maxResponse: 8000 } }] as any,
      revision: 2
    });

    const second = await getMemberModelCatalogPermission({
      teamId,
      tmbId,
      isTeamOwner: false
    });

    expect(first.version).not.toBe(second.version);
    expect(first.modelIds).toEqual(second.modelIds);
  });

  describe('authModelUse', () => {
    it('throws unExist for missing or inactive model', async () => {
      const teamId = new Types.ObjectId().toString();
      const tmbId = new Types.ObjectId().toString();
      const activeModelId = new Types.ObjectId().toString();
      const inactiveModelId = new Types.ObjectId().toString();

      setModelTestSnapshot({
        models: [
          { modelId: activeModelId, model: 'active-model', isActive: true, scope: 'system' },
          { modelId: inactiveModelId, model: 'inactive-model', isActive: false, scope: 'system' }
        ] as any
      });

      await expect(authModelUse({ modelId: 'non-existent', tmbId, teamId })).rejects.toMatchObject({
        message: ModelErrEnum.unExist
      });

      await expect(authModelUse({ modelId: inactiveModelId, tmbId, teamId })).rejects.toMatchObject(
        { message: ModelErrEnum.unExist }
      );
    });

    it('rejects cross-team model usage even if model exists and is active', async () => {
      const teamIdA = new Types.ObjectId().toString();
      const tmbIdA = new Types.ObjectId().toString();
      const teamIdB = new Types.ObjectId().toString();
      const tmbIdB = new Types.ObjectId().toString();
      const otherTeamModelId = new Types.ObjectId().toString();

      setModelTestSnapshot({
        models: [
          {
            modelId: otherTeamModelId,
            model: 'team-b-model',
            scope: 'team',
            teamId: teamIdB,
            tmbId: tmbIdB,
            isActive: true
          }
        ] as any
      });

      await expect(
        authModelUse({ modelId: otherTeamModelId, tmbId: tmbIdA, teamId: teamIdA })
      ).rejects.toMatchObject({ message: ModelErrEnum.unAuthModel });
    });

    it('allows permitted system and team models', async () => {
      const teamId = new Types.ObjectId().toString();
      const tmbId = new Types.ObjectId().toString();
      const systemModelId = new Types.ObjectId().toString();
      const myTeamModelId = new Types.ObjectId().toString();

      setModelTestSnapshot({
        models: [
          { modelId: systemModelId, model: 'system-model', scope: 'system', isActive: true },
          {
            modelId: myTeamModelId,
            model: 'my-team-model',
            scope: 'team',
            teamId,
            tmbId,
            isActive: true
          }
        ] as any
      });

      await expect(authModelUse({ modelId: systemModelId, tmbId, teamId })).resolves.toMatchObject({
        modelId: systemModelId
      });

      await expect(authModelUse({ modelId: myTeamModelId, tmbId, teamId })).resolves.toMatchObject({
        modelId: myTeamModelId
      });
    });
  });

  it('assertMemberModelPermission requires TeamModelCreatePermissionVal and maps the resource error code', async () => {
    await expect(
      assertMemberModelPermission({ hasModelCreatePer: false } as TeamPermission)
    ).rejects.toBe(ModelErrEnum.unAuthModel);
    await expect(
      assertMemberModelPermission({ hasModelCreatePer: false } as TeamPermission, 'channel')
    ).rejects.toBe(ModelErrEnum.unAuthChannel);
    await expect(
      assertMemberModelPermission({ hasModelCreatePer: true } as TeamPermission)
    ).resolves.toBeUndefined();
  });

  describe('authModelScopeOperation', () => {
    it('rejects non-root for system channelType with rootOnlyPermit', async () => {
      const authUserPerSpy = vi
        .spyOn(await import('@fastgpt/service/support/permission/user/auth'), 'authUserPer')
        .mockResolvedValue({
          tmbId: 'tmb-1',
          teamId: 'team-1',
          isRoot: false,
          tmb: { permission: { hasModelCreatePer: true } }
        } as any);

      await expect(authModelScopeOperation({ req: {}, channelType: 'system' })).rejects.toBe(
        ModelErrEnum.rootOnlyPermit
      );

      authUserPerSpy.mockRestore();
    });

    it('allows root for system channelType', async () => {
      const authUserPerSpy = vi
        .spyOn(await import('@fastgpt/service/support/permission/user/auth'), 'authUserPer')
        .mockResolvedValue({
          tmbId: 'tmb-root',
          teamId: 'team-1',
          isRoot: true,
          tmb: { permission: {} }
        } as any);

      const res = await authModelScopeOperation({ req: {}, channelType: 'system' });
      expect(res.isRoot).toBe(true);

      authUserPerSpy.mockRestore();
    });

    it('resolves authenticated member session for team scope', async () => {
      const authUserPerSpy = vi
        .spyOn(await import('@fastgpt/service/support/permission/user/auth'), 'authUserPer')
        .mockResolvedValue({
          tmbId: 'tmb-1',
          teamId: 'team-1',
          isRoot: false,
          tmb: { permission: { hasModelCreatePer: false } }
        } as any);

      const res = await authModelScopeOperation({
        req: {},
        channelType: 'team'
      });
      expect(res.tmbId).toBe('tmb-1');

      authUserPerSpy.mockRestore();
    });
  });
  describe('authModelManage', () => {
    const mockAuth = async (auth: Record<string, unknown>) =>
      vi
        .spyOn(await import('@fastgpt/service/support/permission/user/auth'), 'authUserPer')
        .mockResolvedValue(auth as any);

    it('rejects team scope on the open-source edition for members and root, keeps system scope', async () => {
      global.feConfigs = { isPlus: false } as typeof global.feConfigs;
      const memberSpy = await mockAuth({
        tmbId: 'tmb-1',
        teamId: 'team-1',
        isRoot: false,
        tmb: { permission: { hasModelCreatePer: true } }
      });
      await expect(authModelManage({ req: {}, channelType: 'team' })).rejects.toBe(
        SystemErrEnum.commercialFeature
      );
      memberSpy.mockRestore();

      const rootSpy = await mockAuth({
        tmbId: 'tmb-root',
        teamId: 'team-1',
        isRoot: true,
        tmb: { permission: {} }
      });
      await expect(authModelManage({ req: {}, channelType: 'team' })).rejects.toBe(
        SystemErrEnum.commercialFeature
      );
      await expect(authModelManage({ req: {}, channelType: 'system' })).resolves.toMatchObject({
        isRoot: true
      });
      rootSpy.mockRestore();
    });

    it('rejects a member without hasModelCreatePer on team scope', async () => {
      const spy = await mockAuth({
        tmbId: 'tmb-1',
        teamId: 'team-1',
        isRoot: false,
        tmb: { permission: { hasModelCreatePer: false } }
      });

      await expect(authModelManage({ req: {}, channelType: 'team' })).rejects.toBe(
        ModelErrEnum.unAuthModel
      );
      await expect(
        authModelManage({ req: {}, channelType: 'team', resource: 'channel' })
      ).rejects.toBe(ModelErrEnum.unAuthChannel);
      spy.mockRestore();
    });

    it('allows a member with hasModelCreatePer on team scope', async () => {
      const spy = await mockAuth({
        tmbId: 'tmb-1',
        teamId: 'team-1',
        isRoot: false,
        tmb: { permission: { hasModelCreatePer: true } }
      });

      const res = await authModelManage({ req: {}, channelType: 'team' });
      expect(res.tmbId).toBe('tmb-1');
      spy.mockRestore();
    });

    it('rejects a member on system scope before the permission check', async () => {
      const spy = await mockAuth({
        tmbId: 'tmb-1',
        teamId: 'team-1',
        isRoot: false,
        tmb: { permission: { hasModelCreatePer: true } }
      });

      await expect(authModelManage({ req: {}, channelType: 'system' })).rejects.toBe(
        ModelErrEnum.rootOnlyPermit
      );
      spy.mockRestore();
    });

    it('does not require hasModelCreatePer for root', async () => {
      const spy = await mockAuth({
        tmbId: 'tmb-root',
        teamId: 'team-1',
        isRoot: true,
        tmb: { permission: { hasModelCreatePer: false } }
      });

      await expect(authModelManage({ req: {}, channelType: 'system' })).resolves.toMatchObject({
        isRoot: true
      });
      await expect(authModelManage({ req: {}, channelType: 'team' })).resolves.toMatchObject({
        isRoot: true
      });
      spy.mockRestore();
    });
  });
});
