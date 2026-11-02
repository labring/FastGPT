import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { createWechatOutlinkAdapter } from '@fastgpt/service/support/outLink/wechat/adapter';

const { uploadOutLinkFile } = vi.hoisted(() => ({ uploadOutLinkFile: vi.fn() }));

vi.mock('@fastgpt/service/support/outLink/tools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/outLink/tools')>()),
  uploadOutLinkFile
}));

describe('createWechatOutlinkAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each([
    ['report.pdf', ChatFileTypeEnum.document],
    ['archive.zip', ChatFileTypeEnum.unknown],
    ['photo.png', ChatFileTypeEnum.image]
  ])('微信 FILE 消息 %s 在入口归类为 %s，并保留原文件名', async (filename, type) => {
    const key = Buffer.from('0123456789abcdef');
    const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
    const encrypted = Buffer.concat([cipher.update(Buffer.from('file content')), cipher.final()]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(encrypted, {
          headers: { 'content-type': 'application/octet-stream' }
        })
      )
    );
    uploadOutLinkFile.mockResolvedValue({ key: 'chat/file-key' });
    const adapter = createWechatOutlinkAdapter({
      client: {} as any,
      appId: 'app-1',
      jobData: {
        shareId: 'share-1',
        userId: 'user-1',
        contextToken: 'context-1',
        lastMsgId: 'message-1',
        items: [
          {
            type: 4,
            file_item: {
              file_name: filename,
              media: { aes_key: key.toString('base64'), full_url: 'https://example.com/file' }
            }
          }
        ]
      }
    });

    const message = await adapter.normalizeMessage();
    await expect(
      message.resolveQuery?.({ maxFileAmount: 1, maxBytesPerFile: 1024 })
    ).resolves.toEqual([{ file: { type, name: filename, url: '', key: 'chat/file-key' } }]);
    expect(uploadOutLinkFile).toHaveBeenCalledWith(expect.objectContaining({ filename }));
  });

  it('uploads video items as video files', async () => {
    const key = Buffer.from('0123456789abcdef');
    const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
    const encrypted = Buffer.concat([cipher.update(Buffer.from('video')), cipher.final()]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(encrypted, {
          headers: { 'content-type': 'video/mp4', 'content-length': String(encrypted.length) }
        })
      )
    );
    uploadOutLinkFile.mockResolvedValue({ key: 'chat/video-key' });

    const adapter = createWechatOutlinkAdapter({
      client: {} as any,
      appId: 'app-1',
      jobData: {
        shareId: 'share-1',
        userId: 'user-1',
        contextToken: 'context-1',
        lastMsgId: 'message-1',
        items: [
          {
            type: 5,
            video_item: {
              file_name: 'video.mp4',
              media: { aes_key: key.toString('base64'), full_url: 'https://example.com/video' }
            }
          }
        ]
      }
    });

    const message = await adapter.normalizeMessage();
    await expect(
      message.resolveQuery?.({
        maxFileAmount: 1,
        maxBytesPerFile: 1024,
        fileSelectConfig: { canSelectVideo: true }
      })
    ).resolves.toEqual([
      { file: { type: ChatFileTypeEnum.video, name: 'video.mp4', url: '', key: 'chat/video-key' } }
    ]);
    expect(uploadOutLinkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        chatId: 'wechat_share-1_user-1',
        userId: 'user-1',
        filename: 'video.mp4',
        contentType: 'video/mp4'
      })
    );
  });
});
