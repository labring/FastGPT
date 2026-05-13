import { describe, it, expect, beforeEach } from 'vitest';
import handler from '@/pages/api/core/agentSkills/debugSession/markRead';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/agentSkills/constants';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('debugSession/markRead', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;
  let chatId: string;

  beforeEach(async () => {
    testUser = await getUser(`debug-session-mark-read-${getNanoid(6)}`);

    const skill = await MongoAgentSkills.create({
      name: 'Test Mark Read Skill',
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
      title: 'Unread Session',
      hasBeenRead: false
    });
  });

  it('should reject when chatId is missing', async () => {
    const res = await Call(handler, {
      auth: testUser,
      body: { skillId }
    });

    expect(res.code).not.toBe(200);
  });

  it('should reject request without auth', async () => {
    const res = await Call(handler, {
      body: { skillId, chatId }
    });

    expect(res.code).not.toBe(200);
  });

  it('should mark skill debug session as read', async () => {
    const res = await Call(handler, {
      auth: testUser,
      body: { skillId, chatId }
    });

    expect(res.code).toBe(200);

    const chat = await MongoChat.findOne({ appId: skillId, chatId }).lean();
    expect(chat?.hasBeenRead).toBe(true);
    expect(chat?.updateTime).toBeInstanceOf(Date);
  });
});
