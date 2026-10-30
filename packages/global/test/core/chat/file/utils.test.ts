import { describe, expect, it } from 'vitest';
import { documentFileExtensions } from '../../../../common/file/constants';
import { ChatFileTypeEnum } from '../../../../core/chat/constants';
import {
  getChatFileTypeByFilename,
  isChatFileMediaType,
  isChatFileResolvedType,
  normalizeChatFileType
} from '../../../../core/chat/file/utils';

describe('getChatFileTypeByFilename', () => {
  it.each(['page.HtM', 'README.MARKDOWN'])('recognizes parser-supported alias %s', (filename) => {
    expect(getChatFileTypeByFilename(filename)).toBe(ChatFileTypeEnum.document);
  });

  it.each(documentFileExtensions)('recognizes parser-supported format %s', (extension) => {
    expect(getChatFileTypeByFilename(`report${extension.toUpperCase()}`)).toBe(
      ChatFileTypeEnum.document
    );
  });

  it.each(['archive.zip', 'script.js', 'README', 'report.pdf.zip', '', 'file.jp'])(
    'keeps unsupported format %s unknown',
    (filename) => {
      expect(getChatFileTypeByFilename(filename)).toBe(ChatFileTypeEnum.unknown);
    }
  );

  it('preserves media types', () => {
    expect(getChatFileTypeByFilename('photo.PNG')).toBe(ChatFileTypeEnum.image);
    expect(getChatFileTypeByFilename('voice.mp3')).toBe(ChatFileTypeEnum.audio);
    expect(getChatFileTypeByFilename('movie.mp4')).toBe(ChatFileTypeEnum.video);
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
    expect(normalizeChatFileType({ type, filename: 'conflicting.zip' })).toBe(type);
  });

  it.each([ChatFileTypeEnum.file, ChatFileTypeEnum.unknown, undefined, 'invalid'])(
    '旧值或缺省类型 %s 在输入边界归类，未知格式不会变成文档',
    (type) => {
      expect(normalizeChatFileType({ type, filename: 'report.PDF' })).toBe(
        ChatFileTypeEnum.document
      );
      expect(normalizeChatFileType({ type, filename: 'archive.zip' })).toBe(
        ChatFileTypeEnum.unknown
      );
      expect(normalizeChatFileType({ type, filename: 'photo.png' })).toBe(ChatFileTypeEnum.image);
    }
  );

  it.each([
    ['https://example.com/report.pdf?token=1', ChatFileTypeEnum.document],
    ['https://example.com/download?filename=report.PDF', ChatFileTypeEnum.document],
    ['https://example.com/a%20b.mp3', ChatFileTypeEnum.audio],
    ['https://example.com/download', ChatFileTypeEnum.unknown],
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
