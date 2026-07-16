import { Readable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const s3Mock = vi.hoisted(() => ({
  uploadChatFile: vi.fn(),
  createGetChatFileURL: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    uploadChatFile: s3Mock.uploadChatFile,
    createGetChatFileURL: s3Mock.createGetChatFileURL
  })
}));

import { sandboxGetFileUrlTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/getFileUrl.tool';

const createSandboxInstance = () =>
  ({
    getContext: () => ({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat'
    }),
    provider: {
      readFileStream: vi.fn(() => Readable.from(['file-content']))
    }
  }) as any;

describe('sandboxGetFileUrlTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    s3Mock.uploadChatFile.mockResolvedValue({ key: 'chat/file.txt' });
    s3Mock.createGetChatFileURL.mockResolvedValue({ url: 'signed-url' });
  });

  it('uploads sandbox files and returns signed urls', async () => {
    const sandbox = createSandboxInstance();

    const result = await sandboxGetFileUrlTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat',
      sandboxInstance: sandbox,
      params: { paths: ['/workspace/file.txt'] }
    });

    expect(JSON.parse(result.response)).toEqual([{ fileUrl: 'signed-url', filename: 'file.txt' }]);
    expect(sandbox.provider.readFileStream).toHaveBeenCalledWith('/workspace/file.txt');
    expect(s3Mock.uploadChatFile).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app',
        chatId: 'chat',
        uId: 'user',
        filename: 'file.txt'
      })
    );
    expect(s3Mock.createGetChatFileURL).toHaveBeenCalledWith({
      key: 'chat/file.txt',
      expiredHours: 2,
      external: true,
      mode: 'presigned'
    });
  });
});
