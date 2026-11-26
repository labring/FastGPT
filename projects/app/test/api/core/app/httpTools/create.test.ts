import handler from '@/pages/api/core/app/httpTools/create';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { HttpToolTypeEnum } from '@fastgpt/global/core/app/tool/httpTool/constants';
import type { CreateHttpToolsBodyType } from '@fastgpt/global/openapi/core/app/httpTools/api';
import { AppReadChatLogRoleVal } from '@fastgpt/global/support/permission/app/constant';
import { PerResourceTypeEnum, WriteRoleVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('create http tools api', () => {
  /** 团队 owner 创建工具文件夹，并给成员授予该文件夹上的指定角色。 */
  const setupToolFolder = async (role: number) => {
    const users = await getFakeUsers(1);
    const [member] = users.members;
    const folder = await MongoApp.create({
      name: 'tool-folder',
      type: AppTypeEnum.toolFolder,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      modules: []
    });
    const folderId = String(folder._id);
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.app,
      teamId: member.teamId,
      resourceId: folderId,
      tmbId: member.tmbId,
      permission: role
    });
    return { member, folderId };
  };

  const createInFolder = (
    auth: Awaited<ReturnType<typeof getFakeUsers>>['members'][number],
    parentId: string
  ) =>
    Call<CreateHttpToolsBodyType, Record<string, never>, string>(handler, {
      auth,
      body: { name: 'http-tools', parentId, createType: HttpToolTypeEnum.batch }
    });

  it('allows a collaborator with write permission on the tool folder', async () => {
    const { member, folderId } = await setupToolFolder(WriteRoleVal);

    const res = await createInFolder(member, folderId);

    expect(res).toMatchObject({ code: 200 });
    const created = await MongoApp.findById(res.data).lean();
    expect(created?.type).toBe(AppTypeEnum.httpToolSet);
    expect(String(created?.parentId)).toBe(folderId);
  });

  it('rejects a collaborator who can only read the folder chat logs', async () => {
    const { member, folderId } = await setupToolFolder(AppReadChatLogRoleVal);

    const res = await createInFolder(member, folderId);

    expect(res).toMatchObject({ code: 500, error: AppErrEnum.unAuthApp });
    expect(await MongoApp.countDocuments({ parentId: folderId })).toBe(0);
  });
});
