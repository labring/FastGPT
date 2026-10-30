import readHandler from '@/pages/api/core/dataset/collection/read';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { addAuditLog, mockCreateGetDatasetFileURL } = vi.hoisted(() => ({
  addAuditLog: vi.fn(),
  mockCreateGetDatasetFileURL: vi.fn()
}));

// delCollection 之外的 fileId 签发入口需要本地提供 createGetDatasetFileURL。
vi.mock('@fastgpt/service/support/user/audit/util', () => ({ addAuditLog }));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    createGetDatasetFileURL: mockCreateGetDatasetFileURL,
    deleteDatasetFilesByKeys: vi.fn()
  })
}));

const createCollection = async ({ teamId, tmbId }: { teamId: string; tmbId: string }) => {
  const dataset = await MongoDataset.create({
    name: 'read-source',
    teamId,
    tmbId,
    vectorModel: 'test',
    agentModel: 'test'
  });
  const collection = await MongoDatasetCollection.create({
    name: 'file',
    type: DatasetCollectionTypeEnum.file,
    teamId,
    tmbId,
    datasetId: dataset._id
  });

  return { dataset, collection };
};

describe('read collection source S3 binding', () => {
  beforeEach(() => {
    addAuditLog.mockReset();
    mockCreateGetDatasetFileURL.mockReset();
    mockCreateGetDatasetFileURL.mockResolvedValue({ url: 'https://files.test/signed' });
  });

  it('signs the collection fileId when it belongs to the collection dataset', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const { dataset, collection } = await createCollection({
      teamId: users.owner.teamId,
      tmbId: member.tmbId
    });
    const ownFileId = `dataset/${dataset._id}/own.pdf`;
    await MongoDatasetCollection.updateOne(
      { _id: collection._id },
      { $set: { fileId: ownFileId } }
    );

    const response = await Call(readHandler, {
      auth: member,
      body: { collectionId: String(collection._id) }
    });

    expect(response.code).toBe(200);
    expect(mockCreateGetDatasetFileURL).toHaveBeenCalledWith(
      expect.objectContaining({ key: ownFileId, datasetId: String(dataset._id) })
    );
    expect(response.data.value).toBe('https://files.test/signed');
  });

  it.each([
    {},
    { chatId: 'chat-1' },
    { chatItemDataId: 'message-1' },
    { chatId: 'chat-1', chatItemDataId: 'message-1' },
    { appId: '507f1f77bcf86cd799439013', chatId: 'chat-1' },
    { appId: '507f1f77bcf86cd799439013', chatItemDataId: 'message-1' }
  ])('audits reads authenticated by collection permission with context %j', async (chatContext) => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const { dataset, collection } = await createCollection({
      teamId: member.teamId,
      tmbId: member.tmbId
    });
    const fileId = `dataset/${dataset._id}/source.pdf`;
    await MongoDatasetCollection.updateOne({ _id: collection._id }, { $set: { fileId } });

    const response = await Call(readHandler, {
      auth: member,
      body: { collectionId: String(collection._id), ...chatContext }
    });

    expect(response.code).toBe(200);
    expect(response.data.value).toBe('https://files.test/signed');
    expect(addAuditLog).toHaveBeenCalledTimes(1);
    expect(addAuditLog).toHaveBeenCalledWith({
      teamId: member.teamId,
      tmbId: member.tmbId,
      event: DatasetAuditEventEnum.DATASET_COLLECTION_EXPORT,
      params: {
        datasetName: 'read-source',
        collectionName: 'file',
        objectType: expect.any(String),
        exportScope: 'source'
      }
    });
  });

  it('does not audit source reads authenticated by a complete chat context', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const { dataset, collection } = await createCollection(member);
    const fileId = `dataset/${dataset._id}/source.pdf`;
    await MongoDatasetCollection.updateOne({ _id: collection._id }, { $set: { fileId } });
    const app = await MongoApp.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      name: 'source-read-app'
    });
    const chatId = 'source-read-chat';
    const chatItemDataId = 'source-read-message';
    await MongoChat.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      sourceType: ChatSourceTypeEnum.app,
      appId: app._id,
      chatId,
      source: ChatSourceEnum.online
    });
    await MongoChatItem.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      sourceType: ChatSourceTypeEnum.app,
      appId: app._id,
      chatId,
      dataId: chatItemDataId,
      obj: ChatRoleEnum.AI,
      citeCollectionIds: [String(collection._id)]
    });

    const response = await Call(readHandler, {
      auth: member,
      body: { collectionId: String(collection._id), appId: String(app._id), chatId, chatItemDataId }
    });

    expect(response.code).toBe(200);
    expect(response.data.value).toBe('https://files.test/signed');
    expect(mockCreateGetDatasetFileURL).toHaveBeenCalledTimes(1);
    expect(addAuditLog).not.toHaveBeenCalled();
  });

  it('does not audit collection source reads authenticated by an API key', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const { dataset, collection } = await createCollection(member);
    const fileId = `dataset/${dataset._id}/source.pdf`;
    await MongoDatasetCollection.updateOne({ _id: collection._id }, { $set: { fileId } });

    const response = await Call(readHandler, {
      auth: { ...member, authType: AuthUserTypeEnum.apikey, apikey: 'source-read-api-key' },
      body: { collectionId: String(collection._id), chatId: 'unused-chat-id' }
    });

    expect(response.code).toBe(200);
    expect(response.data.value).toBe('https://files.test/signed');
    expect(addAuditLog).not.toHaveBeenCalled();
  });

  it('does not sign a fileId that belongs to another dataset', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const { collection } = await createCollection({
      teamId: users.owner.teamId,
      tmbId: member.tmbId
    });
    await MongoDatasetCollection.updateOne(
      { _id: collection._id },
      { $set: { fileId: 'dataset/507f1f77bcf86cd799439099/foreign.pdf' } }
    );

    const response = await Call(readHandler, {
      auth: member,
      body: { collectionId: String(collection._id) }
    });

    expect(response.code).toBe(200);
    expect(mockCreateGetDatasetFileURL).not.toHaveBeenCalled();
    expect(response.data.value).toBe('');
  });
});
