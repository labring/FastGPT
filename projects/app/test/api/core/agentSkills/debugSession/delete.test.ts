import { describe, it, expect, beforeEach } from 'vitest';
import handler from '@/pages/api/core/agentSkills/debugSession/delete';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/agentSkills/constants';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('debugSession/delete', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;
  let chatId: string;

  beforeEach(async () => {
    testUser = await getUser(`debug-session-delete-${getNanoid(6)}`);

    const skill = await MongoAgentSkills.create({
      name: 'Test Delete Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    skillId = String(skill._id);

    chatId = getNanoid();
    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId: skillId,
      chatId,
      source: ChatSourceEnum.test,
      title: 'Session To Delete'
    });
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
  it('should reject request without auth', async () => {
    const res = await Call(handler, {
      body: { skillId, chatId }
    });
    expect(res.code).not.toBe(200);
  });

  it('should reject when user does not own the skill', async () => {
    const otherUser = await getUser(`debug-session-delete-other-${getNanoid(6)}`);
    const res = await Call(handler, {
      auth: otherUser,
      body: { skillId, chatId }
    });
    expect(res.code).not.toBe(200);
  });

  // ── Soft delete ───────────────────────────────
  it('should soft-delete the session (set deleteTime)', async () => {
    const res = await Call(handler, {
      auth: testUser,
      body: { skillId, chatId }
    });

    expect(res.code).toBe(200);

    const doc = await MongoChat.findOne({ appId: skillId, chatId }).select('+deleteTime').lean();
    expect(doc).not.toBeNull();
    expect(doc!.deleteTime).toBeInstanceOf(Date);
  });

  it('should not hard-delete the document', async () => {
    await Call(handler, {
      auth: testUser,
      body: { skillId, chatId }
    });

    const count = await MongoChat.countDocuments({ appId: skillId, chatId });
    expect(count).toBe(1); // document still exists, just marked deleted
  });

  it('should succeed silently for a non-existent chatId (no-op)', async () => {
    const res = await Call(handler, {
      auth: testUser,
      body: { skillId, chatId: getNanoid() }
    });
    // MongoChat.updateOne with no match is not an error
    expect(res.code).toBe(200);
  });

  it('should not affect sessions of a different skill', async () => {
    const otherSkill = await MongoAgentSkills.create({
      name: 'Other Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    const otherChatId = getNanoid();
    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId: String(otherSkill._id),
      chatId: otherChatId,
      source: ChatSourceEnum.test,
      title: 'Other Skill Session'
    });

    // Delete from original skill using the other skill's chatId (wrong skillId binding)
    await Call(handler, {
      auth: testUser,
      body: { skillId, chatId: otherChatId }
    });

    // Other skill's session must be untouched
    const doc = await MongoChat.findOne({
      appId: String(otherSkill._id),
      chatId: otherChatId
    }).lean();
    expect(doc!.deleteTime).toBeUndefined();
  });
});
