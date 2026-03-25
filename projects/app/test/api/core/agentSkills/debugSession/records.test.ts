import { describe, it, expect, beforeEach } from 'vitest';
import handler from '@/pages/api/core/agentSkills/debugSession/records';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/agentSkills/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import type { getChatRecordsResponse } from '@/pages/api/core/chat/record/getRecords_v2';

// Helper: create a human chat item
async function createHumanItem({
  appId,
  chatId,
  teamId,
  tmbId,
  text = 'hello'
}: {
  appId: string;
  chatId: string;
  teamId: string;
  tmbId: string;
  text?: string;
}) {
  return MongoChatItem.create({
    teamId,
    tmbId,
    appId,
    chatId,
    dataId: getNanoid(),
    obj: ChatRoleEnum.Human,
    value: [{ text: { content: text } }],
    time: new Date()
  });
}

// Helper: create an AI chat item
async function createAIItem({
  appId,
  chatId,
  teamId,
  tmbId,
  text = 'world'
}: {
  appId: string;
  chatId: string;
  teamId: string;
  tmbId: string;
  text?: string;
}) {
  return MongoChatItem.create({
    teamId,
    tmbId,
    appId,
    chatId,
    dataId: getNanoid(),
    obj: ChatRoleEnum.AI,
    value: [{ text: { content: text } }],
    time: new Date()
  });
}

describe('debugSession/records', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;
  let chatId: string;

  beforeEach(async () => {
    testUser = await getUser(`debug-records-${getNanoid(6)}`);

    const skill = await MongoAgentSkills.create({
      name: 'Test Records Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    skillId = String(skill._id);
    chatId = getNanoid();
  });

  // ── Parameter validation ──────────────────────
  it('should reject when skillId is missing', async () => {
    const res = await Call(handler, {
      auth: testUser,
      body: { chatId }
    });
    expect(res.code).not.toBe(200);
  });

  it('should reject when chatId is missing', async () => {
    const res = await Call(handler, {
      auth: testUser,
      body: { skillId }
    });
    expect(res.code).not.toBe(200);
  });

  // ── Auth ──────────────────────────────────────
  it('should reject request without auth token', async () => {
    const res = await Call(handler, {
      body: { skillId, chatId }
    });
    expect(res.code).not.toBe(200);
  });

  it('should reject when skillId does not exist', async () => {
    const fakeSkillId = '507f1f77bcf86cd799439011';
    const res = await Call(handler, {
      auth: testUser,
      body: { skillId: fakeSkillId, chatId }
    });
    expect(res.code).not.toBe(200);
  });

  it('should reject when user does not own the skill', async () => {
    const otherUser = await getUser(`debug-records-other-${getNanoid(6)}`);
    const res = await Call(handler, {
      auth: otherUser,
      body: { skillId, chatId }
    });
    expect(res.code).not.toBe(200);
  });

  // ── Empty result ──────────────────────────────
  it('should return empty list when no chat items exist', async () => {
    const res = await Call<any, any, getChatRecordsResponse>(handler, {
      auth: testUser,
      body: { skillId, chatId }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(0);
    expect(res.data.total).toBe(0);
    expect(res.data.hasMorePrev).toBe(false);
    expect(res.data.hasMoreNext).toBe(false);
  });

  // ── Normal result ─────────────────────────────
  it('should return chat items for the given skillId + chatId', async () => {
    await createHumanItem({
      appId: skillId,
      chatId,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      text: 'ping'
    });
    await createAIItem({
      appId: skillId,
      chatId,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      text: 'pong'
    });

    const res = await Call<any, any, getChatRecordsResponse>(handler, {
      auth: testUser,
      body: { skillId, chatId }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(2);
    expect(res.data.total).toBe(2);
  });

  it('should include required fields in each item', async () => {
    await createHumanItem({
      appId: skillId,
      chatId,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      text: 'test message'
    });

    const res = await Call<any, any, getChatRecordsResponse>(handler, {
      auth: testUser,
      body: { skillId, chatId }
    });

    expect(res.code).toBe(200);
    const item = res.data.list[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('obj');
    expect(item).toHaveProperty('value');
    expect(typeof item.id).toBe('string');
  });

  it('should not return items from a different chatId', async () => {
    const otherChatId = getNanoid();
    await createHumanItem({
      appId: skillId,
      chatId: otherChatId,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });

    const res = await Call<any, any, getChatRecordsResponse>(handler, {
      auth: testUser,
      body: { skillId, chatId }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(0);
  });

  it('should not return items from a different skillId', async () => {
    const otherSkill = await MongoAgentSkills.create({
      name: 'Other Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    await createHumanItem({
      appId: String(otherSkill._id),
      chatId,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });

    const res = await Call<any, any, getChatRecordsResponse>(handler, {
      auth: testUser,
      body: { skillId, chatId }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(0);
  });

  // ── Soft-deleted items ────────────────────────
  it('should exclude soft-deleted chat items', async () => {
    const doc = await createHumanItem({
      appId: skillId,
      chatId,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    await MongoChatItem.updateOne({ _id: doc._id }, { $set: { deleteTime: new Date() } });

    const res = await Call<any, any, getChatRecordsResponse>(handler, {
      auth: testUser,
      body: { skillId, chatId }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(0);
  });

  // ── pageSize ──────────────────────────────────
  it('should respect pageSize parameter', async () => {
    // Create 5 items
    for (let i = 0; i < 5; i++) {
      await createHumanItem({
        appId: skillId,
        chatId,
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        text: `message ${i}`
      });
    }

    const res = await Call<any, any, getChatRecordsResponse>(handler, {
      auth: testUser,
      body: { skillId, chatId, pageSize: 3 }
    });

    expect(res.code).toBe(200);
    expect(res.data.list.length).toBeLessThanOrEqual(3);
    expect(res.data.total).toBe(5);
  });

  // ── Linked pagination ─────────────────────────
  it('should return hasMorePrev=true when there are older items beyond pageSize', async () => {
    const items = [];
    for (let i = 0; i < 5; i++) {
      const doc = await createHumanItem({
        appId: skillId,
        chatId,
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        text: `message ${i}`
      });
      items.push(doc);
    }

    // Use the last item's dataId as initialId to anchor at the end
    const lastDataId = items[items.length - 1].dataId;

    const res = await Call<any, any, getChatRecordsResponse>(handler, {
      auth: testUser,
      body: { skillId, chatId, pageSize: 3, initialId: lastDataId }
    });

    expect(res.code).toBe(200);
    // With 5 items and pageSize=3 anchored at last, there should be more previous items
    expect(res.data.hasMorePrev).toBe(true);
  });

  it('should navigate forward using nextId', async () => {
    const items = [];
    for (let i = 0; i < 4; i++) {
      const doc = await createHumanItem({
        appId: skillId,
        chatId,
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        text: `message ${i}`
      });
      items.push(doc);
    }

    // First page: get 2 items
    const page1 = await Call<any, any, getChatRecordsResponse>(handler, {
      auth: testUser,
      body: { skillId, chatId, pageSize: 2 }
    });
    expect(page1.code).toBe(200);
    expect(page1.data.list).toHaveLength(2);

    if (page1.data.hasMoreNext && page1.data.list.length > 0) {
      // Navigate to next page
      const lastId = page1.data.list[page1.data.list.length - 1].dataId;
      const page2 = await Call<any, any, getChatRecordsResponse>(handler, {
        auth: testUser,
        body: { skillId, chatId, pageSize: 2, nextId: lastId }
      });
      expect(page2.code).toBe(200);
      expect(page2.data.list.length).toBeGreaterThan(0);
    }
  });
});
