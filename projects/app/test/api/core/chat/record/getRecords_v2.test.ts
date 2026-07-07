import handler from '@/pages/api/core/chat/record/getRecords_v2';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type {
  GetRecordsV2BodyType,
  GetRecordsV2ResponseType
} from '@fastgpt/global/openapi/core/chat/record/api';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it } from 'vitest';

describe('getRecords_v2 skill edit target', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;
  let chatId: string;

  const createSkillItem = async ({
    dataId = getNanoid(),
    sourceType = ChatSourceTypeEnum.skillEdit,
    sourceId = skillId,
    targetChatId = chatId,
    text = dataId,
    deleteTime
  }: {
    dataId?: string;
    sourceType?: ChatSourceTypeEnum;
    sourceId?: string;
    targetChatId?: string;
    text?: string;
    deleteTime?: Date | null;
  } = {}) =>
    MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      userId: testUser.userId,
      sourceType,
      appId: sourceId,
      chatId: targetChatId,
      dataId,
      obj: ChatRoleEnum.AI,
      value: [{ type: 'text', text: { content: text } }],
      ...(deleteTime !== undefined ? { deleteTime } : {})
    });

  beforeEach(async () => {
    testUser = await getUser(`skill-records-v2-${getNanoid(6)}`);
    const skill = await MongoAgentSkills.create({
      name: 'Records Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    skillId = String(skill._id);
    chatId = getNanoid();

    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      appId: skillId,
      chatId,
      source: ChatSourceEnum.test,
      title: 'Skill Records'
    });
  });

  it('should read skill edit records through skillId target only', async () => {
    const keepId = getNanoid();
    const deletedId = getNanoid();
    const otherChatId = getNanoid();
    const otherSkill = await MongoAgentSkills.create({
      name: 'Other Records Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });

    await Promise.all([
      createSkillItem({ dataId: keepId, text: 'visible skill item' }),
      createSkillItem({ dataId: deletedId, deleteTime: new Date() }),
      createSkillItem({ targetChatId: otherChatId }),
      createSkillItem({ sourceId: String(otherSkill._id) }),
      MongoChatItem.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        userId: testUser.userId,
        sourceType: ChatSourceTypeEnum.skillEdit,
        appId: skillId,
        chatId,
        dataId: getNanoid(),
        obj: ChatRoleEnum.AI,
        value: [{ type: 'text', text: { content: 'legacy item' } }]
      })
    ]);
    await MongoChatItem.updateOne(
      {
        sourceType: ChatSourceTypeEnum.skillEdit,
        appId: skillId,
        chatId,
        'value.0.text.content': 'legacy item'
      },
      { $unset: { sourceType: '' } }
    );

    const res = await Call<GetRecordsV2BodyType, any, GetRecordsV2ResponseType>(handler, {
      auth: testUser,
      body: {
        skillId,
        chatId,
        pageSize: 10
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(1);
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0]).toMatchObject({
      id: keepId,
      dataId: keepId
    });
  });

  it('should support linked pagination for skill edit records', async () => {
    const items = [];
    for (let index = 0; index < 5; index++) {
      items.push(await createSkillItem({ text: `message ${index}` }));
    }

    const res = await Call<GetRecordsV2BodyType, any, GetRecordsV2ResponseType>(handler, {
      auth: testUser,
      body: {
        skillId,
        chatId,
        pageSize: 3,
        initialId: items[items.length - 1].dataId
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(5);
    expect(res.data.list.length).toBeLessThanOrEqual(3);
    expect(res.data.hasMorePrev).toBe(true);
  });

  it('should read chatAgentHelper records through generic records api', async () => {
    const app = await MongoApp.create({
      name: 'ChatAgentHelper Records App',
      type: AppTypeEnum.simple,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      modules: []
    });
    const helperChatId = getNanoid();
    const [, humanItem, aiItem] = await Promise.all([
      MongoChat.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        userId: testUser.userId,
        sourceType: ChatSourceTypeEnum.chatAgentHelper,
        appId: String(app._id),
        chatId: helperChatId,
        source: ChatSourceEnum.test
      }),
      MongoChatItem.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        userId: testUser.userId,
        sourceType: ChatSourceTypeEnum.chatAgentHelper,
        appId: String(app._id),
        chatId: helperChatId,
        dataId: 'helper-round-1',
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'build an app' } }]
      }),
      MongoChatItem.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        userId: testUser.userId,
        sourceType: ChatSourceTypeEnum.chatAgentHelper,
        appId: String(app._id),
        chatId: helperChatId,
        dataId: 'helper-round-1',
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'agent draft' } }]
      })
    ]);

    const res = await Call<GetRecordsV2BodyType, any, GetRecordsV2ResponseType>(handler, {
      auth: testUser,
      body: {
        appId: String(app._id),
        sourceType: ChatSourceTypeEnum.chatAgentHelper,
        chatId: helperChatId,
        pageSize: 10
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(2);
    expect(res.data.list.map((item) => item.id)).toEqual([humanItem.dataId, aiItem.dataId]);
    expect(res.data.list.map((item) => item.dataId)).toEqual(['helper-round-1', 'helper-round-1']);
  });
});
