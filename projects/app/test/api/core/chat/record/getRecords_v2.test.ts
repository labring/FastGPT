import handler from '@/pages/api/core/chat/record/getRecords_v2';
import paginationHandler from '@/pages/api/core/chat/record/getPaginationRecords';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type {
  GetRecordsV2BodyType,
  GetRecordsV2ResponseType
} from '@fastgpt/global/openapi/core/chat/record/api';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
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
    expect(res.data.prevCursor).toBeNull();
    expect(res.data.nextCursor).toBeNull();
  });

  it('returns null cursors when no conversation is selected', async () => {
    const res = await Call<GetRecordsV2BodyType, any, GetRecordsV2ResponseType>(handler, {
      auth: testUser,
      body: { skillId }
    });
    expect(res.code).toBe(200);
    expect(res.data).toEqual({
      list: [],
      total: 0,
      hasMorePrev: false,
      hasMoreNext: false,
      prevCursor: null,
      nextCursor: null
    });
  });

  it('returns readable history when a persisted Preview reply has no recognized action', async () => {
    const human = await MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      userId: testUser.userId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      appId: skillId,
      chatId,
      dataId: getNanoid(),
      obj: ChatRoleEnum.Human,
      value: [
        {
          text: { content: 'Continue with the previous plan' },
          select: {
            type: 'workflowBuilderPreview',
            questions: [{ question: 'Continue?', value: 'confirm' }]
          }
        }
      ]
    });
    await createSkillItem({ text: 'Existing answer' });

    const res = await Call<GetRecordsV2BodyType, any, GetRecordsV2ResponseType>(handler, {
      auth: testUser,
      body: { skillId, chatId, pageSize: 10 }
    });

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(2);
    const message = res.data.list.find((item) => item.dataId === human.dataId);
    expect(message?.value).toEqual([{ text: { content: 'Continue with the previous plan' } }]);
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
    expect(res.data.prevCursor).toBe(res.data.list[0].dataId);
    expect(res.data.nextCursor).toBeNull();
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

    // 锚点角色由方向决定，pageSize=1 也需返回完整轮次。
    for (const direction of ['nextId', 'prevId', 'initialId'] as const) {
      const page = await Call<GetRecordsV2BodyType, any, GetRecordsV2ResponseType>(handler, {
        auth: testUser,
        body: {
          appId: String(app._id),
          sourceType: ChatSourceTypeEnum.chatAgentHelper,
          chatId: helperChatId,
          pageSize: 1,
          [direction]: 'helper-round-1'
        }
      });
      expect(page.code).toBe(200);
      expect(page.data.list.map((item) => item.obj)).toEqual(
        direction === 'initialId' ? [ChatRoleEnum.Human, ChatRoleEnum.AI] : []
      );
      expect(page.data.prevCursor).toBeNull();
      expect(page.data.nextCursor).toBeNull();
    }
  });

  it('preserves public node errorText and hides internal node diagnostics for outLink share history in both getRecords_v2 and getPaginationRecords', async () => {
    const app = await MongoApp.create({
      name: 'Share Error Records App',
      type: AppTypeEnum.simple,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      modules: []
    });
    const shareId = `share_${getNanoid(8)}`;
    const outLinkUid = `uid_${getNanoid(8)}`;
    const shareChatId = getNanoid();
    const publicErrDataId = 'share-err-round-public';
    const internalErrDataId = 'share-err-round-internal';

    const outLink = await MongoOutLink.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId: app._id,
      shareId,
      type: 'share',
      name: 'Share Error Test',
      allowAnonymous: true
    });

    await Promise.all([
      MongoChat.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        sourceType: ChatSourceTypeEnum.app,
        appId: String(app._id),
        chatId: shareChatId,
        source: ChatSourceEnum.share,
        shareId,
        outLinkUid,
        publishSource: {
          type: ChatSourceEnum.share,
          id: String(outLink._id)
        }
      }),
      MongoChatItem.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        sourceType: ChatSourceTypeEnum.app,
        appId: String(app._id),
        chatId: shareChatId,
        dataId: publicErrDataId,
        obj: ChatRoleEnum.AI,
        value: []
      }),
      MongoChatItemResponse.create({
        teamId: testUser.teamId,
        sourceType: ChatSourceTypeEnum.app,
        appId: String(app._id),
        chatId: shareChatId,
        chatItemDataId: publicErrDataId,
        data: {
          id: 'agent-err-resp',
          nodeId: 'agent-node',
          moduleName: 'Agent',
          moduleType: FlowNodeTypeEnum.agent,
          errorText: 'Sandbox error: runtime failed'
        }
      }),
      MongoChatItem.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        sourceType: ChatSourceTypeEnum.app,
        appId: String(app._id),
        chatId: shareChatId,
        dataId: internalErrDataId,
        obj: ChatRoleEnum.AI,
        value: []
      }),
      MongoChatItemResponse.create({
        teamId: testUser.teamId,
        sourceType: ChatSourceTypeEnum.app,
        appId: String(app._id),
        chatId: shareChatId,
        chatItemDataId: internalErrDataId,
        data: {
          id: 'http-err-resp',
          nodeId: 'http-node',
          moduleName: 'HTTP 请求',
          moduleType: FlowNodeTypeEnum.httpRequest468,
          errorText: '500 Internal Server Error\n{"secret":"upstream-body-leak"}'
        }
      })
    ]);

    const v2Res = await Call<GetRecordsV2BodyType, any, GetRecordsV2ResponseType>(handler, {
      body: {
        chatId: shareChatId,
        outLinkAuthData: {
          shareId,
          outLinkUid
        },
        pageSize: 10
      }
    });
    expect(v2Res.code).toBe(200);
    const v2PublicItem = v2Res.data.list.find((item) => item.dataId === publicErrDataId);
    const v2InternalItem = v2Res.data.list.find((item) => item.dataId === internalErrDataId);
    expect(v2PublicItem?.errorText).toEqual({
      moduleName: 'Agent',
      errorText: 'Sandbox error: runtime failed'
    });
    expect(v2InternalItem?.errorText).toBeUndefined();
    expect(JSON.stringify(v2Res.data)).not.toContain('upstream-body-leak');

    const pageRes = await Call<any, any, { list: any[] }>(paginationHandler, {
      body: {
        chatId: shareChatId,
        outLinkAuthData: {
          shareId,
          outLinkUid
        },
        offset: 0,
        pageSize: 10
      }
    });
    expect(pageRes.code).toBe(200);
    const pagePublicItem = pageRes.data.list.find((item) => item.dataId === publicErrDataId);
    const pageInternalItem = pageRes.data.list.find((item) => item.dataId === internalErrDataId);
    expect(pagePublicItem?.errorText).toEqual({
      moduleName: 'Agent',
      errorText: 'Sandbox error: runtime failed'
    });
    expect(pageInternalItem?.errorText).toBeUndefined();
    expect(JSON.stringify(pageRes.data)).not.toContain('upstream-body-leak');
  });
});
