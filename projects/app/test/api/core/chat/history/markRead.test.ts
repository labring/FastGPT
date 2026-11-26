import handler from '@/pages/api/core/chat/history/markRead';
import type { MarkChatReadBodyType } from '@fastgpt/global/openapi/core/chat/history/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  ReadPermissionVal,
  WriteRoleVal
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

describe('markRead skill permissions', () => {
  let owner: Awaited<ReturnType<typeof getUser>>;
  let member: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;
  const chatId = 'skill-unread-chat';
  const updateTime = new Date('2020-01-01T00:00:00.000Z');

  beforeEach(async () => {
    owner = await getUser('mark-read-skill-owner');
    member = await getUser('mark-read-skill-member', owner.teamId);

    const skill = await MongoAgentSkills.create({
      name: 'Test Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    skillId = String(skill._id);

    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId: owner.teamId,
      resourceId: skillId,
      tmbId: member.tmbId,
      permission: ReadPermissionVal
    });
    await MongoChat.create({
      appId: skillId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      chatId,
      source: ChatSourceEnum.test,
      title: 'Unread skill chat',
      hasBeenRead: false,
      updateTime
    });
  });

  it.each(['their own', "another member's"] as const)(
    'rejects a read-only skill member marking %s chat without changing it',
    async (target) => {
      if (target === 'their own') {
        await MongoChat.updateOne({ appId: skillId, chatId }, { $set: { tmbId: member.tmbId } });
      }

      const res = await Call<MarkChatReadBodyType>(handler, {
        auth: member,
        body: { skillId, chatId }
      });

      expect(res).toMatchObject({ code: 500, error: SkillErrEnum.unAuthSkill });
      expect(await MongoChat.findOne({ appId: skillId, chatId }).lean()).toMatchObject({
        hasBeenRead: false,
        updateTime
      });
    }
  );

  it('preserves a skill writer access to another member chat', async () => {
    await MongoResourcePermission.updateOne(
      { resourceType: PerResourceTypeEnum.agentSkill, resourceId: skillId, tmbId: member.tmbId },
      { $set: { permission: WriteRoleVal } }
    );

    const res = await Call<MarkChatReadBodyType>(handler, {
      auth: member,
      body: { skillId, chatId }
    });

    expect(res.code).toBe(200);
    const chat = await MongoChat.findOne({ appId: skillId, chatId }).lean();
    expect(chat?.hasBeenRead).toBe(true);
    expect(chat?.updateTime.getTime()).toBeGreaterThan(updateTime.getTime());
    expect(String(chat?.tmbId)).toBe(owner.tmbId);
  });
});
