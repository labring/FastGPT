import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  tryStartGenerateChat,
  updateChatGenerateStatus
} from '@fastgpt/service/core/chat/chatGenerateStatus';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';
const stopChatGenerationLeaseMock = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/chat/generationLease', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/chat/generationLease')>();
  return {
    ...actual,
    stopChatGenerationLease: stopChatGenerationLeaseMock
  };
});

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn()
  }
}));

const baseParams = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app1',
  chatId: 'chat1',
  teamId: 'team1',
  tmbId: 'tmb1',
  source: 'online',
  sourceName: 'FastGPT'
};

describe('chatGenerateStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MongoChat.findOne).mockReturnValue({
      lean: () => Promise.resolve(null)
    } as any);
    vi.mocked(MongoChat.findOneAndUpdate).mockReturnValue({
      lean: () => Promise.resolve(null)
    } as any);
  });

  it('should acquire generate slot when the chat is not already generating', async () => {
    await expect(
      tryStartGenerateChat({
        ...baseParams,
        generationRunnerId: 'run-1',
        generationResponseChatItemId: 'ai-item-1'
      })
    ).resolves.toBe(true);

    expect(MongoChat.findOneAndUpdate).toHaveBeenCalledWith(
      {
        ...buildChatSourceQuery({
          sourceType: baseParams.sourceType,
          sourceId: baseParams.sourceId
        }),
        chatId: baseParams.chatId,
        chatGenerateStatus: { $ne: ChatGenerateStatusEnum.generating }
      },
      {
        $set: expect.objectContaining({
          sourceType: baseParams.sourceType,
          appId: baseParams.sourceId,
          chatId: baseParams.chatId,
          teamId: baseParams.teamId,
          tmbId: baseParams.tmbId,
          source: baseParams.source,
          sourceName: baseParams.sourceName,
          hasBeenRead: false,
          chatGenerateStatus: ChatGenerateStatusEnum.generating,
          generationRunnerId: 'run-1',
          generationResponseChatItemId: 'ai-item-1',
          updateTime: expect.any(Date)
        }),
        $setOnInsert: {
          createTime: expect.any(Date),
          summary: {
            llmInputTokens: 0,
            llmOutputTokens: 0
          }
        }
      },
      {
        upsert: true,
        new: false
      }
    );
  });

  it('should reject acquiring generate slot when unique index reports a race', async () => {
    vi.mocked(MongoChat.findOneAndUpdate).mockReturnValue({
      lean: () =>
        Promise.reject({
          code: 11000
        })
    } as any);

    await expect(
      tryStartGenerateChat({ ...baseParams, generationRunnerId: 'run-1' })
    ).resolves.toBe(false);
  });

  it('should reject acquiring generate slot when chat is already generating', async () => {
    vi.mocked(MongoChat.findOneAndUpdate).mockReturnValue({
      lean: () =>
        Promise.reject({
          code: 11000
        })
    } as any);

    await expect(
      tryStartGenerateChat({ ...baseParams, generationRunnerId: 'run-1' })
    ).resolves.toBe(false);

    expect(MongoChat.findOneAndUpdate).toHaveBeenCalledWith(
      {
        ...buildChatSourceQuery({
          sourceType: baseParams.sourceType,
          sourceId: baseParams.sourceId
        }),
        chatId: baseParams.chatId,
        chatGenerateStatus: { $ne: ChatGenerateStatusEnum.generating }
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          chatGenerateStatus: ChatGenerateStatusEnum.generating
        }),
        $setOnInsert: expect.objectContaining({
          createTime: expect.any(Date)
        })
      }),
      {
        upsert: true,
        new: false
      }
    );
    expect(MongoChat.updateOne).not.toHaveBeenCalled();
  });

  it('should rethrow non-duplicate update errors', async () => {
    const error = new Error('mongo failed');
    vi.mocked(MongoChat.findOneAndUpdate).mockReturnValue({
      lean: () => Promise.reject(error)
    } as any);

    await expect(
      tryStartGenerateChat({ ...baseParams, generationRunnerId: 'run-1' })
    ).rejects.toThrow(error);
  });

  it('should update chat status to done or error without changing caller metadata', async () => {
    vi.mocked(MongoChat.updateOne).mockResolvedValue({} as any);

    await updateChatGenerateStatus({
      sourceType: baseParams.sourceType,
      sourceId: baseParams.sourceId,
      chatId: baseParams.chatId,
      status: ChatGenerateStatusEnum.done
    });

    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      {
        ...buildChatSourceQuery({
          sourceType: baseParams.sourceType,
          sourceId: baseParams.sourceId
        }),
        chatId: baseParams.chatId
      },
      {
        $set: {
          chatGenerateStatus: ChatGenerateStatusEnum.done,
          updateTime: expect.any(Date),
          hasBeenRead: false
        }
      }
    );
  });

  it('should fence status updates and stop the generation lease by run id', async () => {
    vi.mocked(MongoChat.updateOne).mockResolvedValue({ matchedCount: 1 } as any);

    await expect(
      updateChatGenerateStatus({
        sourceType: baseParams.sourceType,
        sourceId: baseParams.sourceId,
        chatId: baseParams.chatId,
        status: ChatGenerateStatusEnum.done,
        generationRunnerId: 'run-1'
      })
    ).resolves.toBe(true);

    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      {
        ...buildChatSourceQuery({
          sourceType: baseParams.sourceType,
          sourceId: baseParams.sourceId
        }),
        chatId: baseParams.chatId,
        generationRunnerId: 'run-1'
      },
      {
        $set: expect.objectContaining({
          chatGenerateStatus: ChatGenerateStatusEnum.done
        }),
        $unset: {
          generationRunnerId: '',
          generationResponseChatItemId: ''
        }
      }
    );
    expect(stopChatGenerationLeaseMock).toHaveBeenCalledWith({
      sourceType: baseParams.sourceType,
      sourceId: baseParams.sourceId,
      chatId: baseParams.chatId,
      generationRunnerId: 'run-1'
    });
  });

  it('should not stop a newer run when a stale status update loses its CAS', async () => {
    vi.mocked(MongoChat.updateOne).mockResolvedValue({ matchedCount: 0 } as any);

    await expect(
      updateChatGenerateStatus({
        sourceType: baseParams.sourceType,
        sourceId: baseParams.sourceId,
        chatId: baseParams.chatId,
        status: ChatGenerateStatusEnum.error,
        generationRunnerId: 'old-run'
      })
    ).resolves.toBe(false);

    expect(stopChatGenerationLeaseMock).toHaveBeenCalledWith({
      sourceType: baseParams.sourceType,
      sourceId: baseParams.sourceId,
      chatId: baseParams.chatId,
      generationRunnerId: 'old-run'
    });
  });

  it('should stop the local lease even when the status write fails', async () => {
    vi.mocked(MongoChat.updateOne).mockRejectedValueOnce(new Error('mongo down'));

    await expect(
      updateChatGenerateStatus({
        sourceType: baseParams.sourceType,
        sourceId: baseParams.sourceId,
        chatId: baseParams.chatId,
        status: ChatGenerateStatusEnum.error,
        generationRunnerId: 'run-1'
      })
    ).rejects.toThrow('mongo down');

    expect(stopChatGenerationLeaseMock).toHaveBeenCalledWith(
      expect.objectContaining({ generationRunnerId: 'run-1' })
    );
  });
});
