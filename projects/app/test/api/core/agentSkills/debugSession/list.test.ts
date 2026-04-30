import { describe, it, expect, beforeEach } from 'vitest';
import handler from '@/pages/api/core/agentSkills/debugSession/list';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/agentSkills/constants';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import type { SkillDebugSessionListResponse } from '@fastgpt/global/core/agentSkills/api';

describe('debugSession/list', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;

  beforeEach(async () => {
    testUser = await getUser(`debug-session-list-${getNanoid(6)}`);

    const skill = await MongoAgentSkills.create({
      name: 'Test List Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    skillId = String(skill._id);
  });

  // ── Auth ──────────────────────────────────────
  it('should reject request without auth', async () => {
    const res = await Call(handler, {
      query: { skillId, pageNum: '1', pageSize: '10' }
    });
    expect(res.code).not.toBe(200);
  });

  it('should reject request with wrong skillId', async () => {
    const fakeSkillId = '507f1f77bcf86cd799439011';
    const res = await Call(handler, {
      auth: testUser,
      query: { skillId: fakeSkillId, pageNum: '1', pageSize: '10' }
    });
    expect(res.code).not.toBe(200);
  });

  // ── Empty result ──────────────────────────────
  it('should return empty list when no debug sessions exist', async () => {
    const res = await Call<any, any, SkillDebugSessionListResponse>(handler, {
      auth: testUser,
      query: { skillId, pageNum: '1', pageSize: '10' }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(0);
    expect(res.data.total).toBe(0);
  });

  // ── Normal list ───────────────────────────────
  it('should return only ChatSourceEnum.test sessions for the skill', async () => {
    const chatId1 = getNanoid();
    const chatId2 = getNanoid();

    await Promise.all([
      MongoChat.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        appId: skillId,
        chatId: chatId1,
        source: ChatSourceEnum.test,
        title: 'Debug Session 1'
      }),
      MongoChat.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        appId: skillId,
        chatId: chatId2,
        source: ChatSourceEnum.online, // should be excluded
        title: 'Online Session'
      })
    ]);

    const res = await Call<any, any, SkillDebugSessionListResponse>(handler, {
      auth: testUser,
      query: { skillId, pageNum: '1', pageSize: '10' }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0].chatId).toBe(chatId1);
    expect(res.data.total).toBe(1);
  });

  it('should exclude soft-deleted sessions', async () => {
    const chatId = getNanoid();
    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId: skillId,
      chatId,
      source: ChatSourceEnum.test,
      title: 'Deleted Session',
      deleteTime: new Date()
    });

    const res = await Call<any, any, SkillDebugSessionListResponse>(handler, {
      auth: testUser,
      query: { skillId, pageNum: '1', pageSize: '10' }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(0);
    expect(res.data.total).toBe(0);
  });

  it('should include required fields in each item', async () => {
    const chatId = getNanoid();
    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId: skillId,
      chatId,
      source: ChatSourceEnum.test,
      title: 'Session With Fields'
    });

    const res = await Call<any, any, SkillDebugSessionListResponse>(handler, {
      auth: testUser,
      query: { skillId, pageNum: '1', pageSize: '10' }
    });

    expect(res.code).toBe(200);
    const item = res.data.list[0];
    expect(item).toHaveProperty('chatId', chatId);
    expect(item).toHaveProperty('title', 'Session With Fields');
    expect(item).toHaveProperty('updateTime');
    expect(typeof item.updateTime).toBe('string'); // ISO string
  });

  // ── Pagination ────────────────────────────────
  it('should paginate results correctly', async () => {
    // Create 5 sessions
    await Promise.all(
      Array.from({ length: 5 }).map((_, i) =>
        MongoChat.create({
          teamId: testUser.teamId,
          tmbId: testUser.tmbId,
          appId: skillId,
          chatId: getNanoid(),
          source: ChatSourceEnum.test,
          title: `Session ${i}`
        })
      )
    );

    const page1 = await Call<any, any, SkillDebugSessionListResponse>(handler, {
      auth: testUser,
      query: { skillId, pageNum: '1', pageSize: '3' }
    });
    expect(page1.code).toBe(200);
    expect(page1.data.list).toHaveLength(3);
    expect(page1.data.total).toBe(5);

    const page2 = await Call<any, any, SkillDebugSessionListResponse>(handler, {
      auth: testUser,
      query: { skillId, pageNum: '2', pageSize: '3' }
    });
    expect(page2.code).toBe(200);
    expect(page2.data.list).toHaveLength(2);
    expect(page2.data.total).toBe(5);
  });

  it('should sort by updateTime descending', async () => {
    const chatId1 = getNanoid();
    const chatId2 = getNanoid();

    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId: skillId,
      chatId: chatId1,
      source: ChatSourceEnum.test,
      title: 'Older',
      updateTime: new Date('2024-01-01')
    });
    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId: skillId,
      chatId: chatId2,
      source: ChatSourceEnum.test,
      title: 'Newer',
      updateTime: new Date('2024-06-01')
    });

    const res = await Call<any, any, SkillDebugSessionListResponse>(handler, {
      auth: testUser,
      query: { skillId, pageNum: '1', pageSize: '10' }
    });

    expect(res.code).toBe(200);
    expect(res.data.list[0].chatId).toBe(chatId2); // newer first
    expect(res.data.list[1].chatId).toBe(chatId1);
  });

  it('should not return sessions from a different skill', async () => {
    const otherSkill = await MongoAgentSkills.create({
      name: 'Other Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId: String(otherSkill._id),
      chatId: getNanoid(),
      source: ChatSourceEnum.test,
      title: 'Other Skill Session'
    });

    const res = await Call<any, any, SkillDebugSessionListResponse>(handler, {
      auth: testUser,
      query: { skillId, pageNum: '1', pageSize: '10' }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(0);
  });
});
