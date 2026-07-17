import handler from '@/pages/api/core/chat/history/updateHistory';
import type { UpdateHistoryBodyType } from '@fastgpt/global/openapi/core/chat/history/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, beforeEach } from 'vitest';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';

describe('updateHistory api test', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatId: string;

  beforeEach(async () => {
    testUser = await getUser('test-user-update-history');

    // Create test app
    const app = await MongoApp.create({
      name: 'Test App',
      type: AppTypeEnum.simple,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      modules: []
    });
    appId = String(app._id);
    // Create log permission
    await MongoResourcePermission.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      resourceId: appId,
      permission: AppReadChatLogPerVal,
      resourceType: PerResourceTypeEnum.app
    });
    chatId = getNanoid();

    // Create chat
    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      sourceType: ChatSourceTypeEnum.app,
      appId,
      chatId,
      source: ChatSourceEnum.test,
      title: 'Original Title'
    });
  });

  it('should update chat title successfully', async () => {
    const newTitle = 'Updated Title';

    const res = await Call<UpdateHistoryBodyType, unknown>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        title: newTitle
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that chat title was updated
    const updatedChat = await MongoChat.findOne({
      appId,
      chatId
    });

    expect(updatedChat?.title).toBe(newTitle);
  });

  it('should update customTitle successfully', async () => {
    const customTitle = 'Custom Title';

    const res = await Call<UpdateHistoryBodyType, unknown>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        customTitle
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that customTitle was updated
    const updatedChat = await MongoChat.findOne({
      appId,
      chatId
    });

    expect(updatedChat?.customTitle).toBe(customTitle);
  });

  it('should update top status successfully', async () => {
    const res = await Call<UpdateHistoryBodyType, unknown>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        top: true
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that top was updated
    const updatedChat = await MongoChat.findOne({
      appId,
      chatId
    });

    expect(updatedChat?.top).toBe(true);
  });

  it('should allow a read-only app member to pin their own history', async () => {
    const readonlyUser = await getUser(`readonly-update-history-${getNanoid(6)}`, testUser.teamId);
    const readonlyUserChatId = getNanoid();

    await Promise.all([
      MongoResourcePermission.create({
        resourceType: PerResourceTypeEnum.app,
        teamId: testUser.teamId,
        resourceId: appId,
        tmbId: readonlyUser.tmbId,
        permission: ReadPermissionVal
      }),
      MongoChat.create({
        teamId: testUser.teamId,
        tmbId: readonlyUser.tmbId,
        sourceType: ChatSourceTypeEnum.app,
        appId,
        chatId: readonlyUserChatId,
        source: ChatSourceEnum.online,
        title: 'Readonly user chat'
      })
    ]);

    const res = await Call<UpdateHistoryBodyType, unknown>(handler, {
      auth: readonlyUser,
      body: {
        appId,
        chatId: readonlyUserChatId,
        top: true
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    const updatedChat = await MongoChat.findOne({ appId, chatId: readonlyUserChatId }).lean();
    expect(updatedChat?.top).toBe(true);
  });

  it('should reject a read-only app member updating another member history', async () => {
    const readonlyUser = await getUser(`readonly-update-history-${getNanoid(6)}`, testUser.teamId);
    const otherUser = await getUser(`other-update-history-${getNanoid(6)}`, testUser.teamId);
    const otherUserChatId = getNanoid();

    await Promise.all([
      MongoResourcePermission.create({
        resourceType: PerResourceTypeEnum.app,
        teamId: testUser.teamId,
        resourceId: appId,
        tmbId: readonlyUser.tmbId,
        permission: ReadPermissionVal
      }),
      MongoChat.create({
        teamId: testUser.teamId,
        tmbId: otherUser.tmbId,
        sourceType: ChatSourceTypeEnum.app,
        appId,
        chatId: otherUserChatId,
        source: ChatSourceEnum.online,
        title: 'Other user chat',
        top: false
      })
    ]);

    const res = await Call<UpdateHistoryBodyType, unknown>(handler, {
      auth: readonlyUser,
      body: {
        appId,
        chatId: otherUserChatId,
        top: true
      }
    });

    expect(res.code).not.toBe(200);

    const unchangedChat = await MongoChat.findOne({ appId, chatId: otherUserChatId }).lean();
    expect(unchangedChat?.top).toBe(false);
  });

  it('should reject a read-only skill collaborator updating skill edit history', async () => {
    const readonlyUser = await getUser(`readonly-skill-history-${getNanoid(6)}`, testUser.teamId);
    const skill = await MongoAgentSkills.create({
      name: 'Readonly Update Skill History',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    const skillId = String(skill._id);
    const skillChatId = getNanoid();

    await Promise.all([
      MongoResourcePermission.create({
        resourceType: PerResourceTypeEnum.agentSkill,
        teamId: testUser.teamId,
        resourceId: skillId,
        tmbId: readonlyUser.tmbId,
        permission: ReadPermissionVal
      }),
      MongoChat.create({
        teamId: testUser.teamId,
        tmbId: readonlyUser.tmbId,
        sourceType: ChatSourceTypeEnum.skillEdit,
        appId: skillId,
        chatId: skillChatId,
        source: ChatSourceEnum.test,
        top: false
      })
    ]);

    const res = await Call<UpdateHistoryBodyType, unknown>(handler, {
      auth: readonlyUser,
      body: {
        skillId,
        chatId: skillChatId,
        top: true
      }
    });

    expect(res.code).not.toBe(200);

    const unchangedChat = await MongoChat.findOne({
      sourceType: ChatSourceTypeEnum.skillEdit,
      appId: skillId,
      chatId: skillChatId
    }).lean();
    expect(unchangedChat?.top).toBe(false);
  });

  it('should update top status for share history without appId', async () => {
    const shareId = `share-update-history-${getNanoid()}`;
    const outLinkUid = `share-user-${getNanoid()}`;

    await MongoOutLink.create({
      shareId,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId,
      type: PublishChannelEnum.share,
      name: 'Share Link'
    });
    await MongoChat.updateOne(
      { appId, chatId },
      {
        $set: {
          shareId,
          outLinkUid,
          source: ChatSourceEnum.share
        }
      }
    );

    const res = await Call<UpdateHistoryBodyType, unknown>(handler, {
      body: {
        outLinkAuthData: {
          shareId,
          outLinkUid
        },
        chatId,
        top: true
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    const updatedChat = await MongoChat.findOne({
      appId,
      chatId,
      shareId,
      outLinkUid
    });

    expect(updatedChat?.top).toBe(true);
  });

  it('should update multiple fields at once', async () => {
    const newTitle = 'New Title';
    const customTitle = 'New Custom Title';
    const top = true;

    const res = await Call<UpdateHistoryBodyType, unknown>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        title: newTitle,
        customTitle,
        top
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that all fields were updated
    const updatedChat = await MongoChat.findOne({
      appId,
      chatId
    });

    expect(updatedChat?.title).toBe(newTitle);
    expect(updatedChat?.customTitle).toBe(customTitle);
    expect(updatedChat?.top).toBe(top);
  });

  it('should update updateTime when updating', async () => {
    const originalChat = await MongoChat.findOne({ appId, chatId });
    const originalUpdateTime = originalChat?.updateTime;

    // Wait a bit to ensure time difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    const res = await Call<UpdateHistoryBodyType, unknown>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        title: 'New Title'
      }
    });

    expect(res.code).toBe(200);

    const updatedChat = await MongoChat.findOne({ appId, chatId });
    expect(updatedChat?.updateTime.getTime()).toBeGreaterThan(originalUpdateTime?.getTime() || 0);
  });

  it('should fail when chatId is missing', async () => {
    const res = await Call<UpdateHistoryBodyType, unknown>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId: '',
        title: 'New Title'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should fail when appId is missing', async () => {
    const res = await Call<UpdateHistoryBodyType, unknown>(handler, {
      auth: testUser,
      body: {
        appId: '',
        chatId,
        title: 'New Title'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should fail when user does not have permission', async () => {
    const unauthorizedUser = await getUser('unauthorized-user-update-history');

    const res = await Call<UpdateHistoryBodyType, unknown>(handler, {
      auth: unauthorizedUser,
      body: {
        appId,
        chatId,
        title: 'New Title'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });
});
