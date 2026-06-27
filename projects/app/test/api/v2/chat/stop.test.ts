import handler from '@/pages/api/v2/chat/stop';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  ChatGenerateStatusEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type {
  StopV2ChatParams,
  StopV2ChatResponse
} from '@fastgpt/global/openapi/core/chat/controler/api';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import {
  setAgentRuntimeStop,
  waitForWorkflowComplete
} from '@fastgpt/service/core/workflow/dispatch/workflowStatus';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/core/workflow/dispatch/workflowStatus', () => ({
  setAgentRuntimeStop: vi.fn(),
  waitForWorkflowComplete: vi.fn()
}));

describe('v2 chat stop skill edit target', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;
  let chatId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    testUser = await getUser(`skill-stop-${getNanoid(6)}`);
    const skill = await MongoAgentSkills.create({
      name: 'Stop Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    skillId = String(skill._id);
    chatId = getNanoid();
  });

  it('should set workflow stop key with skill edit source target', async () => {
    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      appId: skillId,
      chatId,
      source: ChatSourceEnum.test,
      chatGenerateStatus: ChatGenerateStatusEnum.done
    });

    const res = await Call<StopV2ChatParams, any, StopV2ChatResponse>(handler, {
      auth: testUser,
      body: {
        skillId,
        chatId
      }
    });

    expect(res.code).toBe(200);
    expect(res.data).toEqual({
      success: true,
      completed: true,
      chatGenerateStatus: ChatGenerateStatusEnum.done
    });
    expect(vi.mocked(setAgentRuntimeStop)).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId
    });
    expect(vi.mocked(waitForWorkflowComplete)).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId,
      timeout: 5000
    });
  });

  it('should keep completed=false when skill edit chat is still generating after wait', async () => {
    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      appId: skillId,
      chatId,
      source: ChatSourceEnum.test,
      chatGenerateStatus: ChatGenerateStatusEnum.generating
    });

    const res = await Call<StopV2ChatParams, any, StopV2ChatResponse>(handler, {
      auth: testUser,
      body: {
        skillId,
        chatId
      }
    });

    expect(res.code).toBe(200);
    expect(res.data).toEqual({
      success: true,
      completed: false,
      chatGenerateStatus: ChatGenerateStatusEnum.generating
    });
  });

  it('should reject missing target and avoid setting stop key', async () => {
    const res = await Call<Partial<StopV2ChatParams>, any, StopV2ChatResponse>(handler, {
      auth: testUser,
      body: {
        chatId
      }
    });

    expect(res.code).not.toBe(200);
    expect(vi.mocked(setAgentRuntimeStop)).not.toHaveBeenCalled();
  });

  it('should reject request without auth and avoid setting stop key', async () => {
    const res = await Call<StopV2ChatParams, any, StopV2ChatResponse>(handler, {
      body: {
        skillId,
        chatId
      }
    });

    expect(res.code).not.toBe(200);
    expect(vi.mocked(setAgentRuntimeStop)).not.toHaveBeenCalled();
  });
});
