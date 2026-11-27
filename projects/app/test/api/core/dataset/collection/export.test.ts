import { StreamCall } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';

const mocks = vi.hoisted(() => ({
  addAuditLog: vi.fn(),
  assertMemberRateLimit: vi.fn(),
  authChatTargetCrud: vi.fn(),
  authCollectionInChat: vi.fn(),
  authDatasetCollection: vi.fn(),
  getCollectionWithDataset: vi.fn(),
  nextAPI: vi.fn((handler) => handler),
  query: {
    sort: vi.fn(),
    limit: vi.fn(),
    cursor: vi.fn()
  }
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: mocks.nextAPI }));
vi.mock('@fastgpt/service/core/chat/auth', () => ({
  authChatTargetCrud: mocks.authChatTargetCrud
}));
vi.mock('@/service/support/permission/auth/chat', () => ({
  authCollectionInChat: mocks.authCollectionInChat
}));
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetCollection: mocks.authDatasetCollection
}));
vi.mock('@fastgpt/service/core/dataset/controller', () => ({
  getCollectionWithDataset: mocks.getCollectionWithDataset
}));
vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {
    find: vi.fn(() => mocks.query)
  }
}));
vi.mock('@fastgpt/service/common/rateLimit/interface/member', () => ({
  assertMemberRateLimit: mocks.assertMemberRateLimit,
  MemberRateLimitPolicy: { ExportDataset: 'export-dataset' }
}));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({ addAuditLog: mocks.addAuditLog }));

const cursor = {
  close: vi.fn(async () => undefined),
  async *[Symbol.asyncIterator]() {
    yield { q: 'question', a: 'answer' };
  }
};
const query = mocks.query;

import handler from '@/pages/api/core/dataset/collection/export';

const collection = {
  _id: '507f1f77bcf86cd799439011',
  teamId: 'dataset-team',
  datasetId: '507f1f77bcf86cd799439012',
  name: 'Knowledge collection',
  type: DatasetCollectionTypeEnum.file,
  dataset: { name: 'Knowledge base' }
};

const chatBody = {
  appId: '507f1f77bcf86cd799439013',
  collectionId: collection._id,
  chatId: 'chat-1',
  chatItemDataId: 'chat-record-1',
  outLinkAuthData: { shareId: 'share-1', outLinkUid: 'visitor-1' }
};

describe('POST /core/dataset/collection/export audit scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.sort.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.cursor.mockReturnValue(cursor);
    mocks.authDatasetCollection.mockResolvedValue({
      collection,
      teamId: 'dataset-team',
      tmbId: 'site-member',
      authType: AuthUserTypeEnum.token
    });
    mocks.authChatTargetCrud.mockResolvedValue({
      sourceId: chatBody.appId,
      teamId: 'dataset-team',
      tmbId: 'publisher-member',
      uid: 'external-visitor',
      authType: AuthUserTypeEnum.outLink,
      canDownloadSource: true
    });
    mocks.authCollectionInChat.mockResolvedValue(undefined);
    mocks.getCollectionWithDataset.mockResolvedValue(collection);
    mocks.assertMemberRateLimit.mockResolvedValue(undefined);
    mocks.addAuditLog.mockResolvedValue(undefined);
  });

  it('records chunk export from the collection detail page', async () => {
    await StreamCall(handler, { body: { collectionId: collection._id } });

    expect(mocks.addAuditLog).toHaveBeenCalledWith({
      teamId: 'dataset-team',
      tmbId: 'site-member',
      event: DatasetAuditEventEnum.DATASET_COLLECTION_QA_EXPORT,
      resources: [
        {
          type: 'collection',
          id: collection._id,
          name: 'Knowledge collection',
          datasetId: collection.datasetId,
          collectionType: DatasetCollectionTypeEnum.file
        }
      ],
      params: {}
    });
  });

  it('does not audit exports initiated from a chat quote, including external links', async () => {
    await StreamCall(handler, { body: chatBody });

    expect(mocks.addAuditLog).not.toHaveBeenCalled();
  });

  it('does not audit collection exports authenticated by an API key', async () => {
    mocks.authDatasetCollection.mockResolvedValueOnce({
      collection,
      teamId: 'dataset-team',
      tmbId: 'api-key-member',
      authType: AuthUserTypeEnum.apikey
    });
    await StreamCall(handler, { body: { collectionId: collection._id } });

    expect(mocks.addAuditLog).not.toHaveBeenCalled();
  });
});
