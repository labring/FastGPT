import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/app/folder/path';
import detailHandler from '@/pages/api/core/app/detail';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import {
  type GetAppFolderPathQueryType,
  type GetAppFolderPathResponseType
} from '@fastgpt/global/openapi/core/app/folder/api';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('GET /api/core/app/folder/path', () => {
  it('returns breadcrumb IDs and names for a navigable folder without granting folder read access', async () => {
    const { owner, members } = await getFakeUsers(1);
    const [rootFolder, childFolder, readableApp, hiddenFolder, readableFolder] =
      await MongoApp.create([
        { name: 'Root folder', type: AppTypeEnum.folder, teamId: owner.teamId, tmbId: owner.tmbId },
        {
          name: 'Child folder',
          type: AppTypeEnum.folder,
          teamId: owner.teamId,
          tmbId: owner.tmbId
        },
        {
          name: 'Readable app',
          type: AppTypeEnum.workflow,
          teamId: owner.teamId,
          tmbId: owner.tmbId
        },
        {
          name: 'Hidden folder',
          type: AppTypeEnum.folder,
          teamId: owner.teamId,
          tmbId: owner.tmbId
        },
        {
          name: 'Readable folder',
          type: AppTypeEnum.folder,
          teamId: owner.teamId,
          tmbId: owner.tmbId
        }
      ]);
    await MongoApp.updateOne({ _id: childFolder._id }, { $set: { parentId: rootFolder._id } });
    await MongoApp.updateOne({ _id: readableApp._id }, { $set: { parentId: childFolder._id } });
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.app,
        teamId: owner.teamId,
        resourceId: readableApp._id,
        tmbId: members[0].tmbId,
        permission: ReadPermissionVal
      },
      {
        resourceType: PerResourceTypeEnum.app,
        teamId: owner.teamId,
        resourceId: readableFolder._id,
        tmbId: members[0].tmbId,
        permission: ReadPermissionVal
      }
    ]);

    const response = await Call<
      Record<string, never>,
      GetAppFolderPathQueryType,
      GetAppFolderPathResponseType
    >(handler, { auth: members[0], query: { sourceId: String(childFolder._id), type: 'current' } });
    expect(response.code).toBe(200);
    expect(response.data).toEqual([
      { parentId: String(rootFolder._id), parentName: 'Root folder' },
      {
        parentId: String(childFolder._id),
        parentName: 'Child folder',
        folderAccessMode: 'navigate'
      }
    ]);
    expect(JSON.stringify(response.data)).not.toContain('Readable app');

    const readableFolderPath = await Call<
      Record<string, never>,
      GetAppFolderPathQueryType,
      GetAppFolderPathResponseType
    >(handler, {
      auth: members[0],
      query: { sourceId: String(readableFolder._id), type: 'current' }
    });
    expect(readableFolderPath.data.at(-1)?.folderAccessMode).toBe('read');

    const deniedDetail = await Call(detailHandler, {
      auth: members[0],
      query: { appId: String(childFolder._id) }
    });
    expect(deniedDetail.error).toBe(AppErrEnum.unAuthApp);

    const denied = await Call<
      Record<string, never>,
      GetAppFolderPathQueryType,
      GetAppFolderPathResponseType
    >(handler, { auth: members[0], query: { sourceId: String(hiddenFolder._id) } });
    expect(denied.error).toBe(AppErrEnum.unAuthApp);
  });

  it('returns the containing folder path for a non-folder App source in parent mode', async () => {
    const { owner } = await getFakeUsers(1);
    const folder = await MongoApp.create({
      name: 'Apps folder',
      type: AppTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const app = await MongoApp.create({
      name: 'Application',
      type: AppTypeEnum.workflow,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      parentId: folder._id
    });

    const response = await Call<
      Record<string, never>,
      GetAppFolderPathQueryType,
      GetAppFolderPathResponseType
    >(handler, { auth: owner, query: { sourceId: String(app._id), type: 'parent' } });

    expect(response.error).toBeUndefined();
    expect(response.code).toBe(200);
    expect(response.data).toEqual([{ parentId: String(folder._id), parentName: 'Apps folder' }]);
  });
});
