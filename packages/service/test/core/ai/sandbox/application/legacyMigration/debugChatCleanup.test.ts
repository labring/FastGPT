import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findSkills: vi.fn(),
  findApps: vi.fn(),
  findChats: vi.fn(),
  countChats: vi.fn(),
  deleteChats: vi.fn(),
  countChatItems: vi.fn(),
  deleteChatItems: vi.fn(),
  countChatItemResponses: vi.fn(),
  deleteChatItemResponses: vi.fn(),
  addPrivateDeleteJob: vi.fn(),
  addPublicDeleteJob: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/skill/model/schema', () => ({
  MongoAgentSkills: { find: mocks.findSkills }
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: { find: mocks.findApps }
}));

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    find: mocks.findChats,
    countDocuments: mocks.countChats,
    deleteMany: mocks.deleteChats
  }
}));

vi.mock('@fastgpt/service/core/chat/chatItemSchema', () => ({
  MongoChatItem: {
    countDocuments: mocks.countChatItems,
    deleteMany: mocks.deleteChatItems
  }
}));

vi.mock('@fastgpt/service/core/chat/chatItemResponseSchema', () => ({
  MongoChatItemResponse: {
    countDocuments: mocks.countChatItemResponses,
    deleteMany: mocks.deleteChatItemResponses
  }
}));

vi.mock('@fastgpt/service/common/s3/config/constants', () => ({
  S3Buckets: { public: 'public' }
}));

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({ addDeleteJob: mocks.addPrivateDeleteJob })
}));

vi.stubGlobal('s3BucketMap', {
  public: { addDeleteJob: mocks.addPublicDeleteJob }
});

import { cleanupLegacySkillDebugChats } from '@fastgpt/service/core/ai/sandbox/application/legacyMigration/debugChatCleanup';

const cleanSkillId = '65f000000000000000000031';
const conflictSkillId = '65f000000000000000000032';

describe('cleanupLegacySkillDebugChats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findSkills.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: cleanSkillId }, { _id: conflictSkillId }])
    });
    mocks.findApps.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: conflictSkillId }])
    });
    mocks.findChats.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ appId: cleanSkillId, chatId: 'legacy-debug-chat' }])
    });
    mocks.countChats.mockResolvedValue(0);
    mocks.countChatItems.mockResolvedValue(1);
    mocks.countChatItemResponses.mockResolvedValue(1);
    mocks.deleteChats.mockResolvedValue({ deletedCount: 1 });
    mocks.deleteChatItems.mockResolvedValue({ deletedCount: 1 });
    mocks.deleteChatItemResponses.mockResolvedValue({ deletedCount: 1 });
    mocks.addPrivateDeleteJob.mockResolvedValue(undefined);
    mocks.addPublicDeleteJob.mockResolvedValue(undefined);
  });

  it('deletes legacy debug chats and skips a Skill ID that conflicts with an App', async () => {
    const result = await cleanupLegacySkillDebugChats({ dryRun: false });

    expect(result).toMatchObject({
      cleanup: {
        conflictAppSkillCount: 1,
        matchedSkillCount: 1,
        totalLegacyChats: 1,
        totalChatItems: 1,
        totalChatItemResponses: 1,
        cleanedSkillCount: 1,
        pendingChatCount: 0,
        list: [{ skillId: cleanSkillId, status: 'deleted' }]
      }
    });
    expect(mocks.deleteChatItemResponses).toHaveBeenCalledOnce();
    expect(mocks.deleteChatItems).toHaveBeenCalledOnce();
    expect(mocks.deleteChats).toHaveBeenCalledOnce();
    expect(mocks.addPrivateDeleteJob).toHaveBeenCalledWith({
      prefix: `chat/${cleanSkillId}`
    });
    expect(mocks.addPublicDeleteJob).toHaveBeenCalledWith({
      prefix: `chat/${cleanSkillId}`
    });
  });

  it('reports matched legacy chats without deleting them during dry-run', async () => {
    mocks.countChats.mockResolvedValue(1);

    const result = await cleanupLegacySkillDebugChats({ dryRun: true });

    expect(result).toMatchObject({
      cleanup: {
        conflictAppSkillCount: 1,
        matchedSkillCount: 1,
        totalLegacyChats: 1,
        cleanedSkillCount: 0,
        pendingChatCount: 1,
        list: [{ skillId: cleanSkillId, status: 'pending' }]
      }
    });
    expect(mocks.deleteChats).not.toHaveBeenCalled();
    expect(mocks.addPrivateDeleteJob).not.toHaveBeenCalled();
  });

  it('returns an empty cleanup list when no legacy debug chat exists', async () => {
    mocks.findSkills.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

    const result = await cleanupLegacySkillDebugChats({ dryRun: false });

    expect(result).toEqual({
      cleanup: {
        conflictAppSkillCount: 0,
        matchedSkillCount: 0,
        totalLegacyChats: 0,
        totalChatItems: 0,
        totalChatItemResponses: 0,
        cleanedSkillCount: 0,
        pendingChatCount: 0,
        list: []
      }
    });
    expect(mocks.findApps).not.toHaveBeenCalled();
  });

  it('reports empty Skills while keeping the upstream scan semantics', async () => {
    const emptySkillId = '65f000000000000000000033';
    mocks.findSkills.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: cleanSkillId }, { _id: emptySkillId }])
    });
    mocks.findChats.mockImplementation((query: { appId: string }) => ({
      lean: vi
        .fn()
        .mockResolvedValue(query.appId === cleanSkillId ? [{ chatId: 'legacy-debug-chat' }] : [])
    }));

    const result = await cleanupLegacySkillDebugChats({ dryRun: true });

    expect(result.cleanup).toMatchObject({
      conflictAppSkillCount: 1,
      matchedSkillCount: 2,
      totalLegacyChats: 1,
      pendingChatCount: 0,
      list: [
        { skillId: cleanSkillId, chatCount: 1, status: 'pending' },
        { skillId: emptySkillId, chatCount: 0, status: 'pending' }
      ]
    });
  });
});
