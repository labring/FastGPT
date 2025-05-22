import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '@/pages/api/core/dataset/collection/read';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { authChatCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { createFileToken } from '@fastgpt/service/support/permission/controller';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/getApiRequest';

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetCollection: vi.fn()
}));

vi.mock('@/service/support/permission/auth/chat', () => ({
  authChatCrud: vi.fn(),
  authCollectionInChat: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/controller', () => ({
  getCollectionWithDataset: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/controller', () => ({
  createFileToken: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/getApiRequest', () => ({
  getApiDatasetRequest: vi.fn()
}));

describe('dataset collection read API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return file url for file type collection', async () => {
    const mockCollection = {
      type: DatasetCollectionTypeEnum.file,
      fileId: 'file123',
      name: 'test.pdf'
    };

    const mockAuthResponse = {
      collection: mockCollection,
      teamId: 'team1',
      tmbId: 'user1',
      authType: 'token'
    };

    vi.mocked(createFileToken).mockResolvedValue('token123');
    vi.mocked(authDatasetCollection).mockResolvedValue(mockAuthResponse);

    const result = await handler({
      body: {
        collectionId: 'col1'
      }
    } as any);

    expect(result).toEqual({
      type: 'url',
      value: expect.stringContaining('test.pdf?token=token123')
    });

    expect(createFileToken).toHaveBeenCalledWith({
      bucketName: BucketNameEnum.dataset,
      teamId: 'team1',
      uid: 'user1',
      fileId: 'file123',
      customExpireMinutes: undefined
    });
  });

  it('should return raw link for link type collection', async () => {
    const mockCollection = {
      type: DatasetCollectionTypeEnum.link,
      rawLink: 'https://example.com'
    };

    vi.mocked(authDatasetCollection).mockResolvedValue({
      collection: mockCollection,
      teamId: 'team1',
      tmbId: 'user1',
      authType: 'token'
    });

    const result = await handler({
      body: {
        collectionId: 'col1'
      }
    } as any);

    expect(result).toEqual({
      type: 'url',
      value: 'https://example.com'
    });
  });

  it('should return api file preview url for api file type collection', async () => {
    const mockCollection = {
      type: DatasetCollectionTypeEnum.apiFile,
      apiFileId: 'api123',
      dataset: {
        apiServer: 'https://api.example.com'
      }
    };

    const mockApiDataset = {
      getFilePreviewUrl: vi.fn().mockResolvedValue('https://preview.example.com')
    };

    vi.mocked(authDatasetCollection).mockResolvedValue({
      collection: mockCollection,
      teamId: 'team1',
      tmbId: 'user1',
      authType: 'token'
    });

    vi.mocked(getApiDatasetRequest).mockResolvedValue(mockApiDataset);

    const result = await handler({
      body: {
        collectionId: 'col1'
      }
    } as any);

    expect(result).toEqual({
      type: 'url',
      value: 'https://preview.example.com'
    });

    expect(getApiDatasetRequest).toHaveBeenCalledWith({
      apiServer: 'https://api.example.com',
      feishuServer: undefined,
      yuqueServer: undefined
    });
  });

  it('should return external file url for external file type collection', async () => {
    const mockCollection = {
      type: DatasetCollectionTypeEnum.externalFile,
      externalFileId: 'ext123',
      dataset: {
        externalReadUrl: 'https://external.com/{{fileId}}'
      }
    };

    vi.mocked(authDatasetCollection).mockResolvedValue({
      collection: mockCollection,
      teamId: 'team1',
      tmbId: 'user1',
      authType: 'token'
    });

    const result = await handler({
      body: {
        collectionId: 'col1'
      }
    } as any);

    expect(result).toEqual({
      type: 'url',
      value: 'https://external.com/ext123'
    });
  });

  it('should handle chat auth flow', async () => {
    const mockCollection = {
      type: DatasetCollectionTypeEnum.file,
      fileId: 'file123',
      name: 'test.pdf'
    };

    vi.mocked(authChatCrud).mockResolvedValue({
      showRawSource: true,
      teamId: 'team1',
      tmbId: 'user1',
      authType: 'token'
    });

    vi.mocked(getCollectionWithDataset).mockResolvedValue(mockCollection);
    vi.mocked(authCollectionInChat).mockResolvedValue();
    vi.mocked(createFileToken).mockResolvedValue('token123');

    const result = await handler({
      body: {
        collectionId: 'col1',
        appId: 'app1',
        chatId: 'chat1',
        chatItemDataId: 'item1'
      }
    } as any);

    expect(result).toEqual({
      type: 'url',
      value: expect.stringContaining('test.pdf?token=token123')
    });
  });
});
