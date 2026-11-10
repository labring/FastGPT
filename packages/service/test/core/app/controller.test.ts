import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { deleteAppDataProcessor } from '@fastgpt/service/core/app/controller';

const mocks = vi.hoisted(() => ({
  deleteAppSandboxes: vi.fn(),
  deleteChatFilesByPrefix: vi.fn(),
  removeImageByPath: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/resource/sourceCleanup', () => ({
  deleteAppSandboxes: mocks.deleteAppSandboxes
}));
vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({ deleteChatFilesByPrefix: mocks.deleteChatFilesByPrefix })
}));
vi.mock('@fastgpt/service/common/file/image/controller', () => ({
  removeImageByPath: mocks.removeImageByPath
}));

const teamId = '65f000000000000000000001';
const tmbId = '65f000000000000000000002';

/** 写入隔离测试库的完整会话树，覆盖聊天、消息和节点详情三张表。 */
const createChatTree = async ({
  sourceId,
  sourceType,
  chatId,
  legacy = false
}: {
  sourceId: string;
  sourceType: ChatSourceTypeEnum;
  chatId: string;
  legacy?: boolean;
}) => {
  const fields = { sourceType, appId: sourceId, chatId, teamId };
  await MongoChat.create({ ...fields, tmbId, source: ChatSourceEnum.online, title: chatId });
  await MongoChatItem.create({
    ...fields,
    tmbId,
    dataId: 'item',
    obj: ChatRoleEnum.AI,
    value: [{ text: { content: 'answer' } }]
  });
  await MongoChatItemResponse.create({
    ...fields,
    chatItemDataId: 'item',
    data: { nodeId: 'node-1' }
  });
  if (legacy) {
    await Promise.all(
      [MongoChat, MongoChatItem, MongoChatItemResponse].map((model) =>
        model.updateMany({ appId: sourceId, chatId }, { $unset: { sourceType: '' } })
      )
    );
  }
};

describe('deleteAppDataProcessor', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.deleteAppSandboxes.mockResolvedValue(undefined);
    mocks.deleteChatFilesByPrefix.mockResolvedValue(undefined);
    mocks.removeImageByPath.mockResolvedValue(undefined);
  });

  it.each([AppTypeEnum.workflow, AppTypeEnum.workflowTool])(
    'deletes %s app and Builder chat resources without touching other sources',
    async (type) => {
      const app = await MongoApp.create({
        name: 'target',
        type,
        teamId,
        tmbId
      });
      const sourceId = String(app._id);
      const otherId = '65f000000000000000000004';
      await createChatTree({ sourceId, sourceType: ChatSourceTypeEnum.app, chatId: 'app' });
      await createChatTree({
        sourceId,
        sourceType: ChatSourceTypeEnum.app,
        chatId: 'legacy',
        legacy: true
      });
      await createChatTree({
        sourceId,
        sourceType: ChatSourceTypeEnum.workflowBuilder,
        chatId: 'builder'
      });
      await createChatTree({
        sourceId: otherId,
        sourceType: ChatSourceTypeEnum.workflowBuilder,
        chatId: 'other-app'
      });
      await createChatTree({ sourceId, sourceType: ChatSourceTypeEnum.skillEdit, chatId: 'skill' });

      await deleteAppDataProcessor({ app: app.toObject(), teamId });

      const remaining = await Promise.all([
        MongoChat.find({}, 'chatId').lean(),
        MongoChatItem.find({}, 'chatId').lean(),
        MongoChatItemResponse.find({}, 'chatId').lean()
      ]);
      for (const items of remaining)
        expect(items.map((item) => item.chatId).sort()).toEqual(['other-app', 'skill']);
      expect(await MongoApp.exists({ _id: sourceId })).toBeNull();
      expect(mocks.deleteAppSandboxes).toHaveBeenCalledExactlyOnceWith(sourceId);
      expect(mocks.deleteChatFilesByPrefix).toHaveBeenCalledTimes(2);
      expect(mocks.deleteChatFilesByPrefix).toHaveBeenCalledWith({
        sourceType: ChatSourceTypeEnum.app,
        sourceId
      });
      expect(mocks.deleteChatFilesByPrefix).toHaveBeenCalledWith({
        sourceType: ChatSourceTypeEnum.workflowBuilder,
        sourceId
      });
    }
  );

  it('retries Builder file cleanup after an external deletion failure', async () => {
    const app = await MongoApp.create({
      name: 'target',
      type: AppTypeEnum.workflow,
      teamId,
      tmbId
    });
    const sourceId = String(app._id);
    await createChatTree({
      sourceId,
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      chatId: 'builder'
    });
    mocks.deleteChatFilesByPrefix.mockImplementation(async ({ sourceType }) => {
      if (sourceType === ChatSourceTypeEnum.workflowBuilder) throw new Error('file cleanup failed');
    });

    await expect(deleteAppDataProcessor({ app: app.toObject(), teamId })).rejects.toThrow(
      'file cleanup failed'
    );
    expect(await MongoApp.exists({ _id: sourceId })).not.toBeNull();

    mocks.deleteChatFilesByPrefix.mockResolvedValue(undefined);
    await deleteAppDataProcessor({ app: app.toObject(), teamId });
    expect(await MongoApp.exists({ _id: sourceId })).toBeNull();
    expect(mocks.deleteChatFilesByPrefix).toHaveBeenCalledTimes(4);
    expect(await MongoChat.countDocuments({ appId: sourceId })).toBe(0);
    expect(await MongoChatItem.countDocuments({ appId: sourceId })).toBe(0);
    expect(await MongoChatItemResponse.countDocuments({ appId: sourceId })).toBe(0);
  });
});
