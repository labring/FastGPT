import { describe, expect, it } from 'vitest';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  assertChatFileRuntimeValue,
  normalizeChatFileStoreValue,
  normalizeChatFileStoreValues
} from '../../../core/chat/fileStoreValue';

describe('normalizeChatFileStoreValue', () => {
  it('按 S3 key 提取文件名并推断图片类型', () => {
    expect(
      normalizeChatFileStoreValue({
        key: 'chat/files/2026/PHOTO.JPG'
      })
    ).toEqual({
      key: 'chat/files/2026/PHOTO.JPG',
      name: 'PHOTO.JPG',
      type: ChatFileTypeEnum.image
    });
  });

  it('优先保留显式 type，不用扩展名覆盖用户传入的类型', () => {
    expect(
      normalizeChatFileStoreValue({
        key: 'chat/files/photo.png',
        name: 'photo.png',
        type: ChatFileTypeEnum.file
      })
    ).toEqual({
      key: 'chat/files/photo.png',
      name: 'photo.png',
      type: ChatFileTypeEnum.file
    });
  });

  it('同时存在 key 和 url 时优先落库 key，避免保存临时预览 url', () => {
    expect(
      normalizeChatFileStoreValue({
        key: 'chat/files/audio.mp3',
        url: 'https://preview.example.com/audio.mp3?token=temp'
      })
    ).toEqual({
      key: 'chat/files/audio.mp3',
      name: 'audio.mp3',
      type: ChatFileTypeEnum.audio
    });
  });

  it('S3 key 解析不出 basename 时使用 file 作为稳定展示名', () => {
    expect(
      normalizeChatFileStoreValue({
        key: '/'
      })
    ).toEqual({
      key: '/',
      name: 'file',
      type: ChatFileTypeEnum.file
    });
  });

  it('从外链 URL pathname 解码文件名并推断视频类型', () => {
    expect(
      normalizeChatFileStoreValue({
        url: 'https://example.com/files/%E6%B5%8B%E8%AF%95.MP4?token=1'
      })
    ).toEqual({
      url: 'https://example.com/files/%E6%B5%8B%E8%AF%95.MP4?token=1',
      name: '测试.MP4',
      type: ChatFileTypeEnum.video
    });
  });

  it('非法 URL 仍保留原始字符串作为文件名，避免名称推断失败丢文件', () => {
    expect(
      normalizeChatFileStoreValue({
        url: 'not a standard url.wav'
      })
    ).toEqual({
      url: 'not a standard url.wav',
      name: 'not a standard url.wav',
      type: ChatFileTypeEnum.audio
    });
  });

  it('无法识别扩展名时兜底为普通文件类型', () => {
    expect(
      normalizeChatFileStoreValue({
        url: 'https://example.com/files/archive.unknown'
      })
    ).toEqual({
      url: 'https://example.com/files/archive.unknown',
      name: 'archive.unknown',
      type: ChatFileTypeEnum.file
    });
  });

  it('外链 URL 没有 pathname 文件名时使用完整 URL 作为展示名', () => {
    expect(
      normalizeChatFileStoreValue({
        url: 'https://example.com/'
      })
    ).toEqual({
      url: 'https://example.com/',
      name: 'https://example.com/',
      type: ChatFileTypeEnum.file
    });
  });

  it('过滤没有 key 的 data URL，避免把临时大内容写入变量存储', () => {
    expect(
      normalizeChatFileStoreValue({
        url: 'data:image/png;base64,abc'
      })
    ).toBeUndefined();
  });

  it('缺少 key 和有效 url 时返回 undefined', () => {
    expect(normalizeChatFileStoreValue({ name: 'empty.pdf' })).toBeUndefined();
  });
});

describe('assertChatFileRuntimeValue', () => {
  it('非数组运行态直接抛错，暴露 file 变量类型错误', () => {
    expect(() => assertChatFileRuntimeValue('https://example.com/a.png' as any)).toThrow(
      'File variable value must be an array'
    );
  });

  it('保留 URL 字符串和可识别文件对象，并裁剪对象上的前端临时字段', () => {
    expect(
      assertChatFileRuntimeValue([
        'https://example.com/a.png',
        {
          key: 'chat/files/b.pdf',
          name: 'b.pdf',
          type: ChatFileTypeEnum.file,
          uploadProgress: 100
        } as any,
        { previewUrl: 'blob:http://local-preview' } as any,
        '',
        null as any
      ])
    ).toEqual([
      'https://example.com/a.png',
      {
        key: 'chat/files/b.pdf',
        name: 'b.pdf',
        type: ChatFileTypeEnum.file
      }
    ]);
  });
});

describe('normalizeChatFileStoreValues', () => {
  it('批量清洗前端/历史输入，只保留可落库文件值', () => {
    expect(
      normalizeChatFileStoreValues([
        {
          key: 'chat/files/doc.pdf',
          url: 'https://preview.example.com/doc.pdf',
          name: 'doc.pdf',
          type: ChatFileTypeEnum.file,
          previewUrl: 'blob:http://local-preview'
        },
        {
          url: 'data:image/png;base64,abc',
          name: 'inline.png',
          type: ChatFileTypeEnum.image
        },
        { previewUrl: 'blob:http://local-only' } as any,
        {
          url: 'https://example.com/sound.m4a'
        }
      ])
    ).toEqual([
      {
        key: 'chat/files/doc.pdf',
        name: 'doc.pdf',
        type: ChatFileTypeEnum.file
      },
      {
        url: 'https://example.com/sound.m4a',
        name: 'sound.m4a',
        type: ChatFileTypeEnum.audio
      }
    ]);
  });

  it('默认兼容历史非法整体输入，强校验模式下抛错', () => {
    expect(normalizeChatFileStoreValues(undefined as any)).toEqual([]);
    expect(() => normalizeChatFileStoreValues(undefined as any, { throwOnInvalid: true })).toThrow(
      'File variable value must be an array'
    );
  });
});
