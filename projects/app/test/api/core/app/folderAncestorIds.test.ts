import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/app/folder/create';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('POST /api/core/app/folder/create ancestorIds', () => {
  it('stores paths for App and tool folders but not for non-folder documents', async () => {
    const { owner } = await getFakeUsers(1);
    const createFolder = async (name: string, type: AppTypeEnum, parentId?: string) =>
      Call(handler, {
        auth: owner,
        body: { name, type, parentId, intro: '' }
      });

    await expect(createFolder('App root', AppTypeEnum.folder)).resolves.toMatchObject({
      code: 200
    });
    const appRoot = await MongoApp.findOne({
      teamId: owner.teamId,
      name: 'App root',
      type: AppTypeEnum.folder
    }).lean();
    expect(appRoot?.ancestorIds?.map(String)).toEqual([]);

    await expect(
      createFolder('App child', AppTypeEnum.folder, String(appRoot?._id))
    ).resolves.toMatchObject({ code: 200 });
    const appChild = await MongoApp.findOne({
      teamId: owner.teamId,
      name: 'App child',
      type: AppTypeEnum.folder
    }).lean();
    expect(appChild?.ancestorIds?.map(String)).toEqual([String(appRoot?._id)]);

    await expect(createFolder('Tool root', AppTypeEnum.toolFolder)).resolves.toMatchObject({
      code: 200
    });
    const toolRoot = await MongoApp.findOne({
      teamId: owner.teamId,
      name: 'Tool root',
      type: AppTypeEnum.toolFolder
    }).lean();
    expect(toolRoot?.ancestorIds?.map(String)).toEqual([]);
    await expect(
      createFolder('Tool child', AppTypeEnum.toolFolder, String(toolRoot?._id))
    ).resolves.toMatchObject({ code: 200 });
    const toolChild = await MongoApp.findOne({
      teamId: owner.teamId,
      name: 'Tool child',
      type: AppTypeEnum.toolFolder
    }).lean();
    expect(toolChild?.ancestorIds?.map(String)).toEqual([String(toolRoot?._id)]);

    const app = await MongoApp.create({
      name: 'Leaf app',
      type: AppTypeEnum.workflow,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    expect(await MongoApp.collection.findOne({ _id: app._id })).not.toHaveProperty('ancestorIds');
  });
});
