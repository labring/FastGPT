import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  uploadChatFile: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => mocks
}));

import {
  getCompletionStartHookText,
  normalizeCompletionMessages
} from '@fastgpt/service/core/chat/completionMessage';
import { serviceEnv } from '@fastgpt/service/env';

const normalize = (
  messages: ChatCompletionMessageParam[],
  limits: { maxFileAmount: number; maxBytesPerFile: number } = {
    maxFileAmount: 10,
    maxBytesPerFile: 10 * 1024 * 1024
  }
) =>
  normalizeCompletionMessages({
    messages,
    sourceType: ChatSourceTypeEnum.app,
    sourceId: '507f1f77bcf86cd799439011',
    chatId: 'chat-1',
    uid: 'user-1',
    ...limits
  });

describe('getCompletionStartHookText', () => {
  it('returns text from the latest user message', () => {
    expect(
      getCompletionStartHookText({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'describe ' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
              { type: 'text', text: 'this image' }
            ]
          }
        ],
        fallback: 'plugin fallback'
      })
    ).toBe('describe this image');
  });

  it('returns fallback without a user message', () => {
    expect(
      getCompletionStartHookText({
        messages: [],
        fallback: '{"city":"Shanghai","count":2}'
      })
    ).toBe('{"city":"Shanghai","count":2}');
  });
});

describe('normalizeCompletionMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = false;
    mocks.uploadChatFile.mockResolvedValue({
      key: 'chat/app/507f1f77bcf86cd799439011/user-1/chat-1/image_123456.jpg',
      accessUrl: {
        bucket: 'private',
        key: 'chat/app/507f1f77bcf86cd799439011/user-1/chat-1/image_123456.jpg',
        url: 'https://s3.example.com/image.jpg'
      }
    });
  });

  it('uploads base64 images once and rewrites every matching message part', async () => {
    const dataUrl = `data:image/jpeg;base64,${Buffer.from('image-content').toString('base64')}`;
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe it' },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
        ]
      },
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: dataUrl } }]
      }
    ];

    const result = await normalize(messages);

    expect(mocks.uploadChatFile).toHaveBeenCalledTimes(1);
    expect(mocks.uploadChatFile).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '507f1f77bcf86cd799439011',
      chatId: 'chat-1',
      uId: 'user-1',
      filename: 'image.jpg',
      body: Buffer.from('image-content'),
      contentType: 'image/jpeg'
    });
    expect(result[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'describe it' },
        {
          type: 'image_url',
          key: 'chat/app/507f1f77bcf86cd799439011/user-1/chat-1/image_123456.jpg',
          image_url: { url: 'https://s3.example.com/image.jpg', detail: 'high' }
        }
      ]
    });
    expect(result[1]).toEqual({
      role: 'user',
      content: [
        {
          type: 'image_url',
          key: 'chat/app/507f1f77bcf86cd799439011/user-1/chat-1/image_123456.jpg',
          image_url: { url: 'https://s3.example.com/image.jpg' }
        }
      ]
    });
    expect(messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'describe it' },
        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
      ]
    });
  });

  it('uploads base64 images regardless of the model base64 setting', async () => {
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = true;
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,aW1hZ2U=' }
          }
        ]
      }
    ];

    const result = await normalize(messages);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            key: 'chat/app/507f1f77bcf86cd799439011/user-1/chat-1/image_123456.jpg',
            image_url: { url: 'https://s3.example.com/image.jpg' }
          }
        ]
      }
    ]);
    expect(mocks.uploadChatFile).toHaveBeenCalledTimes(1);
  });

  it('keeps remote images and non-user messages without uploading', async () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: 'system prompt'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'question' },
          { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }
        ]
      }
    ];

    await expect(normalize(messages)).resolves.toEqual(messages);
    expect(mocks.uploadChatFile).not.toHaveBeenCalled();
  });

  it('rejects malformed and unsupported image Data URLs', async () => {
    await expect(
      normalize([
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,***' } }]
        }
      ])
    ).rejects.toThrow('Invalid image base64 data URL');

    await expect(
      normalize([
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'data:image/unknown;base64,YQ==' } }]
        }
      ])
    ).rejects.toThrow('Unsupported image content type');
  });

  it('rejects decoded images larger than the upload limit', async () => {
    await expect(
      normalize(
        [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${Buffer.from('too-large').toString('base64')}`
                }
              }
            ]
          }
        ],
        {
          maxFileAmount: 10,
          maxBytesPerFile: 1
        }
      )
    ).rejects.toThrow('Image size exceeds limit');
    expect(mocks.uploadChatFile).not.toHaveBeenCalled();
  });

  it('rejects too many base64 images before uploading any file', async () => {
    const createImagePart = (value: string) => ({
      type: 'image_url' as const,
      image_url: { url: `data:image/png;base64,${Buffer.from(value).toString('base64')}` }
    });

    await expect(
      normalize(
        [
          {
            role: 'user',
            content: [createImagePart('first'), createImagePart('second')]
          }
        ],
        {
          maxFileAmount: 1,
          maxBytesPerFile: 10 * 1024 * 1024
        }
      )
    ).rejects.toThrow('Image amount exceeds limit');
    expect(mocks.uploadChatFile).not.toHaveBeenCalled();
  });

  it('validates every base64 image before uploading any file', async () => {
    await expect(
      normalize(
        [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${Buffer.from('valid').toString('base64')}`
                }
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${Buffer.from('too-large').toString('base64')}`
                }
              }
            ]
          }
        ],
        {
          maxFileAmount: 2,
          maxBytesPerFile: 5
        }
      )
    ).rejects.toThrow('Image size exceeds limit');
    expect(mocks.uploadChatFile).not.toHaveBeenCalled();
  });
});
