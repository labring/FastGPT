import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginPermissionEnum } from '@fastgpt/global/sdk/fastgpt-plugin';

const mockGetToolFilePrefix = vi.hoisted(() => vi.fn());
const mockUploadChatFile = vi.hoisted(() => vi.fn());
const mockCreateUploadChatFileURL = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    getToolFilePrefix: mockGetToolFilePrefix,
    uploadChatFile: mockUploadChatFile,
    createUploadChatFileURL: mockCreateUploadChatFileURL
  })
}));

import { InvokeProcessor } from '@fastgpt/service/support/invoke/invoke';

const createProcessor = () =>
  new InvokeProcessor({
    appId: 'app-1',
    chatId: 'chat-1',
    uId: 'user-1',
    teamId: 'team-1',
    tmbId: 'member-1',
    permissions: [PluginPermissionEnum['file-upload:allow']]
  });

describe('InvokeProcessor.handleFileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToolFilePrefix.mockReturnValue('chat/app-1/user-1/chat-1');
    mockUploadChatFile.mockResolvedValue({
      key: 'chat/app-1/user-1/chat-1/image.png',
      accessUrl: {
        bucket: 'fastgpt-private',
        key: 'chat/app-1/user-1/chat-1/image.png',
        url: 'https://example.com/api/system/file/download/token?filename=image.png'
      }
    });
  });

  it('上传文件内容并返回最终访问 URL', async () => {
    const body = Buffer.from('image');
    const result = await createProcessor().handleFileUpload({
      filename: 'image.png',
      body,
      contentType: 'image/png'
    });

    expect(mockUploadChatFile).toHaveBeenCalledWith({
      appId: 'app-1',
      chatId: 'chat-1',
      uId: 'user-1',
      filename: 'image.png',
      body,
      contentType: 'image/png',
      expiredTime: undefined
    });
    expect(mockCreateUploadChatFileURL).not.toHaveBeenCalled();
    expect(result).toEqual({
      url: 'https://example.com/api/system/file/download/token?filename=image.png'
    });
  });

  it('缺少文件内容时不创建上传 URL', async () => {
    await expect(
      createProcessor().handleFileUpload({
        filename: 'image.png',
        contentType: 'image/png'
      } as any)
    ).rejects.toThrow();

    expect(mockUploadChatFile).not.toHaveBeenCalled();
    expect(mockCreateUploadChatFileURL).not.toHaveBeenCalled();
  });
});
