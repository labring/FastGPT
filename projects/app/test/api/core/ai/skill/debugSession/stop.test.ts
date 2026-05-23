import { describe, it, expect, beforeEach, vi } from 'vitest';
import handler from '@/pages/api/core/ai/skill/debugSession/stop';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import {
  setAgentRuntimeStop,
  shouldWorkflowStop,
  waitForWorkflowComplete
} from '@fastgpt/service/core/workflow/dispatch/workflowStatus';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '@fastgpt/service/core/ai/skill/edit/config';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';

vi.mock('@fastgpt/service/core/workflow/dispatch/workflowStatus', () => ({
  setAgentRuntimeStop: vi.fn(),
  shouldWorkflowStop: vi.fn(),
  waitForWorkflowComplete: vi.fn()
}));

describe('debugSession/stop', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;
  let chatId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(shouldWorkflowStop).mockResolvedValue(false);
    testUser = await getUser(`debug-session-stop-${getNanoid(6)}`);

    const skill = await MongoAgentSkills.create({
      name: 'Test Stop Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    skillId = String(skill._id);
    chatId = getNanoid();
  });

  it('should reject when skillId is missing', async () => {
    const res = await Call(handler, {
      auth: testUser,
      body: { chatId }
    });

    expect(res.code).not.toBe(200);
    expect(vi.mocked(setAgentRuntimeStop)).not.toHaveBeenCalled();
  });

  it('should reject request without auth', async () => {
    const res = await Call(handler, {
      body: { skillId, chatId }
    });

    expect(res.code).not.toBe(200);
    expect(vi.mocked(setAgentRuntimeStop)).not.toHaveBeenCalled();
  });

  it('should set workflow stop sign for skill debug session', async () => {
    const res = await Call(handler, {
      auth: testUser,
      body: { skillId, chatId }
    });

    expect(res.code).toBe(200);
    expect(res.data).toEqual({
      success: true,
      completed: true,
      chatGenerateStatus: ChatGenerateStatusEnum.done
    });
    expect(vi.mocked(setAgentRuntimeStop)).toHaveBeenCalledWith({
      appId: skillId,
      chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
    });
    expect(vi.mocked(waitForWorkflowComplete)).toHaveBeenCalledWith({
      appId: skillId,
      chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
      timeout: 5000
    });
    expect(vi.mocked(shouldWorkflowStop)).toHaveBeenCalledWith({
      appId: skillId,
      chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
    });
  });

  it('should keep generating status when workflow stop does not complete in wait window', async () => {
    vi.mocked(shouldWorkflowStop).mockResolvedValue(true);

    const res = await Call(handler, {
      auth: testUser,
      body: { skillId, chatId }
    });

    expect(res.code).toBe(200);
    expect(res.data).toEqual({
      success: true,
      completed: false,
      chatGenerateStatus: ChatGenerateStatusEnum.generating
    });
  });
});
