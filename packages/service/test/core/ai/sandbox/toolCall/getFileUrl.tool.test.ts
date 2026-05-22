import { Readable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const s3Mock = vi.hoisted(() => ({
  uploadChatFile: vi.fn(),
  jwtSignS3ObjectKey: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    uploadChatFile: s3Mock.uploadChatFile
  })
}));

vi.mock('@fastgpt/service/common/s3/utils', () => ({
  jwtSignS3ObjectKey: s3Mock.jwtSignS3ObjectKey
}));

import { sandboxGetFileUrlTool } from '@fastgpt/service/core/ai/sandbox/toolCall/getFileUrl.tool';

const createSandboxInstance = () =>
  ({
    provider: {
      readFileStream: vi.fn(() => Readable.from(['file-content']))
    }
  }) as any;

describe('sandboxGetFileUrlTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    s3Mock.uploadChatFile.mockResolvedValue({ key: 'chat/file.txt' });
    s3Mock.jwtSignS3ObjectKey.mockReturnValue('signed-url');
  });

  it('uploads sandbox files and returns signed urls', async () => {
    const sandbox = createSandboxInstance();

    const result = await sandboxGetFileUrlTool.execute({
      appId: 'app',
      userId: 'user',
      chatId: 'chat',
      sandboxInstance: sandbox,
      params: { paths: ['/workspace/file.txt'] }
    });

    expect(JSON.parse(result.response)).toEqual([{ fileUrl: 'signed-url', filename: 'file.txt' }]);
    expect(sandbox.provider.readFileStream).toHaveBeenCalledWith('/workspace/file.txt');
    expect(s3Mock.uploadChatFile).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app',
        chatId: 'chat',
        uId: 'user',
        filename: 'file.txt'
      })
    );
    expect(s3Mock.jwtSignS3ObjectKey).toHaveBeenCalledWith('chat/file.txt', expect.any(Date));
  });
});
