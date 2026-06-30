import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { SandboxStatusEnum, SandboxTypeEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  deleteSandboxResource: vi.fn(),
  deleteChatFilesByPrefix: vi.fn(),
  addChatDeleteJob: vi.fn(),
  addPublicDeleteJob: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mocks.authCert
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  deleteSandboxResource: mocks.deleteSandboxResource
}));

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    deleteChatFilesByPrefix: mocks.deleteChatFilesByPrefix,
    addDeleteJob: mocks.addChatDeleteJob
  })
}));

vi.mock('@fastgpt/service/common/s3/config/constants', () => ({
  S3Buckets: {
    public: 'public'
  }
}));

vi.stubGlobal('s3BucketMap', {
  public: {
    addDeleteJob: mocks.addPublicDeleteJob
  }
});

import { runInit4150Beta6Migration } from '@/pages/api/admin/4150/init4150-beta6';

const teamId = '65f000000000000000000021';
const tmbId = '65f000000000000000000022';

const createSkill = async (skillId: string) =>
  MongoAgentSkills.create({
    _id: skillId,
    name: `skill-${skillId}`,
    source: AgentSkillSourceEnum.personal,
    teamId,
    tmbId
  });

const createLegacySkillDebugChat = async ({
  skillId,
  chatId
}: {
  skillId: string;
  chatId: string;
}) => {
  await MongoChat.create({
    teamId,
    tmbId,
    sourceType: ChatSourceTypeEnum.skillEdit,
    appId: skillId,
    chatId,
    source: ChatSourceEnum.test,
    title: `legacy-${chatId}`
  });
  await MongoChatItem.create({
    teamId,
    tmbId,
    sourceType: ChatSourceTypeEnum.skillEdit,
    appId: skillId,
    chatId,
    dataId: `${chatId}-item`,
    obj: ChatRoleEnum.AI,
    value: [{ type: 'text', text: { content: 'answer' } }]
  });
  await MongoChatItemResponse.create({
    teamId,
    sourceType: ChatSourceTypeEnum.skillEdit,
    appId: skillId,
    chatId,
    chatItemDataId: `${chatId}-item`,
    data: { nodeId: 'node' }
  });

  await Promise.all([
    MongoChat.updateMany({ appId: skillId, chatId }, { $unset: { sourceType: '' } }),
    MongoChatItem.updateMany({ appId: skillId, chatId }, { $unset: { sourceType: '' } }),
    MongoChatItemResponse.updateMany({ appId: skillId, chatId }, { $unset: { sourceType: '' } })
  ]);
};

const createSkillSandboxInstance = async ({
  skillId,
  sandboxId,
  appId = skillId
}: {
  skillId: string;
  sandboxId: string;
  appId?: string;
}) =>
  MongoSandboxInstance.collection.insertOne({
    provider: 'opensandbox',
    sandboxId,
    appId,
    userId: 'user-1',
    chatId: `chat-${sandboxId}`,
    type: SandboxTypeEnum.editDebug,
    status: SandboxStatusEnum.running,
    lastActiveAt: new Date(),
    createdAt: new Date(),
    metadata: {
      skillId,
      teamId,
      tmbId
    }
  });

const createAppSandboxInstance = async ({
  appId,
  sandboxId,
  sourceType
}: {
  appId: string;
  sandboxId: string;
  sourceType?: ChatSourceTypeEnum;
}) =>
  MongoSandboxInstance.collection.insertOne({
    provider: 'opensandbox',
    sandboxId,
    appId,
    sourceType,
    sourceId: sourceType ? 'legacy-wrong-source' : undefined,
    userId: 'user-1',
    chatId: `chat-${sandboxId}`,
    type: SandboxTypeEnum.sessionRuntime,
    status: SandboxStatusEnum.running,
    lastActiveAt: new Date(),
    createdAt: new Date()
  });

