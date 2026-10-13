import { beforeEach, describe, expect, it } from 'vitest';
import initHandler from '@/pages/api/core/chat/init';
import permissionHandler from '@/pages/api/core/app/getPermission';
import recordsHandler from '@/pages/api/core/chat/record/getPaginationRecords';
import deleteRecordHandler from '@/pages/api/core/chat/record/delete';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamManageRoleVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

// 保留真实的应用/会话鉴权与 Mongo 查询，覆盖权限位从生产者传到各 API 的完整路径。
describe('hidden application chat permissions', () => {
  let owner: Awaited<ReturnType<typeof getUser>>;
  let member: Awaited<ReturnType<typeof getUser>>;
  let manager: Awaited<ReturnType<typeof getUser>>;
  let outsider: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  const chatId = 'owner-hidden-chat';
  const dataId = 'owner-hidden-message';

  beforeEach(async () => {
    owner = await getUser('hidden-owner');
    member = await getUser('hidden-member', owner.teamId);
    manager = await getUser('hidden-manager', owner.teamId);
    outsider = await getUser('hidden-outsider');
    await MongoResourcePermission.create({
      teamId: owner.teamId,
      tmbId: manager.tmbId,
      resourceType: PerResourceTypeEnum.team,
      resourceId: null,
      permission: TeamManageRoleVal
    });
    const app = await MongoApp.create({
      name: 'Hidden application',
      type: AppTypeEnum.hidden,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      modules: [],
      chatConfig: {}
    });
    appId = String(app._id);
    await MongoChat.create({
      appId,
      chatId,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      sourceType: ChatSourceTypeEnum.app,
      source: ChatSourceEnum.online,
      title: 'Private owner title',
      variables: { secret: 'private owner value' },
      chatGenerateStatus: ChatGenerateStatusEnum.done,
      hasBeenRead: false
    });
    await MongoChatItem.create({
      appId,
      chatId,
      dataId,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      userId: owner.userId,
      sourceType: ChatSourceTypeEnum.app,
      obj: ChatRoleEnum.Human,
      value: [{ text: { content: 'Private owner message' } }]
    });
  });

  it('reports read access without granting ordinary members chat log access', async () => {
    const res = await Call(permissionHandler, { auth: member, query: { appId } });
    expect(res).toMatchObject({
      code: 200,
      data: { hasReadPer: true, hasReadChatLogPer: false, hasWritePer: false, hasManagePer: false }
    });
  });

  it.each(['same-team', 'cross-team'] as const)(
    'rejects %s access to another member chat without marking it read',
    async (scope) => {
      const res = await Call(initHandler, {
        auth: scope === 'same-team' ? member : outsider,
        query: { appId, chatId }
      });
      expect(res).toMatchObject({
        code: 500,
        error: scope === 'same-team' ? ChatErrEnum.unAuthChat : AppErrEnum.unAuthApp
      });
      expect(res.data).toBeUndefined();
      expect((await MongoChat.findOne({ appId, chatId }).lean())?.hasBeenRead).toBe(false);
    }
  );

  it('rejects ordinary members reading another member messages', async () => {
    const res = await Call(recordsHandler, {
      auth: member,
      body: { appId, chatId, offset: 0, pageSize: 10 }
    });
    expect(res).toMatchObject({ code: 500, error: ChatErrEnum.unAuthChat });
    expect(res.data).toBeUndefined();
  });

  it('rejects ordinary members deleting another member messages without changing them', async () => {
    const res = await Call(deleteRecordHandler, {
      auth: member,
      body: { appId, chatId, contentId: dataId }
    });
    expect(res).toMatchObject({ code: 500, error: ChatErrEnum.unAuthChat });
    const message = await MongoChatItem.findOne({ appId, chatId, dataId }).lean();
    expect(message).toBeTruthy();
    expect(message?.deleteTime ?? null).toBeNull();
  });

  it('allows ordinary members to initialize a new chat', async () => {
    const res = await Call(initHandler, {
      auth: member,
      query: { appId, chatId: 'new-member-chat' }
    });
    expect(res.code).toBe(200);
  });

  it('preserves ordinary member access to their own chat and messages', async () => {
    await MongoChat.updateOne({ appId, chatId }, { $set: { tmbId: member.tmbId } });
    const initRes = await Call(initHandler, { auth: member, query: { appId, chatId } });
    expect(initRes).toMatchObject({
      code: 200,
      data: { title: 'Private owner title', variables: { secret: 'private owner value' } }
    });
    const recordsRes = await Call(recordsHandler, {
      auth: member,
      body: { appId, chatId, offset: 0, pageSize: 10 }
    });
    expect(recordsRes).toMatchObject({ code: 200, data: { total: 1 } });
    const deleteRes = await Call(deleteRecordHandler, {
      auth: member,
      body: { appId, chatId, contentId: dataId }
    });
    expect(deleteRes.code).toBe(200);
    expect(
      (await MongoChatItem.findOne({ appId, chatId, dataId }).lean())?.deleteTime
    ).toBeInstanceOf(Date);
  });

  it.each(['owner', 'manager'] as const)(
    'preserves %s access to chat initialization and history',
    async (role) => {
      const auth = role === 'owner' ? owner : manager;
      const permissionRes = await Call(permissionHandler, { auth, query: { appId } });
      expect(permissionRes).toMatchObject({ code: 200, data: { hasReadChatLogPer: true } });
      const initRes = await Call(initHandler, { auth, query: { appId, chatId } });
      expect(initRes).toMatchObject({ code: 200, data: { title: 'Private owner title' } });
      const recordsRes = await Call(recordsHandler, {
        auth,
        body: { appId, chatId, offset: 0, pageSize: 10 }
      });
      expect(recordsRes).toMatchObject({ code: 200, data: { total: 1 } });
    }
  );
});
