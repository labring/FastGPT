import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/app/folder/create';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
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

  it('rejects cross-tree folder creation', async () => {
    const { owner } = await getFakeUsers(1);
    const createFolder = async (name: string, type: AppTypeEnum, parentId?: string) =>
      Call(handler, {
        auth: owner,
        body: { name, type, parentId, intro: '' }
      });

    const appRoot = await MongoApp.create({
      name: 'app-root',
      type: AppTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const toolRoot = await MongoApp.create({
      name: 'tool-root',
      type: AppTypeEnum.toolFolder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });

    // 普通文件夹不能建在工具文件夹下
    const appFolderIntoTool = await createFolder(
      'app-folder-in-tool',
      AppTypeEnum.folder,
      String(toolRoot._id)
    );
    expect(appFolderIntoTool.error).toBe(AppErrEnum.parentFolderTypeMismatch);

    // 工具文件夹不能建在普通文件夹下
    const toolFolderIntoApp = await createFolder(
      'tool-folder-in-app',
      AppTypeEnum.toolFolder,
      String(appRoot._id)
    );
    expect(toolFolderIntoApp.error).toBe(AppErrEnum.parentFolderTypeMismatch);

    // 同树创建仍然正常
    await expect(
      createFolder('app-folder-in-app', AppTypeEnum.folder, String(appRoot._id))
    ).resolves.toMatchObject({ code: 200 });
    await expect(
      createFolder('tool-folder-in-tool', AppTypeEnum.toolFolder, String(toolRoot._id))
    ).resolves.toMatchObject({ code: 200 });
  });
});
