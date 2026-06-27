import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authChatTargetCrud: vi.fn(),
  authCollectionInChat: vi.fn(),
  getCollectionWithDataset: vi.fn(),
  findChatItem: vi.fn(),
  findDatasetDataByInitialId: vi.fn(),
  findDatasetDataList: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@/service/support/permission/auth/chat', () => ({
  authChatTargetCrud: mocks.authChatTargetCrud,
  authCollectionInChat: mocks.authCollectionInChat
}));

vi.mock('@fastgpt/service/core/dataset/controller', () => ({
  getCollectionWithDataset: mocks.getCollectionWithDataset
}));

vi.mock('@fastgpt/service/core/chat/chatItemSchema', () => ({
  MongoChatItem: {
    findOne: mocks.findChatItem
  }
}));

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {
    findOne: mocks.findDatasetDataByInitialId,
    find: mocks.findDatasetDataList
  }
}));

import handler from '@/pages/api/core/chat/record/getCollectionQuote';

const appId = '68ad85a7463006c963799a05';
const chatId = 'chat_quote_auth_regression';
const chatItemDataId = 'quote_ai_response';
const collectionId = '68ad85a7463006c963799a06';
const teamId = '68ad85a7463006c963799a07';
const datasetId = '68ad85a7463006c963799a08';
const initialId = '68ad85a7463006c963799a09';
const chatTime = new Date('2026-06-06T10:14:40.000Z');

const callHandler = () =>
  handler({
    body: {
      appId,
      chatId,
      chatItemDataId,
      collectionId,
      initialId,
      anchor: 0,
      pageSize: 5
    }
  } as ApiRequestProps);

const createDatasetData = ({
  id,
  q,
  dataTeamId = teamId,
  dataDatasetId = datasetId,
  dataCollectionId = collectionId,
  chunkIndex = 0
}: {
  id: string;
  q: string;
  dataTeamId?: string;
  dataDatasetId?: string;
  dataCollectionId?: string;
  chunkIndex?: number;
}) => ({
  _id: new Types.ObjectId(id),
  teamId: dataTeamId,
  datasetId: dataDatasetId,
  collectionId: dataCollectionId,
  q,
  a: '',
  history: [],
  updateTime: new Date('2026-06-06T10:00:00.000Z'),
  chunkIndex
});

const mockFindDatasetDataList = (list: unknown[]) => {
  const query = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(list)
  };

  mocks.findDatasetDataList.mockReturnValue(query);
  return query;
};

describe('getCollectionQuote handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authChatTargetCrud.mockResolvedValue({
      sourceType: 'app',
      sourceId: appId,
      chat: { _id: chatId },
      showFullText: true
    });
    mocks.authCollectionInChat.mockResolvedValue(undefined);
    mocks.getCollectionWithDataset.mockResolvedValue({
      _id: collectionId,
      teamId,
      datasetId
    });
    mocks.findChatItem.mockReturnValue({
      lean: () => Promise.resolve({ time: chatTime })
    });
    mocks.findDatasetDataByInitialId.mockReturnValue({
      lean: () => Promise.resolve(null)
    });
    mockFindDatasetDataList([]);
  });

  it('binds initialId center-node lookup to the authorized team, dataset and collection', async () => {
    mocks.findDatasetDataByInitialId.mockReturnValue({
      lean: () =>
        Promise.resolve(
          createDatasetData({
            id: initialId,
            q: 'authorized quote text'
          })
        )
    });

    await expect(callHandler()).resolves.toMatchObject({
      list: [expect.objectContaining({ q: 'authorized quote text' })],
      hasMorePrev: false,
      hasMoreNext: false
    });

    expect(mocks.authCollectionInChat).toHaveBeenCalledWith({
      sourceType: 'app',
      sourceId: appId,
      chatId,
      collectionIds: [collectionId]
    });
    expect(mocks.authChatTargetCrud).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'app',
        sourceId: appId,
        chatId
      })
    );
    expect(mocks.findDatasetDataByInitialId).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId,
        datasetId,
        collectionId,
        _id: new Types.ObjectId(initialId)
      }),
      expect.any(String)
    );
  });

  it('does not return a foreign initialId when it is outside the authorized baseMatch', async () => {
    const authorizedFallback = createDatasetData({
      id: '68ad85a7463006c963799a10',
      q: 'tenant B authorized quote'
    });
    mockFindDatasetDataList([authorizedFallback]);

    const result = await callHandler();

    expect(result.list.map((item) => item.q)).toEqual(['tenant B authorized quote']);
    expect(result.list.map((item) => item.q)).not.toContain('tenant A secret quote');
    expect(mocks.findDatasetDataByInitialId).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId,
        datasetId,
        collectionId,
        _id: new Types.ObjectId(initialId)
      }),
      expect.any(String)
    );
    expect(mocks.findDatasetDataList).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId,
        datasetId,
        collectionId
      }),
      expect.any(String)
    );
  });
});
