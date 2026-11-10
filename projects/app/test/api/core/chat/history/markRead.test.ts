import handler from '@/pages/api/core/chat/history/markRead';
import type { MarkChatReadBodyType } from '@fastgpt/global/openapi/core/chat/history/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it } from 'vitest';

describe('markRead api test', () => {
  let owner: Awaited<ReturnType<typeof getUser>>;
  let readonlyUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;

  const createUnreadChat = async (tmbId: string) => {
    const chatId = getNanoid();
    await MongoChat.create({
      teamId: owner.teamId,
      tmbId,
      sourceType: ChatSourceTypeEnum.app,
      appId,
      chatId,
      source: ChatSourceEnum.online,
      title: 'Unread chat',
      hasBeenRead: false
    });
    return chatId;
  };

  beforeEach(async () => {
    owner = await getUser(`mark-read-owner-${getNanoid(6)}`);
    readonlyUser = await getUser(`mark-read-readonly-${getNanoid(6)}`, owner.teamId);

    const app = await MongoApp.create({
      name: 'Test App',
      type: AppTypeEnum.simple,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      modules: []
    });
    appId = String(app._id);

    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.app,
      teamId: owner.teamId,
      resourceId: appId,
      tmbId: readonlyUser.tmbId,
      permission: ReadPermissionVal
    });
  });

  it('should allow a read-only app member to mark their own chat as read', async () => {
    const chatId = await createUnreadChat(readonlyUser.tmbId);

    const res = await Call<MarkChatReadBodyType>(handler, {
      auth: readonlyUser,
      body: { appId, chatId }
    });

    expect(res).toMatchObject({ code: 200 });
    expect((await MongoChat.findOne({ appId, chatId }).lean())?.hasBeenRead).toBe(true);
  });

  it('should reject a read-only app member marking another member chat as read', async () => {
    const chatId = await createUnreadChat(owner.tmbId);

    const res = await Call<MarkChatReadBodyType>(handler, {
      auth: readonlyUser,
      body: { appId, chatId }
    });

    expect(res.code).not.toBe(200);
    expect((await MongoChat.findOne({ appId, chatId }).lean())?.hasBeenRead).toBe(false);
  });
});
