import handler from '@/pages/api/core/dataset/resumeInheritPermission';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('resume dataset inherit permission api', () => {
  it('restores inheritance for a root dataset and persists the flag', async () => {
    const users = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'resume-dataset',
      type: DatasetTypeEnum.dataset,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      inheritPermission: false
    });

    const res = await Call(handler, {
      auth: users.owner,
      body: { datasetId: String(dataset._id) }
    });

    expect(res.code).toBe(200);
    await expect(MongoDataset.findById(dataset._id).lean()).resolves.toMatchObject({
      inheritPermission: true
    });
  });

  it('rejects a caller without dataset manage permission', async () => {
    const users = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'protected-resume-dataset',
      type: DatasetTypeEnum.dataset,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      inheritPermission: false
    });

    const res = await Call(handler, {
      auth: users.members[0],
      body: { datasetId: String(dataset._id) }
    });

    expect(res.code).not.toBe(200);
    await expect(MongoDataset.findById(dataset._id).lean()).resolves.toMatchObject({
      inheritPermission: false
    });
  });
});
