import updateHandler from '@/pages/api/core/app/update';
import moveHandler from '@/pages/api/core/app/batch/move';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  createResourceDefaultCollaborators,
  getResourceOwnedClbs
} from '@fastgpt/service/support/permission/controller';
import { updateResourceCollaborators } from '@fastgpt/service/support/permission/resourcePermissionService';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, it, expect, beforeEach } from 'vitest';

const toPermissionRows = (collaborators: { tmbId?: unknown; permission: number }[]) =>
  collaborators
    .map((collaborator) => ({
      tmbId: String(collaborator.tmbId),
      permission: collaborator.permission
    }))
    .sort((a, b) => a.tmbId.localeCompare(b.tmbId));

const createAppWithOwnerSnapshot = async ({
  teamId,
  tmbId,
  name,
  type
}: {
  teamId: string;
  tmbId: string;
  name: string;
  type: AppTypeEnum;
}) => {
  const app = await MongoApp.create({ teamId, tmbId, name, type, modules: [] });
  await mongoSessionRun((session) =>
    createResourceDefaultCollaborators({
      resource: {
        _id: String(app._id),
        type: app.type,
        teamId: String(app.teamId)
      },
      resourceType: PerResourceTypeEnum.app,
      tmbId: String(app.tmbId),
      session
    })
  );
  return app;
};

const setAppCollaborators = async ({
  appId,
  teamId,
  type,
  collaborators
}: {
  appId: string;
  teamId: string;
  type: string;
  collaborators: { tmbId: string; permission: number }[];
}) => {
  await mongoSessionRun(async (session) => {
    await updateResourceCollaborators({
      resource: { _id: appId, type, teamId },
      resourceModel: MongoApp,
      resourceType: PerResourceTypeEnum.app,
      oldCollaborators: await getResourceOwnedClbs({
        teamId,
        resourceId: appId,
        resourceType: PerResourceTypeEnum.app,
        session
      }),
      newCollaborators: collaborators,
      session
    });
  });
};

describe('move app', () => {
  beforeEach(async () => {
    await MongoApp.deleteMany({});
  });

  it('keeps an independent app isolated when moved into a shared folder', async () => {
    const { owner, members } = await getFakeUsers(1);
    const member = members[0];
    const teamId = String(owner.teamId);

    const target = await createAppWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'target-folder',
      type: AppTypeEnum.folder
    });
    await setAppCollaborators({
      appId: String(target._id),
      teamId,
      type: target.type,
      collaborators: [
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(member.tmbId), permission: ReadRoleVal }
      ]
    });

    const app = await createAppWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'independent-app',
      type: AppTypeEnum.simple
    });
    await MongoApp.updateOne({ _id: app._id }, { inheritPermission: false });

    const res = await Call(updateHandler, {
      auth: owner,
      query: { appId: String(app._id) },
      body: { parentId: String(target._id) }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    const updated = await MongoApp.findById(app._id).lean();
    expect(String(updated?.parentId)).toBe(String(target._id));
    expect(updated?.inheritPermission).toBe(false);

    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(app._id),
        resourceType: PerResourceTypeEnum.app
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([{ tmbId: String(owner.tmbId), permission: OwnerRoleVal }])
    );
  });

  it('merges the target folder collaborators when an inheriting app is moved', async () => {
    const { owner, members } = await getFakeUsers(1);
    const member = members[0];
    const teamId = String(owner.teamId);

    const target = await createAppWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'target-folder',
      type: AppTypeEnum.folder
    });
    await setAppCollaborators({
      appId: String(target._id),
      teamId,
      type: target.type,
      collaborators: [
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(member.tmbId), permission: ReadRoleVal }
      ]
    });

    const app = await createAppWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'inheriting-app',
      type: AppTypeEnum.simple
    });

    const res = await Call(updateHandler, {
      auth: owner,
      query: { appId: String(app._id) },
      body: { parentId: String(target._id) }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    const updated = await MongoApp.findById(app._id).lean();
    expect(String(updated?.parentId)).toBe(String(target._id));
    expect(updated?.inheritPermission).toBe(true);

    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(app._id),
        resourceType: PerResourceTypeEnum.app
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(member.tmbId), permission: ReadRoleVal }
      ])
    );
  });

  it('keeps an independent app isolated when moved back to root', async () => {
    const { owner } = await getFakeUsers(1);
    const teamId = String(owner.teamId);

    const folder = await createAppWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'folder',
      type: AppTypeEnum.folder
    });
    const app = await createAppWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'independent-app',
      type: AppTypeEnum.simple
    });
    await MongoApp.updateOne(
      { _id: app._id },
      { parentId: String(folder._id), inheritPermission: false }
    );

    const res = await Call(updateHandler, {
      auth: owner,
      query: { appId: String(app._id) },
      body: { parentId: null }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    const updated = await MongoApp.findById(app._id).lean();
    expect(updated?.parentId ?? null).toBeNull();
    expect(updated?.inheritPermission).toBe(false);

    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(app._id),
        resourceType: PerResourceTypeEnum.app
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([{ tmbId: String(owner.tmbId), permission: OwnerRoleVal }])
    );
  });

  it('keeps independent apps isolated during batch move', async () => {
    const { owner, members } = await getFakeUsers(1);
    const member = members[0];
    const teamId = String(owner.teamId);

    const target = await createAppWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'batch-target-folder',
      type: AppTypeEnum.folder
    });
    await setAppCollaborators({
      appId: String(target._id),
      teamId,
      type: target.type,
      collaborators: [
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(member.tmbId), permission: ReadRoleVal }
      ]
    });

    const independentApp = await createAppWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'independent-app',
      type: AppTypeEnum.simple
    });
    await MongoApp.updateOne({ _id: independentApp._id }, { inheritPermission: false });

    const inheritingApp = await createAppWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'inheriting-app',
      type: AppTypeEnum.simple
    });

    const res = await Call(moveHandler, {
      auth: owner,
      body: {
        ids: [String(independentApp._id), String(inheritingApp._id)],
        parentId: String(target._id)
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    expect(res.data.successIds).toEqual(
      expect.arrayContaining([String(independentApp._id), String(inheritingApp._id)])
    );

    const updatedIndependent = await MongoApp.findById(independentApp._id).lean();
    expect(String(updatedIndependent?.parentId)).toBe(String(target._id));
    expect(updatedIndependent?.inheritPermission).toBe(false);
    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(independentApp._id),
        resourceType: PerResourceTypeEnum.app
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([{ tmbId: String(owner.tmbId), permission: OwnerRoleVal }])
    );

    const updatedInheriting = await MongoApp.findById(inheritingApp._id).lean();
    expect(String(updatedInheriting?.parentId)).toBe(String(target._id));
    expect(updatedInheriting?.inheritPermission).toBe(true);
    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(inheritingApp._id),
        resourceType: PerResourceTypeEnum.app
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(member.tmbId), permission: ReadRoleVal }
      ])
    );
  });
});
