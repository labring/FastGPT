import { describe, expect, it } from 'vitest';
import { ChatFileTypeEnum } from '../../../../core/chat/constants';
import {
  getChatFileTypeByFilename,
  isChatFileMediaType,
  isChatFileResolvedType,
  normalizeChatFileType
} from '../../../../core/chat/file/utils';

describe('getChatFileTypeByFilename', () => {
  // 按分类与边界选代表值，不从实现使用的静态后缀表生成相同断言。
  it.each([
    ['photo.PNG', ChatFileTypeEnum.image],
    ['voice.mp3', ChatFileTypeEnum.audio],
    ['movie.mp4', ChatFileTypeEnum.video],
    ['report.PDF', ChatFileTypeEnum.document],
    ['legacy.doc', ChatFileTypeEnum.document],
    ['page.HtM', ChatFileTypeEnum.document],
    ['README.MARKDOWN', ChatFileTypeEnum.document],
    ['archive.zip', ChatFileTypeEnum.unknown],
    ['script.js', ChatFileTypeEnum.unknown],
    ['README', ChatFileTypeEnum.unknown],
    ['report.pdf.zip', ChatFileTypeEnum.unknown],
    ['file.jp', ChatFileTypeEnum.unknown],
    ['', ChatFileTypeEnum.unknown],
    [undefined, ChatFileTypeEnum.unknown]
  ])('classifies %s as %s', (filename, expected) => {
    expect(getChatFileTypeByFilename(filename)).toBe(expected);
  });
});

describe('isChatFileMediaType', () => {
  it('only selects image, audio and video for model media inputs', () => {
    expect(Object.values(ChatFileTypeEnum).filter(isChatFileMediaType)).toEqual([
      ChatFileTypeEnum.image,
      ChatFileTypeEnum.audio,
      ChatFileTypeEnum.video
    ]);
  });
});

describe('normalizeChatFileType', () => {
  it.each([
    ['photo.png', 'https://example.com/report.pdf', ChatFileTypeEnum.image],
    ['report.pdf', 'https://example.com/download.php?id=42', ChatFileTypeEnum.document],
    ['archive.zip', 'https://example.com/report.pdf', ChatFileTypeEnum.unknown]
  ])('归类旧 file 时以传入文件名 %s 为准', (filename, url, expected) => {
    expect(normalizeChatFileType({ type: ChatFileTypeEnum.file, filename, url })).toBe(expected);
  });

  it.each([
    ChatFileTypeEnum.image,
    ChatFileTypeEnum.audio,
    ChatFileTypeEnum.video,
    ChatFileTypeEnum.document
  ])('保留已经归类的 %s，不在下游重复猜测', (type) => {
    expect(
      normalizeChatFileType({
        type,
        filename: 'conflicting.zip',
        url: 'https://example.com/movie.mp4'
      })
    ).toBe(type);
  });

  it.each([ChatFileTypeEnum.file, ChatFileTypeEnum.unknown, undefined, 'invalid'])(
    '旧值、unknown、缺省和非法类型 %s 继续根据名称推测',
    (type) => {
      expect(normalizeChatFileType({ type, filename: 'report.PDF' })).toBe(
        ChatFileTypeEnum.document
      );
    }
  );

  it.each([
    ['https://example.com/report.pdf?token=1', ChatFileTypeEnum.document],
    ['https://example.com/download?filename=report.PDF', ChatFileTypeEnum.document],
    ['https://example.com/a%20b.mp3', ChatFileTypeEnum.audio],
    ['https://example.com/download', ChatFileTypeEnum.unknown],
    ['', ChatFileTypeEnum.unknown],
    ['https://example.com/%invalid', ChatFileTypeEnum.unknown]
  ])('缺少文件名时根据 URL %s 归类', (url, type) => {
    expect(normalizeChatFileType({ type: ChatFileTypeEnum.file, url })).toBe(type);
    expect(normalizeChatFileType({ filename: url })).toBe(type);
  });
});

describe('isChatFileResolvedType', () => {
  it('only treats concrete classifications as resolved', () => {
    expect(Object.values(ChatFileTypeEnum).filter(isChatFileResolvedType)).toEqual([
      ChatFileTypeEnum.image,
      ChatFileTypeEnum.audio,
      ChatFileTypeEnum.video,
      ChatFileTypeEnum.document
    ]);
  });
});
