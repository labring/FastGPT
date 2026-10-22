import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authCollectionInChat } from '@/service/support/permission/auth/chat';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { Types } from 'mongoose';

vi.mock('@fastgpt/service/core/chat/chatItemSchema', () => ({
  MongoChatItem: { aggregate: vi.fn() }
}));

describe('authCollectionInChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MongoChatItem.aggregate).mockResolvedValue([]);
  });

  it('should authorize when aggregation confirms all collection ids are cited', async () => {
    vi.mocked(MongoChatItem.aggregate).mockResolvedValue([{ isAuthorized: true }]);

    const result = await authCollectionInChat({
      collectionIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '507f1f77bcf86cd799439010',
      chatId: 'chat1'
    });

    expect(result).toBeUndefined();
  });

  it('should reject when aggregation does not confirm all collection ids', async () => {
    vi.mocked(MongoChatItem.aggregate).mockResolvedValue([{ isAuthorized: false }]);

    await expect(
      authCollectionInChat({
        collectionIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
        sourceType: ChatSourceTypeEnum.app,
        sourceId: '507f1f77bcf86cd799439010',
        chatId: 'chat1'
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDatasetFile);
  });

  it('should reject when aggregation returns no result', async () => {
    vi.mocked(MongoChatItem.aggregate).mockResolvedValue([]);

    await expect(
      authCollectionInChat({
        collectionIds: ['507f1f77bcf86cd799439011'],
        sourceType: ChatSourceTypeEnum.app,
        sourceId: '507f1f77bcf86cd799439010',
        chatId: 'chat1'
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDatasetFile);
  });

  it('should cast appId and compare stored citeCollectionIds as strings', async () => {
    vi.mocked(MongoChatItem.aggregate).mockResolvedValue([{ isAuthorized: true }]);
    const appId = '507f1f77bcf86cd799439010';
    const collectionIds = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'];

    await authCollectionInChat({
      collectionIds,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      chatId: 'chat1'
    });

    const pipeline = vi.mocked(MongoChatItem.aggregate).mock.calls[0][0];

    expect(pipeline[0]).toEqual({
      $match: {
        appId: new Types.ObjectId(appId),
        $or: [{ sourceType: ChatSourceTypeEnum.app }, { sourceType: { $exists: false } }],
        chatId: 'chat1',
        obj: 'AI'
      }
    });
    expect(pipeline).toContainEqual({ $sort: { _id: -1 } });
    expect(pipeline).toContainEqual({ $limit: 50 });
    expect(pipeline).toContainEqual({ $unwind: '$citeCollectionIds' });
    expect(pipeline).toContainEqual({
      $group: {
        _id: null,
        citeCollectionIds: { $addToSet: { $toString: '$citeCollectionIds' } }
      }
    });
    expect(pipeline).toContainEqual({
      $project: {
        _id: 0,
        isAuthorized: {
          $setIsSubset: [collectionIds, '$citeCollectionIds']
        }
      }
    });
  });
});
