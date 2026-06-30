import handler from '@/pages/api/core/chat/record/delete';
import type { DeleteChatRecordBodyType } from '@fastgpt/global/openapi/core/chat/record/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it } from 'vitest';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';

describe('delete chat record api', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatId: string;

  const createChatItem = async (dataId: string) =>
    MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      userId: testUser.userId,
      sourceType: ChatSourceTypeEnum.app,
      appId,
      chatId,
      dataId,
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: `Response ${dataId}`
          }
        }
      ]
    });

  beforeEach(async () => {
    testUser = await getUser(`test-user-delete-chat-record-${Math.random()}`);

    const app = await MongoApp.create({
      name: 'Test App',
      type: AppTypeEnum.simple,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      modules: []
    });
    appId = String(app._id);
    chatId = getNanoid();

    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      sourceType: ChatSourceTypeEnum.app,
      appId,
      chatId,
      source: ChatSourceEnum.test
    });
  });

  it('should soft delete body contentIds and de-duplicate repeated ids', async () => {
    await Promise.all([
      createChatItem('delete-1'),
      createChatItem('delete-2'),
      createChatItem('keep-1')
    ]);

    const res = await Call<DeleteChatRecordBodyType, Record<string, never>>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        contentIds: ['delete-1', 'delete-1', 'delete-2']
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    const deletedItems = await MongoChatItem.find({
      appId,
      chatId,
      dataId: { $in: ['delete-1', 'delete-2'] }
    }).lean();
    expect(deletedItems).toHaveLength(2);
    deletedItems.forEach((item) => {
      expect(item.deleteTime).toBeInstanceOf(Date);
    });

    const keptItem = await MongoChatItem.findOne({ appId, chatId, dataId: 'keep-1' }).lean();
    expect(keptItem?.deleteTime).toBeNull();
  });

  it('should prefer body payload over query payload', async () => {
    await Promise.all([createChatItem('body-id'), createChatItem('query-id')]);

    const res = await Call<DeleteChatRecordBodyType, DeleteChatRecordBodyType>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        contentId: 'body-id'
      },
      query: {
        appId,
        chatId,
        contentId: 'query-id'
      }
    });

    expect(res.code).toBe(200);

    const bodyItem = await MongoChatItem.findOne({ appId, chatId, dataId: 'body-id' }).lean();
    const queryItem = await MongoChatItem.findOne({ appId, chatId, dataId: 'query-id' }).lean();
    expect(bodyItem?.deleteTime).toBeInstanceOf(Date);
    expect(queryItem?.deleteTime).toBeNull();
  });

  it('should keep compatibility with query contentId and comma separated contentIds', async () => {
    await Promise.all([
      createChatItem('legacy-single'),
      createChatItem('legacy-list-1'),
      createChatItem('legacy-list-2')
    ]);

    const res = await Call<Record<string, never>, DeleteChatRecordBodyType>(handler, {
      auth: testUser,
      query: {
        appId,
        chatId,
        contentId: 'legacy-single',
        contentIds: 'legacy-list-1, legacy-list-2'
      } as any
    });

    expect(res.code).toBe(200);

    const deletedCount = await MongoChatItem.countDocuments({
      appId,
      chatId,
      dataId: { $in: ['legacy-single', 'legacy-list-1', 'legacy-list-2'] },
      deleteTime: { $ne: null }
    });
    expect(deletedCount).toBe(3);
  });

  it('should authorize but skip update when no content id is provided', async () => {
    await createChatItem('keep-empty-target');

    const res = await Call<DeleteChatRecordBodyType, Record<string, never>>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId
      }
    });

    expect(res.code).toBe(200);

    const item = await MongoChatItem.findOne({ appId, chatId, dataId: 'keep-empty-target' }).lean();
    expect(item?.deleteTime).toBeNull();
  });

  it('should delete skill edit chat item by skillId without touching legacy skill debug rows', async () => {
    const skill = await MongoAgentSkills.create({
      name: 'Delete Skill Chat Item',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    const skillId = String(skill._id);
    const skillChatId = getNanoid();
    const contentId = getNanoid();

    const [, , legacyItem] = await Promise.all([
      MongoChat.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        sourceType: ChatSourceTypeEnum.skillEdit,
        appId: skillId,
        chatId: skillChatId,
        source: ChatSourceEnum.test
      }),
      MongoChatItem.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        userId: testUser.userId,
        sourceType: ChatSourceTypeEnum.skillEdit,
        appId: skillId,
        chatId: skillChatId,
        dataId: contentId,
        obj: ChatRoleEnum.AI,
        value: [{ type: 'text', text: { content: 'skill answer' } }]
      }),
      MongoChatItem.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        userId: testUser.userId,
        sourceType: ChatSourceTypeEnum.skillEdit,
        appId: skillId,
        chatId: skillChatId,
        dataId: contentId,
        obj: ChatRoleEnum.AI,
        value: [{ type: 'text', text: { content: 'legacy answer' } }]
      })
    ]);
    await MongoChatItem.updateOne({ _id: legacyItem._id }, { $unset: { sourceType: '' } });
    await MongoChatItem.updateOne(
      {
        sourceType: ChatSourceTypeEnum.skillEdit,
        appId: skillId,
        chatId: skillChatId,
        dataId: contentId,
        'value.0.text.content': 'legacy answer'
      },
      { $unset: { sourceType: '' } }
    );

    const res = await Call<DeleteChatRecordBodyType, Record<string, never>>(handler, {
      auth: testUser,
      body: {
        skillId,
        chatId: skillChatId,
        contentId
      }
    });

    expect(res.code).toBe(200);

    const [skillItem, legacyItem] = await Promise.all([
      MongoChatItem.findOne({
        sourceType: ChatSourceTypeEnum.skillEdit,
        appId: skillId,
        chatId: skillChatId,
        dataId: contentId
      }).lean(),
      MongoChatItem.findOne({
        sourceType: { $exists: false },
        appId: skillId,
        chatId: skillChatId,
        dataId: contentId
      }).lean()
    ]);
    expect(skillItem?.deleteTime).toBeInstanceOf(Date);
    expect(legacyItem?.deleteTime).toBeNull();
  });

  it('should reject read-only skill collaborator when deleting skill edit chat item', async () => {
    const readonlyUser = await getUser(`readonly-record-delete-${getNanoid(6)}`, testUser.teamId);
    const skill = await MongoAgentSkills.create({
      name: 'Readonly Delete Skill Chat Item',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    const skillId = String(skill._id);
    const skillChatId = getNanoid();
    const contentId = getNanoid();

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
        tmbId: testUser.tmbId,
        sourceType: ChatSourceTypeEnum.skillEdit,
        appId: skillId,
        chatId: skillChatId,
        source: ChatSourceEnum.test
      }),
      MongoChatItem.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        userId: testUser.userId,
        sourceType: ChatSourceTypeEnum.skillEdit,
        appId: skillId,
        chatId: skillChatId,
        dataId: contentId,
        obj: ChatRoleEnum.AI,
        value: [{ type: 'text', text: { content: 'debug answer' } }]
      })
    ]);

    const res = await Call<DeleteChatRecordBodyType, Record<string, never>>(handler, {
      auth: readonlyUser,
      body: {
        skillId,
        chatId: skillChatId,
        contentId
      }
    });

    expect(res.code).not.toBe(200);

    const item = await MongoChatItem.findOne({
      sourceType: ChatSourceTypeEnum.skillEdit,
      appId: skillId,
      chatId: skillChatId,
      dataId: contentId
    }).lean();
    expect(item?.deleteTime).toBeNull();
  });
});
