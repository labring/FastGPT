import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { prepareAuthorizedDraftFiles } from '@/service/core/chat/file/draft';

const mocks = vi.hoisted(() => ({
  getFileMetadata: vi.fn(),
  createGetChatFileURL: vi.fn()
}));
vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    bucketName: 'private',
    getFileMetadata: mocks.getFileMetadata,
    createGetChatFileURL: mocks.createGetChatFileURL
  })
}));

const appId = '507f1f77bcf86cd799439011';
const teamId = '507f1f77bcf86cd799439012';
const tmbId = '507f1f77bcf86cd799439013';
const chatId = 'chat';
const key = `chat/app/${appId}/${tmbId}/${chatId}/file.pdf`;
const params = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: appId,
  chatId,
  keys: [key],
  remainingMs: 60 * 60 * 1000
};
const saveFileInChat = () =>
  MongoChatItem.create({
    teamId,
    tmbId,
    appId,
    sourceType: ChatSourceTypeEnum.app,
    chatId,
    obj: ChatRoleEnum.Human,
    value: [{ file: { key, type: 'file', name: 'file.pdf' } }]
  });

describe('prepareAuthorizedDraftFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFileMetadata.mockResolvedValue({ filename: 'file.pdf', contentLength: 100 });
    mocks.createGetChatFileURL.mockResolvedValue({ url: 'https://fresh-preview' });
  });

  it('renews a live temporary object using the database clock and refreshes its preview', async () => {
    const now = Date.now();
    await MongoS3TTL.create({
      bucketName: 'private',
      minioKey: key,
      expiredTime: new Date(now + 10000)
    });
    const [result] = await prepareAuthorizedDraftFiles(params);
    expect(result).toMatchObject({ key, status: 'ready', url: 'https://fresh-preview' });
    if (result.status !== 'ready') throw new Error('expected ready');
    expect(result.expiresAt).toBeGreaterThanOrEqual(now + params.remainingMs);
    expect((await MongoS3TTL.findOne({ minioKey: key }).lean())?.expiredTime.getTime()).toBe(
      result.expiresAt
    );
  });

  it('does not shorten expiry when an older request arrives after a newer renewal', async () => {
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
    await MongoS3TTL.create({
      bucketName: 'private',
      minioKey: key,
      expiredTime: new Date(expiresAt)
    });
    const [result] = await prepareAuthorizedDraftFiles({ ...params, remainingMs: 10000 });
    expect(result).toMatchObject({ status: 'ready', expiresAt });
  });

  it('rejects expired TTLs and never revives them', async () => {
    const expiredTime = new Date(Date.now() - 1000);
    await MongoS3TTL.create({ bucketName: 'private', minioKey: key, expiredTime });
    await expect(prepareAuthorizedDraftFiles(params)).resolves.toEqual([
      { key, status: 'unavailable', reason: 'expired' }
    ]);
    expect((await MongoS3TTL.findOne({ minioKey: key }).lean())?.expiredTime).toEqual(expiredTime);
    expect(mocks.createGetChatFileURL).not.toHaveBeenCalled();
  });

  it('rechecks expiration after slow object metadata lookup', async () => {
    await MongoS3TTL.create({
      bucketName: 'private',
      minioKey: key,
      expiredTime: new Date(Date.now() + 10000)
    });
    mocks.getFileMetadata.mockImplementationOnce(async () => {
      await MongoS3TTL.updateOne(
        { minioKey: key },
        { $set: { expiredTime: new Date(Date.now() - 1000) } }
      );
      return { filename: 'file.pdf', contentLength: 100 };
    });
    await expect(prepareAuthorizedDraftFiles(params)).resolves.toEqual([
      { key, status: 'unavailable', reason: 'expired' }
    ]);
  });

  it('does not prepare incomplete multipart upload sessions', async () => {
    await MongoS3TTL.create({
      bucketName: 'private',
      minioKey: key,
      expiredTime: new Date(Date.now() + 10000),
      multipart: { uploadId: 'pending-upload' }
    });
    await expect(prepareAuthorizedDraftFiles(params)).resolves.toEqual([
      { key, status: 'unavailable', reason: 'expired' }
    ]);
  });

  it('requires a saved chat reference to use an object without a TTL', async () => {
    await expect(prepareAuthorizedDraftFiles(params)).resolves.toEqual([
      { key, status: 'unavailable', reason: 'expired' }
    ]);
    await saveFileInChat();
    await expect(prepareAuthorizedDraftFiles(params)).resolves.toEqual([
      { key, status: 'ready', url: 'https://fresh-preview', expiresAt: null }
    ]);
    expect(await MongoS3TTL.countDocuments({ minioKey: key })).toBe(0);
    await expect(prepareAuthorizedDraftFiles({ ...params, chatId: 'other' })).resolves.toEqual([
      { key, status: 'unavailable', reason: 'expired' }
    ]);
  });

  it('does not add a TTL after a concurrent send has persisted the file', async () => {
    await MongoS3TTL.create({
      bucketName: 'private',
      minioKey: key,
      expiredTime: new Date(Date.now() + 10000)
    });
    mocks.getFileMetadata.mockImplementationOnce(async () => {
      await saveFileInChat();
      await MongoS3TTL.deleteMany({ minioKey: key });
      return { filename: 'file.pdf', contentLength: 100 };
    });
    await expect(prepareAuthorizedDraftFiles(params)).resolves.toEqual([
      { key, status: 'ready', url: 'https://fresh-preview', expiresAt: null }
    ]);
    expect(await MongoS3TTL.countDocuments({ minioKey: key })).toBe(0);
  });

  it('distinguishes missing objects from temporary storage failures and deduplicates requests', async () => {
    mocks.getFileMetadata.mockRejectedValueOnce(CommonErrEnum.fileNotFound);
    await expect(prepareAuthorizedDraftFiles(params)).resolves.toEqual([
      { key, status: 'unavailable', reason: 'missing' }
    ]);
    mocks.getFileMetadata.mockResolvedValueOnce(undefined);
    await expect(prepareAuthorizedDraftFiles(params)).resolves.toEqual([
      { key, status: 'unavailable', reason: 'missing' }
    ]);
    mocks.getFileMetadata.mockRejectedValueOnce(new Error('temporary outage'));
    await expect(prepareAuthorizedDraftFiles(params)).rejects.toThrow('temporary outage');
    await saveFileInChat();
    mocks.getFileMetadata.mockClear();
    expect(await prepareAuthorizedDraftFiles({ ...params, keys: [key, key] })).toHaveLength(1);
    expect(mocks.getFileMetadata).toHaveBeenCalledTimes(1);
  });
});
