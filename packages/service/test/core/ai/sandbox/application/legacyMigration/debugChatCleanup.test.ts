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
      lean: vi.fn().mockResolvedValue([{ chatId: 'legacy-debug-chat' }])
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
      scannedSkillCount: 2,
      cleanup: {
        conflictAppSkillCount: 1,
        cleanupSkillCount: 1,
        totalLegacyChats: 1,
        totalChatItems: 1,
        totalChatItemResponses: 1,
        deletedSkillCount: 1,
        pendingChatCount: 0,
        list: [{ skillId: cleanSkillId, deleted: true }]
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
});
