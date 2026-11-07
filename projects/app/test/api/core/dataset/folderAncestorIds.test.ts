import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/dataset/folder/create';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('POST /api/core/dataset/folder/create ancestorIds', () => {
  it('stores the parent chain only on Dataset folders', async () => {
    const { owner } = await getFakeUsers(1);
    const createFolder = async (name: string, parentId: string | null) =>
      Call(handler, { auth: owner, body: { name, intro: '', parentId } });

    await expect(createFolder('Dataset root', null)).resolves.toMatchObject({ code: 200 });
    const root = await MongoDataset.findOne({
      teamId: owner.teamId,
      name: 'Dataset root',
      type: DatasetTypeEnum.folder
    }).lean();
    expect(root?.ancestorIds?.map(String)).toEqual([]);

    await expect(createFolder('Dataset child', String(root?._id))).resolves.toMatchObject({
      code: 200
    });
    const child = await MongoDataset.findOne({
      teamId: owner.teamId,
      name: 'Dataset child',
      type: DatasetTypeEnum.folder
    }).lean();
    expect(child?.ancestorIds?.map(String)).toEqual([String(root?._id)]);

    const dataset = await MongoDataset.create({
      name: 'Leaf Dataset',
      type: DatasetTypeEnum.dataset,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    expect(await MongoDataset.collection.findOne({ _id: dataset._id })).not.toHaveProperty(
      'ancestorIds'
    );
  });
});