describe('init4150-beta6 migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authCert.mockResolvedValue(undefined);
    mocks.deleteSandboxResource.mockImplementation(
      async (resource: { _id?: unknown; sandboxId: string }) => {
        await MongoSandboxInstance.deleteOne(
          resource._id ? { _id: resource._id } : { sandboxId: resource.sandboxId }
        );
      }
    );
    mocks.deleteChatFilesByPrefix.mockResolvedValue(undefined);
    mocks.addChatDeleteJob.mockResolvedValue(undefined);
    mocks.addPublicDeleteJob.mockResolvedValue(undefined);
  });

  it('dry-runs sandbox source migration and legacy skill debug chat cleanup', async () => {
    const skillId = '65f000000000000000000023';
    await createSkill(skillId);
    await createLegacySkillDebugChat({ skillId, chatId: 'legacy-chat-1' });
    await createSkillSandboxInstance({ skillId, sandboxId: 'legacy-sandbox-1' });
    await createAppSandboxInstance({
      appId: '65f000000000000000000099',
      sandboxId: 'app-sandbox-1'
    });

    const result = await runInit4150Beta6Migration({ dryRun: true });

    expect(result).toMatchObject({
      dryRun: true,
      scannedSkillCount: 1,
      sandboxMigration: {
        skillMatchedCount: 1,
        skillModifiedCount: 0,
        appMatchedCount: 1,
        appModifiedCount: 0,
        legacyFieldMatchedCount: 0,
        legacyFieldModifiedCount: 0,
        orphanMatchedCount: 0,
        orphanDeletedCount: 0,
        orphanFailedCount: 0
      },
      legacyDebugChatCleanup: {
        conflictAppSkillCount: 0,
        cleanupSkillCount: 1,
        totalLegacyChats: 1,
        totalChatItems: 1,
        totalChatItemResponses: 1,
        deletedSkillCount: 0,
        skippedEmptyCount: 0
      }
    });
    expect(await MongoChat.countDocuments({ appId: skillId })).toBe(1);
    expect(await MongoSandboxInstance.countDocuments({ appId: skillId })).toBe(1);
    expect(
      await MongoSandboxInstance.countDocuments({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId
      })
    ).toBe(0);
    expect(mocks.addChatDeleteJob).not.toHaveBeenCalled();
    expect(mocks.addPublicDeleteJob).not.toHaveBeenCalled();
  });

  it('migrates sandbox source fields and deletes only non-conflicting legacy skill debug chats', async () => {
    const deletableSkillId = '65f000000000000000000024';
    const conflictSkillId = '65f000000000000000000025';
    await Promise.all([createSkill(deletableSkillId), createSkill(conflictSkillId)]);
    await MongoApp.create({
      _id: conflictSkillId,
      name: 'conflict app',
      type: AppTypeEnum.simple,
      teamId,
      tmbId,
      modules: []
    });
    await Promise.all([
      createLegacySkillDebugChat({ skillId: deletableSkillId, chatId: 'legacy-chat-2' }),
      createLegacySkillDebugChat({ skillId: conflictSkillId, chatId: 'legacy-chat-3' }),
      createSkillSandboxInstance({ skillId: deletableSkillId, sandboxId: 'legacy-sandbox-2' }),
      createSkillSandboxInstance({ skillId: conflictSkillId, sandboxId: 'legacy-sandbox-3' }),
      createSkillSandboxInstance({
        skillId: conflictSkillId,
        sandboxId: 'legacy-sandbox-4',
        appId: 'other-app'
      }),
      createAppSandboxInstance({
        appId: '65f000000000000000000099',
        sandboxId: 'app-sandbox-2'
      }),
      createAppSandboxInstance({
        appId: '65f000000000000000000098',
        sandboxId: 'app-sandbox-3',
        sourceType: ChatSourceTypeEnum.skillEdit
      }),
      MongoSandboxInstance.collection.insertOne({
        provider: 'opensandbox',
        sandboxId: 'orphan-sandbox-1',
        status: SandboxStatusEnum.stopped,
        lastActiveAt: new Date(),
        createdAt: new Date(),
        metadata: {
          archive: {
            state: 'archived'
          }
        }
      }),
      MongoSandboxInstance.collection.insertOne({
        provider: 'opensandbox',
        sandboxId: 'orphan-sandbox-empty-app',
        appId: '',
        status: SandboxStatusEnum.stopped,
        lastActiveAt: new Date(),
        createdAt: new Date()
      }),
      MongoSandboxInstance.collection.insertOne({
        provider: 'opensandbox',
        sandboxId: 'orphan-sandbox-null-app',
        appId: null,
        status: SandboxStatusEnum.stopped,
        lastActiveAt: new Date(),
        createdAt: new Date()
      })
    ]);

    const result = await runInit4150Beta6Migration({
      dryRun: false
    });

    expect(result).toMatchObject({
      dryRun: false,
      scannedSkillCount: 2,
      sandboxMigration: {
        skillMatchedCount: 3,
        skillModifiedCount: 3,
        appMatchedCount: 1,
        appModifiedCount: 1,
        legacyFieldMatchedCount: 1,
        legacyFieldModifiedCount: 1,
        orphanMatchedCount: 3,
        orphanDeletedCount: 3,
        orphanFailedCount: 0
      },
      legacyDebugChatCleanup: {
        conflictAppSkillCount: 1,
        cleanupSkillCount: 1,
        totalLegacyChats: 1,
        totalChatItems: 1,
        totalChatItemResponses: 1,
        deletedSkillCount: 1
      }
    });
    expect(result.legacyDebugChatCleanup.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillId: deletableSkillId,
          deleted: true
        })
      ])
    );
    expect(result.legacyDebugChatCleanup.list).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ skillId: conflictSkillId })])
    );
    expect(await MongoChat.countDocuments({ appId: deletableSkillId })).toBe(0);
    expect(await MongoChat.countDocuments({ appId: conflictSkillId })).toBe(1);
    expect(await MongoSandboxInstance.countDocuments({ appId: { $exists: true } })).toBe(0);
    expect(
      await MongoSandboxInstance.countDocuments({ 'metadata.skillId': { $exists: true } })
    ).toBe(0);
    expect(await MongoSandboxInstance.countDocuments({ type: { $exists: true } })).toBe(0);
    await expect(
      MongoSandboxInstance.findOne({ sandboxId: 'legacy-sandbox-2' }).lean()
    ).resolves.toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: deletableSkillId
    });
    await expect(
      MongoSandboxInstance.findOne({ sandboxId: 'legacy-sandbox-2' }).lean()
    ).resolves.toEqual(
      expect.not.objectContaining({
        appId: expect.anything(),
        metadata: expect.objectContaining({ skillId: expect.anything() })
      })
    );
    await expect(
      MongoSandboxInstance.findOne({ sandboxId: 'legacy-sandbox-3' }).lean()
    ).resolves.toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: conflictSkillId
    });
    await expect(
      MongoSandboxInstance.findOne({ sandboxId: 'app-sandbox-2' }).lean()
    ).resolves.toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '65f000000000000000000099'
    });
    await expect(
      MongoSandboxInstance.findOne({ sandboxId: 'app-sandbox-3' }).lean()
    ).resolves.toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'legacy-wrong-source'
    });
    await expect(
      MongoSandboxInstance.findOne({ sandboxId: 'app-sandbox-3' }).lean()
    ).resolves.toEqual(
      expect.not.objectContaining({
        appId: expect.anything(),
        type: expect.anything()
      })
    );
    expect(mocks.addChatDeleteJob).toHaveBeenCalledWith({
      prefix: `chat/${deletableSkillId}`
    });
    expect(mocks.addPublicDeleteJob).toHaveBeenCalledWith({
      prefix: `chat/${deletableSkillId}`
    });
    expect(mocks.deleteSandboxResource).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'opensandbox',
        sandboxId: 'orphan-sandbox-1'
      })
    );
    expect(mocks.deleteSandboxResource).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'opensandbox',
        sandboxId: 'orphan-sandbox-empty-app'
      })
    );
    expect(mocks.deleteSandboxResource).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'opensandbox',
        sandboxId: 'orphan-sandbox-null-app'
      })
    );
  });
});
