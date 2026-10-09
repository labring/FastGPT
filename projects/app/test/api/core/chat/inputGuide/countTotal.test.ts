import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/core/chat/inputGuide/countTotal';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { PerResourceTypeEnum, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('GET /core/chat/inputGuide/countTotal', () => {
  let owner: Awaited<ReturnType<typeof getUser>>;
  let member: Awaited<ReturnType<typeof getUser>>;
  let outsider: Awaited<ReturnType<typeof getUser>>;
  let appId: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    owner = await getUser('guide-owner');
    member = await getUser('guide-member', owner.teamId);
    outsider = await getUser('guide-outsider');
    const app = await MongoApp.create({
      name: 'Private input guides',
      type: AppTypeEnum.simple,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    appId = String(app._id);
    await MongoChatInputGuide.create([
      { appId, text: 'first' },
      { appId, text: 'second' },
      { appId, text: 'third' }
    ]);
  });

  it('returns the count for the application owner', async () => {
    const res = await Call(handler, { auth: owner, query: { appId } });
    expect(res).toMatchObject({ code: 200, data: { total: 3 } });
  });

  it('allows a member explicitly granted application read access', async () => {
    await MongoResourcePermission.create({
      teamId: owner.teamId,
      tmbId: member.tmbId,
      resourceType: PerResourceTypeEnum.app,
      resourceId: appId,
      permission: ReadRoleVal
    });
    const res = await Call(handler, { auth: member, query: { appId } });
    expect(res).toMatchObject({ code: 200, data: { total: 3 } });
  });

  it.each(['same-team', 'cross-team'] as const)(
    'rejects an unauthorized %s member before counting records',
    async (scope) => {
      const countSpy = vi.spyOn(MongoChatInputGuide, 'countDocuments');
      const res = await Call(handler, {
        auth: scope === 'same-team' ? member : outsider,
        query: { appId }
      });
      expect(res).toMatchObject({ code: 500, error: AppErrEnum.unAuthApp });
      expect(res.data).toBeUndefined();
      expect(countSpy).not.toHaveBeenCalled();
    }
  );

  it('rejects anonymous requests before counting records', async () => {
    const countSpy = vi.spyOn(MongoChatInputGuide, 'countDocuments');
    const res = await Call(handler, { query: { appId } });
    expect(res.code).toBe(500);
    expect(countSpy).not.toHaveBeenCalled();
  });

  it('does not expose orphaned guides for a deleted application', async () => {
    await MongoApp.updateOne({ _id: appId }, { $set: { deleteTime: new Date() } });
    const countSpy = vi.spyOn(MongoChatInputGuide, 'countDocuments');
    const res = await Call(handler, { auth: owner, query: { appId } });
    expect(res).toMatchObject({ code: 500, error: AppErrEnum.unExist });
    expect(countSpy).not.toHaveBeenCalled();
  });

  it('returns zero for an authorized application without guides', async () => {
    await MongoChatInputGuide.deleteMany({ appId });
    const res = await Call(handler, { auth: owner, query: { appId } });
    expect(res).toMatchObject({ code: 200, data: { total: 0 } });
  });

  it('rejects an invalid appId before counting records', async () => {
    const countSpy = vi.spyOn(MongoChatInputGuide, 'countDocuments');
    const res = await Call(handler, { auth: owner, query: { appId: 'invalid' } });
    expect(res.code).toBe(500);
    expect(countSpy).not.toHaveBeenCalled();
  });
});
