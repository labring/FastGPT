import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { OutlinkResponseEvent } from '@fastgpt/service/support/outLink/runtime/type';
import { createWechatOutlinkAdapter } from '@fastgpt/service/support/outLink/wechat/adapter';
import { WechatMessageItemType } from '@fastgpt/service/support/outLink/wechat/ilinkClient';

const { uploadChatFile } = vi.hoisted(() => ({
  uploadChatFile: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({ uploadChatFile })
}));

const jobData = {
  shareId: 'share-id',
  userId: 'user-id',
  items: [{ type: WechatMessageItemType.TEXT, text_item: { text: 'voice transcript' } }],
  contextToken: 'context-token',
  lastMsgId: 'message-id'
};

const createAdapter = () => {
  const client = { sendMessage: vi.fn().mockResolvedValue(undefined) };
  return {
    client,
    adapter: createWechatOutlinkAdapter({ client: client as any, jobData, appId: 'app-id' })
  };
};

describe('createWechatOutlinkAdapter', () => {
  it('normalizes a reply job with the existing chat identity', async () => {
    const { adapter } = createAdapter();

    await expect(adapter.normalizeMessage()).resolves.toMatchObject({
      chatId: 'wechat_share-id_user-id',
      messageId: 'message-id',
      chatUserId: 'user-id',
      query: [{ text: { content: 'voice transcript' } }]
    });
  });

  it('sends only terminal runtime events to iLink', async () => {
    const { adapter, client } = createAdapter();
    const events: OutlinkResponseEvent[] = [
      { type: 'start' },
      { type: 'chunk', content: 'partial' },
      { type: 'done', content: 'complete answer' }
    ];

    await adapter.respond(Readable.from(events));

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage).toHaveBeenCalledWith({
      to_user_id: 'user-id',
      text: 'complete answer',
      context_token: 'context-token'
    });
  });

  it('ignores referenced content and uploads current decrypted files', async () => {
    const rawKey = Buffer.from('0123456789abcdef');
    const cipher = crypto.createCipheriv('aes-128-ecb', rawKey, null);
    const encryptedFile = Buffer.concat([cipher.update(Buffer.from('file body')), cipher.final()]);
    const aesKey = Buffer.from(rawKey.toString('hex')).toString('base64');
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/file')) {
        return new Response(encryptedFile, { headers: { 'content-type': 'text/plain' } });
      }
      if (url.endsWith('/image')) {
        return new Response(Buffer.from('image body'), {
          headers: { 'content-type': 'image/png' }
        });
      }
      throw new Error(`Unexpected media URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    uploadChatFile
      .mockResolvedValueOnce({ key: 'file-key' })
      .mockResolvedValueOnce({ key: 'image-key' });

    const adapter = createWechatOutlinkAdapter({
      client: { sendMessage: vi.fn() } as any,
      appId: 'app-id',
      jobData: {
        ...jobData,
        items: [
          {
            type: WechatMessageItemType.TEXT,
            text_item: { text: 'current' },
            ref_msg: {
              title: 'quoted',
              message_item: {
                type: WechatMessageItemType.IMAGE,
                image_item: { media: { full_url: 'https://cdn.example/reference' } }
              }
            }
          },
          {
            type: WechatMessageItemType.FILE,
            file_item: {
              file_name: 'notes.txt',
              media: { full_url: 'https://cdn.example/file', aes_key: aesKey }
            }
          },
          {
            type: WechatMessageItemType.IMAGE,
            image_item: { media: { full_url: 'https://cdn.example/image' } }
          }
        ]
      }
    });

    const message = await adapter.normalizeMessage();
    expect(message.query).toEqual([{ text: { content: 'current' } }]);
    await expect(
      message.resolveQuery?.({ maxFileAmount: 2, maxBytesPerFile: 100 })
    ).resolves.toEqual([
      { text: { content: 'current' } },
      { file: { type: 'file', name: 'notes.txt', url: '', key: 'file-key' } },
      { file: { type: 'image', name: 'image.png', url: '', key: 'image-key' } }
    ]);
    expect(fetchMock).not.toHaveBeenCalledWith('https://cdn.example/reference', expect.anything());
    expect(uploadChatFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sourceId: 'app-id',
        filename: 'notes.txt',
        body: Buffer.from('file body')
      })
    );
    vi.unstubAllGlobals();
  });

  it('decrypts images with both official key encodings and falls back to JPEG metadata', async () => {
    const rawKey = Buffer.from('0123456789abcdef');
    const encrypt = (content: string) => {
      const cipher = crypto.createCipheriv('aes-128-ecb', rawKey, null);
      return Buffer.concat([cipher.update(Buffer.from(content)), cipher.final()]);
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/aeskey')) return new Response(encrypt('aeskey image'));
      if (url.endsWith('/media-key')) return new Response(encrypt('media key image'));
      throw new Error(`Unexpected media URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    uploadChatFile.mockReset();
    uploadChatFile
      .mockResolvedValueOnce({ key: 'aeskey-image-key' })
      .mockResolvedValueOnce({ key: 'media-key-image-key' });

    const adapter = createWechatOutlinkAdapter({
      client: { sendMessage: vi.fn() } as any,
      appId: 'app-id',
      jobData: {
        ...jobData,
        items: [
          {
            type: WechatMessageItemType.IMAGE,
            image_item: {
              aeskey: rawKey.toString('hex'),
              media: { full_url: 'https://cdn.example/aeskey' }
            }
          },
          {
            type: WechatMessageItemType.IMAGE,
            image_item: {
              media: {
                full_url: 'https://cdn.example/media-key',
                aes_key: rawKey.toString('base64')
              }
            }
          }
        ]
      }
    });

    const message = await adapter.normalizeMessage();
    await expect(
      message.resolveQuery?.({ maxFileAmount: 2, maxBytesPerFile: 100 })
    ).resolves.toEqual([
      { file: { type: 'image', name: 'image.jpg', url: '', key: 'aeskey-image-key' } },
      { file: { type: 'image', name: 'image.jpg', url: '', key: 'media-key-image-key' } }
    ]);
    expect(uploadChatFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        filename: 'image.jpg',
        contentType: 'image/jpeg',
        body: Buffer.from('aeskey image')
      })
    );
    expect(uploadChatFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        filename: 'image.jpg',
        contentType: 'image/jpeg',
        body: Buffer.from('media key image')
      })
    );
    vi.unstubAllGlobals();
  });

  it('rejects image downloads that exceed the workflow file limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(Buffer.alloc(101)))
    );
    uploadChatFile.mockReset();

    const adapter = createWechatOutlinkAdapter({
      client: { sendMessage: vi.fn() } as any,
      appId: 'app-id',
      jobData: {
        ...jobData,
        items: [
          {
            type: WechatMessageItemType.IMAGE,
            image_item: { media: { full_url: 'https://cdn.example/oversized' } }
          }
        ]
      }
    });

    const message = await adapter.normalizeMessage();
    await expect(
      message.resolveQuery?.({ maxFileAmount: 1, maxBytesPerFile: 100 })
    ).rejects.toThrow('文件大小超过上传限制');
    expect(uploadChatFile).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
