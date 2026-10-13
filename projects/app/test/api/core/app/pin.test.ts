import handler from '@/pages/api/core/app/pin';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import type {
  PinAppBodyType,
  PinAppQueryType,
  PinAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getFakeUsers, getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';
import type { parseHeaderCertRet } from '@test/mocks/request';

const callPin = ({
  auth,
  appId,
  isPinned
}: {
  auth: parseHeaderCertRet;
  appId: string;
  isPinned: boolean;
}) =>
  Call<PinAppBodyType, PinAppQueryType, PinAppResponseType>(handler, {
    auth,
    query: { appId },
    body: { isPinned }
  });

const createApp = ({
  teamId,
  tmbId,
  extra = {}
}: {
  teamId: string;
  tmbId: string;
  extra?: Record<string, unknown>;
}) =>
  MongoApp.create({
    name: `app-${getNanoid(6)}`,
    type: AppTypeEnum.workflow,
    teamId,
    tmbId,
    modules: [],
    ...extra
  });

const grantAppPer = ({
  teamId,
  resourceId,
  tmbId,
  permission
}: {
  teamId: string;
  resourceId: string;
  tmbId: string;
  permission: number;
}) =>
  MongoResourcePermission.create({
    resourceType: PerResourceTypeEnum.app,
    teamId,
    resourceId,
    tmbId,
    permission
  });

describe('PUT /api/core/app/pin', () => {
  it('pins an app without touching updateTime or writing an audit log', async () => {
    const user = await getUser(`app-pin-${getNanoid(6)}`);
    const updateTime = new Date('2024-01-01T00:00:00.000Z');
    const app = await createApp({
      teamId: user.teamId,
      tmbId: user.tmbId,
      extra: { updateTime }
    });
    const auditCountBefore = await MongoTeamAudit.countDocuments({ teamId: user.teamId });

    const res = await callPin({ auth: user, appId: String(app._id), isPinned: true });

    expect(res.code).toBe(200);
    expect(res.data.isPinned).toBe(true);

    const pinned = await MongoApp.findById(app._id).lean();
    expect(pinned?.isPinned).toBe(true);
    expect(pinned?.pinnedAt).toBeInstanceOf(Date);
    // 置顶是排序行为，不能让应用在普通排序里换位置
    expect(pinned?.updateTime).toEqual(updateTime);
    expect(await MongoTeamAudit.countDocuments({ teamId: user.teamId })).toBe(auditCountBefore);
  });

  it('keeps repeated pin requests idempotent', async () => {
    const user = await getUser(`app-pin-${getNanoid(6)}`);
    const app = await createApp({ teamId: user.teamId, tmbId: user.tmbId });

    await callPin({ auth: user, appId: String(app._id), isPinned: true });
    const firstPinnedAt = (await MongoApp.findById(app._id).lean())?.pinnedAt;

    await new Promise((resolve) => setTimeout(resolve, 10));
    const res = await callPin({ auth: user, appId: String(app._id), isPinned: true });

    expect(res.code).toBe(200);
    // 重复置顶不刷新置顶时间，避免置顶项之间顺序抖动
    expect((await MongoApp.findById(app._id).lean())?.pinnedAt).toEqual(firstPinnedAt);
  });

  it('clears the pin state and pin time when unpinning', async () => {
    const user = await getUser(`app-pin-${getNanoid(6)}`);
    const updateTime = new Date('2024-01-01T00:00:00.000Z');
    const app = await createApp({
      teamId: user.teamId,
      tmbId: user.tmbId,
      extra: { updateTime }
    });

    await callPin({ auth: user, appId: String(app._id), isPinned: true });
    const res = await callPin({ auth: user, appId: String(app._id), isPinned: false });

    expect(res.code).toBe(200);
    expect(res.data.isPinned).toBe(false);

    const unpinned = await MongoApp.findById(app._id).lean();
    expect(unpinned?.isPinned).toBe(false);
    expect(unpinned?.pinnedAt ?? null).toBeNull();
    // 取消置顶后要能回到原排序位置，因此同样不能改动 updateTime
    expect(unpinned?.updateTime).toEqual(updateTime);
  });

  it('allows the app manager but rejects a write-only collaborator', async () => {
    const { owner, members } = await getFakeUsers(2);
    const app = await createApp({ teamId: owner.teamId, tmbId: owner.tmbId });
    await grantAppPer({
      teamId: owner.teamId,
      resourceId: String(app._id),
      tmbId: members[0].tmbId,
      permission: ManagePermissionVal
    });
    await grantAppPer({
      teamId: owner.teamId,
      resourceId: String(app._id),
      tmbId: members[1].tmbId,
      permission: WritePermissionVal
    });

    const managed = await callPin({ auth: members[0], appId: String(app._id), isPinned: true });
    expect(managed.code).toBe(200);

    const writeOnly = await callPin({ auth: members[1], appId: String(app._id), isPinned: true });
    expect(writeOnly.error).toBe(AppErrEnum.unAuthApp);

    const readOnly = await callPin({ auth: owner, appId: String(app._id), isPinned: true });
    expect(readOnly.code).toBe(200);
  });

  it('rejects a collaborator without any app permission', async () => {
    const { owner, members } = await getFakeUsers(1);
    const app = await createApp({ teamId: owner.teamId, tmbId: owner.tmbId });
    await grantAppPer({
      teamId: owner.teamId,
      resourceId: String(app._id),
      tmbId: members[0].tmbId,
      permission: ReadPermissionVal
    });

    const res = await callPin({ auth: members[0], appId: String(app._id), isPinned: true });
    expect(res.error).toBe(AppErrEnum.unAuthApp);
  });

  it('follows the app permission inheritance switch for the parent folder manager', async () => {
    const { owner, members } = await getFakeUsers(1);
    const folder = await MongoApp.create({
      name: `folder-${getNanoid(6)}`,
      type: AppTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    await grantAppPer({
      teamId: owner.teamId,
      resourceId: String(folder._id),
      tmbId: members[0].tmbId,
      permission: ManagePermissionVal
    });

    const [inheritingApp, isolatedApp] = await MongoApp.create([
      {
        name: `app-${getNanoid(6)}`,
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        parentId: folder._id,
        inheritPermission: true,
        modules: []
      },
      {
        name: `app-${getNanoid(6)}`,
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        parentId: folder._id,
        inheritPermission: false,
        modules: []
      }
    ]);

    // 继承生效时，父文件夹管理权限并入应用权限，置顶权限随之成立
    const inherited = await callPin({
      auth: members[0],
      appId: String(inheritingApp._id),
      isPinned: true
    });
    expect(inherited.code).toBe(200);

    // 关闭继承后应用权限不再包含父文件夹角色，置顶权限与应用管理权限保持同一口径
    const isolated = await callPin({
      auth: members[0],
      appId: String(isolatedApp._id),
      isPinned: true
    });
    expect(isolated.error).toBe(AppErrEnum.unAuthApp);
  });

  it('pins a folder with its own manager, and does not inherit folder permission from the parent', async () => {
    const { owner, members } = await getFakeUsers(2);
    const parentFolder = await MongoApp.create({
      name: `folder-${getNanoid(6)}`,
      type: AppTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const childFolder = await MongoApp.create({
      name: `folder-${getNanoid(6)}`,
      type: AppTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      parentId: parentFolder._id
    });
    await grantAppPer({
      teamId: owner.teamId,
      resourceId: String(parentFolder._id),
      tmbId: members[0].tmbId,
      permission: ManagePermissionVal
    });
    await grantAppPer({
      teamId: owner.teamId,
      resourceId: String(childFolder._id),
      tmbId: members[1].tmbId,
      permission: ManagePermissionVal
    });

    const childManager = await callPin({
      auth: members[1],
      appId: String(childFolder._id),
      isPinned: true
    });
    expect(childManager.code).toBe(200);

    // 文件夹不继承父文件夹权限，因此父文件夹管理员不能置顶子文件夹
    const parentManager = await callPin({
      auth: members[0],
      appId: String(childFolder._id),
      isPinned: true
    });
    expect(parentManager.error).toBe(AppErrEnum.unAuthApp);
  });

  it('rejects a member of another team', async () => {
    const { owner } = await getFakeUsers(1);
    const outsider = await getUser(`app-pin-outsider-${getNanoid(6)}`);
    const app = await createApp({ teamId: owner.teamId, tmbId: owner.tmbId });

    const res = await callPin({ auth: outsider, appId: String(app._id), isPinned: true });
    expect(res.error).toBe(AppErrEnum.unAuthApp);
  });

  it('rejects a soft deleted app', async () => {
    const user = await getUser(`app-pin-${getNanoid(6)}`);
    const app = await createApp({
      teamId: user.teamId,
      tmbId: user.tmbId,
      extra: { deleteTime: new Date() }
    });

    const res = await callPin({ auth: user, appId: String(app._id), isPinned: true });
    expect(res.error).toBe(AppErrEnum.unExist);
    expect((await MongoApp.findById(app._id).lean())?.isPinned ?? false).toBe(false);
  });
});
