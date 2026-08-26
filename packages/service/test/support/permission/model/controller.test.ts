import { beforeEach, describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { TmpDataEnum } from '@fastgpt/global/support/tmpData/constants';
import { getTmpData, setTmpData } from '@fastgpt/service/support/tmpData/controller';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import {
  clearMyModelsCache,
  getMyModelIds
} from '@fastgpt/service/support/permission/model/controller';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoGroupMemberModel } from '@fastgpt/service/support/permission/memberGroup/groupMemberSchema';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';

describe('model permission cache', () => {
  beforeEach(async () => {
    await Promise.all([
      MongoTmpData.deleteMany({}),
      MongoResourcePermission.deleteMany({}),
      MongoGroupMemberModel.deleteMany({}),
      MongoMemberGroupModel.deleteMany({}),
      MongoOrgMemberModel.deleteMany({})
    ]);
    global.feConfigs = { isPlus: true } as typeof global.feConfigs;
    global.systemActiveModelList = [];
  });

  it('caches calculated model IDs for one hour and ignores expired records', async () => {
    const teamId = new Types.ObjectId().toString();
    const tmbId = new Types.ObjectId().toString();
    const firstModelId = new Types.ObjectId().toString();
    const secondModelId = new Types.ObjectId().toString();

    global.systemActiveModelList = [
      { modelId: firstModelId, model: 'first-model' }
    ] as typeof global.systemActiveModelList;

    await expect(getMyModelIds({ teamId, tmbId, isTeamOwner: false })).resolves.toEqual([
      firstModelId
    ]);

    const cached = await getTmpData({
      type: TmpDataEnum.MyModels,
      metadata: { teamId, tmbId }
    });
    expect(cached).toMatchObject({
      dataId: `${TmpDataEnum.MyModels}--${teamId}--${tmbId}`,
      data: { teamId, tmbId, modelIds: [firstModelId] }
    });
    expect(cached?.expireAt.getTime()).toBeGreaterThan(Date.now() + 59 * 60 * 1000);

    global.systemActiveModelList = [
      { modelId: secondModelId, model: 'second-model' }
    ] as typeof global.systemActiveModelList;
    await expect(getMyModelIds({ teamId, tmbId, isTeamOwner: false })).resolves.toEqual([
      firstModelId
    ]);

    await MongoTmpData.updateOne(
      { dataId: cached?.dataId },
      { $set: { expireAt: new Date(Date.now() - 1000) } }
    );
    await expect(getMyModelIds({ teamId, tmbId, isTeamOwner: false })).resolves.toEqual([
      secondModelId
    ]);
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
        data: { teamId: firstTeamId, tmbId: firstTmbId, modelIds: [] }
      }),
      setTmpData({
        type: TmpDataEnum.MyModels,
        metadata: { teamId: firstTeamId, tmbId: secondTmbId },
        data: { teamId: firstTeamId, tmbId: secondTmbId, modelIds: [] }
      }),
      setTmpData({
        type: TmpDataEnum.MyModels,
        metadata: { teamId: secondTeamId, tmbId: firstTmbId },
        data: { teamId: secondTeamId, tmbId: firstTmbId, modelIds: [] }
      })
    ]);

    await clearMyModelsCache({ teamId: firstTeamId });

    await expect(MongoTmpData.countDocuments({ 'data.teamId': firstTeamId })).resolves.toBe(0);
    await expect(MongoTmpData.countDocuments({ 'data.teamId': secondTeamId })).resolves.toBe(1);
  });
});
