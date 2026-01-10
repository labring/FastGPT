import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sanitizeS3ObjectKey,
  getFormatedFilename,
  truncateFilename,
  S3_FILENAME_MAX_LENGTH,
  isS3ObjectKey,
  getFileS3Key
} from '@fastgpt/service/common/s3/utils';
import * as stringTools from '@fastgpt/global/common/string/tools';

describe('truncateFilename', () => {
  it('should return filename as-is if within max length', () => {
    const filename = 'short.pdf';
    expect(truncateFilename(filename)).toBe('short.pdf');
  });

  it('should return filename as-is if exactly at max length', () => {
    const filename = 'a'.repeat(46) + '.pdf'; // 46 + 4 = 50
    expect(truncateFilename(filename, 50)).toBe(filename);
  });

  it('should truncate long filename while preserving extension', () => {
    const filename = 'a'.repeat(100) + '.pdf';
    const result = truncateFilename(filename, 50);

    expect(result.length).toBe(50);
    expect(result.endsWith('.pdf')).toBe(true);
    expect(result).toBe('a'.repeat(46) + '.pdf');
  });

  it('should handle filename with very long extension', () => {
    const filename = 'test.' + 'x'.repeat(100);
    const result = truncateFilename(filename, 50);

    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.startsWith('.')).toBe(true);
  });

  it('should handle filename without extension', () => {
    const filename = 'a'.repeat(100);
    const result = truncateFilename(filename, 50);

    expect(result.length).toBe(50);
    expect(result).toBe('a'.repeat(50));
  });

  it('should handle empty filename', () => {
    expect(truncateFilename('')).toBe('');
  });

  it('should use default max length if not specified', () => {
    const filename = 'a'.repeat(100) + '.pdf';
    const result = truncateFilename(filename);

    expect(result.length).toBe(S3_FILENAME_MAX_LENGTH);
  });

  it('should handle filename with multiple dots', () => {
    const filename = 'my.file.name.with.dots.' + 'a'.repeat(100) + '.pdf';
    const result = truncateFilename(filename, 30);

    expect(result.length).toBe(30);
    expect(result.endsWith('.pdf')).toBe(true);
  });

  it('should handle Chinese characters in filename', () => {
    const filename = '这是一个很长的中文文件名'.repeat(10) + '.pdf';
    const result = truncateFilename(filename, 50);

    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.endsWith('.pdf')).toBe(true);
  });
});

describe('getFormatedFilename', () => {
  let mockNanoid: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock getNanoid to return predictable values
    mockNanoid = vi.fn();
    vi.spyOn(stringTools, 'getNanoid').mockImplementation((length) => {
      if (length === 12) return 'random12char';
      if (length === 6) return 'abc123';
      return 'nanoid';
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('empty or undefined filename', () => {
    it('should return 12-char random ID with empty extension when no filename provided', () => {
      const result = getFormatedFilename();

      expect(result).toEqual({
        formatedFilename: 'random12char',
        extension: ''
      });
    });

    it('should return 12-char random ID with empty extension when undefined passed', () => {
      const result = getFormatedFilename(undefined);

      expect(result).toEqual({
        formatedFilename: 'random12char',
        extension: ''
      });
    });

    it('should return 12-char random ID with empty extension when empty string passed', () => {
      const result = getFormatedFilename('');

      expect(result).toEqual({
        formatedFilename: 'random12char',
        extension: ''
      });
    });
  });

  describe('basic filename formatting', () => {
    it('should format simple filename with extension', () => {
      const result = getFormatedFilename('document.pdf');

      expect(result.formatedFilename).toBe('document_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should format filename without extension', () => {
      const result = getFormatedFilename('document');

      expect(result.formatedFilename).toBe('document_abc123');
      expect(result.extension).toBe('');
    });

    it('should handle filename with multiple dots', () => {
      const result = getFormatedFilename('my.file.name.pdf');

      expect(result.formatedFilename).toBe('my.file.name_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should handle filename with spaces', () => {
      const result = getFormatedFilename('my document.pdf');

      expect(result.formatedFilename).toBe('my document_abc123');
      expect(result.extension).toBe('pdf');
    });
  });

  describe('parentheses sanitization', () => {
    it('should replace opening parenthesis with opening bracket', () => {
      const result = getFormatedFilename('file(name).pdf');

      expect(result.formatedFilename).toBe('file[name]_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should replace closing parenthesis with closing bracket', () => {
      const result = getFormatedFilename('file(test).pdf');

      expect(result.formatedFilename).toBe('file[test]_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should replace multiple parentheses', () => {
      const result = getFormatedFilename('(file)(name)(test).pdf');

      expect(result.formatedFilename).toBe('[file][name][test]_abc123');
      expect(result.extension).toBe('pdf');
    });
  });

  describe('existing random suffix removal', () => {
    it('should remove existing 6-character suffix', () => {
      const result = getFormatedFilename('document_xyz789.pdf');

      expect(result.formatedFilename).toBe('document_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should not remove suffix if not 6 characters', () => {
      const result = getFormatedFilename('document_xyz78.pdf');

      expect(result.formatedFilename).toBe('document_xyz78_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should not remove suffix if more than 6 characters', () => {
      const result = getFormatedFilename('document_xyz7890.pdf');

      expect(result.formatedFilename).toBe('document_xyz7890_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should handle multiple underscores and only remove last 6-char suffix', () => {
      const result = getFormatedFilename('my_document_name_abc456.pdf');

      expect(result.formatedFilename).toBe('my_document_name_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should not remove underscore if no suffix follows', () => {
      const result = getFormatedFilename('document_.pdf');

      expect(result.formatedFilename).toBe('document__abc123');
      expect(result.extension).toBe('pdf');
    });
  });

  describe('long filename truncation', () => {
    it('should truncate very long filename before formatting', () => {
      const longName = 'a'.repeat(100);
      const result = getFormatedFilename(`${longName}.pdf`);

      // Should be truncated to max length first
      expect(result.formatedFilename.length).toBeLessThanOrEqual(S3_FILENAME_MAX_LENGTH + 7); // +7 for _abc123
      expect(result.extension).toBe('pdf');
    });

    it('should handle long filename with existing suffix', () => {
      const longName = 'a'.repeat(100);
      const result = getFormatedFilename(`${longName}_xyz789.pdf`);

      expect(result.extension).toBe('pdf');
      expect(result.formatedFilename).toContain('_abc123');
    });
  });

  describe('special characters and edge cases', () => {
    it('should handle Chinese characters', () => {
      const result = getFormatedFilename('文档.pdf');

      expect(result.formatedFilename).toBe('文档_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should handle mixed Chinese and English', () => {
      const result = getFormatedFilename('my文档document.pdf');

      expect(result.formatedFilename).toBe('my文档document_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should handle filename with special characters', () => {
      const result = getFormatedFilename('file-name_test.pdf');

      expect(result.formatedFilename).toBe('file-name_test_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should handle filename starting with dot (treated as hidden file)', () => {
      // Files like .hidden have no extension in Node.js path.extname()
      const result = getFormatedFilename('.hidden');

      expect(result.formatedFilename).toBe('.hidden_abc123');
      expect(result.extension).toBe('');
    });

    it('should handle filename starting with dot and common extension', () => {
      // Files like .pdf are treated as hidden files, not as extensions
      const result = getFormatedFilename('.pdf');

      expect(result.formatedFilename).toBe('.pdf_abc123');
      expect(result.extension).toBe('');
    });
  });

  describe('common file extensions', () => {
    const extensions = [
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'jpg',
      'jpeg',
      'png',
      'gif',
      'svg',
      'webp',
      'txt',
      'csv',
      'json',
      'xml',
      'html',
      'css',
      'js',
      'ts'
    ];

    extensions.forEach((ext) => {
      it(`should correctly handle .${ext} extension`, () => {
        const result = getFormatedFilename(`document.${ext}`);

        expect(result.formatedFilename).toBe('document_abc123');
        expect(result.extension).toBe(ext);
      });
    });
  });

  describe('real-world scenarios', () => {
    it('should handle typical user upload filename', () => {
      const result = getFormatedFilename('My Document (Final Version).pdf');

      expect(result.formatedFilename).toBe('My Document [Final Version]_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should handle filename from different OS', () => {
      const result = getFormatedFilename('file:name.pdf'); // colon in Windows

      expect(result.formatedFilename).toBe('file:name_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should handle filename with timestamp', () => {
      const result = getFormatedFilename('report_2024-01-07_15-30-00.pdf');

      expect(result.formatedFilename).toBe('report_2024-01-07_15-30-00_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should handle re-uploaded file with existing format', () => {
      const result = getFormatedFilename('document_xyz789.pdf');

      // Should remove old suffix and add new one
      expect(result.formatedFilename).toBe('document_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should handle filename with version number (6 chars treated as suffix)', () => {
      // Note: v1.2.3 is exactly 6 characters, so it's treated as a random suffix and removed
      const result = getFormatedFilename('document_v1.2.3.pdf');

      expect(result.formatedFilename).toBe('document_abc123');
      expect(result.extension).toBe('pdf');
    });

    it('should keep version number if not exactly 6 characters', () => {
      const result = getFormatedFilename('document_v1.2.10.pdf');

      expect(result.formatedFilename).toBe('document_v1.2.10_abc123');
      expect(result.extension).toBe('pdf');
    });
  });

  describe('extension handling', () => {
    it('should remove leading dot from extension', () => {
      const result = getFormatedFilename('file.PDF');

      expect(result.extension).toBe('PDF');
      expect(result.extension.startsWith('.')).toBe(false);
    });

    it('should handle uppercase extensions', () => {
      const result = getFormatedFilename('document.PDF');

      expect(result.formatedFilename).toBe('document_abc123');
      expect(result.extension).toBe('PDF');
    });

    it('should handle mixed case extensions', () => {
      const result = getFormatedFilename('document.PdF');

      expect(result.formatedFilename).toBe('document_abc123');
      expect(result.extension).toBe('PdF');
    });
  });
});

describe('sanitizeS3ObjectKey', () => {
  it('should replace parentheses with square brackets', () => {
    expect(sanitizeS3ObjectKey('file(1).txt')).toBe('file[1].txt');
    expect(sanitizeS3ObjectKey('photo (copy).jpg')).toBe('photo [copy].jpg');
    expect(sanitizeS3ObjectKey('document(v2)(final).pdf')).toBe('document[v2][final].pdf');
  });

  it('should replace opening parenthesis with opening bracket', () => {
    expect(sanitizeS3ObjectKey('test(')).toBe('test[');
    expect(sanitizeS3ObjectKey('((test')).toBe('[[test');
  });

  it('should replace closing parenthesis with closing bracket', () => {
    expect(sanitizeS3ObjectKey('test)')).toBe('test]');
    expect(sanitizeS3ObjectKey('test))')).toBe('test]]');
  });

  it('should handle multiple parentheses', () => {
    expect(sanitizeS3ObjectKey('a(b)c(d)e')).toBe('a[b]c[d]e');
    expect(sanitizeS3ObjectKey('((()))')).toBe('[[[]]]');
  });

  it('should return unchanged string when no parentheses present', () => {
    expect(sanitizeS3ObjectKey('normal-file.txt')).toBe('normal-file.txt');
    expect(sanitizeS3ObjectKey('path/to/file.jpg')).toBe('path/to/file.jpg');
    expect(sanitizeS3ObjectKey('file_name_123.pdf')).toBe('file_name_123.pdf');
  });

  it('should handle empty string', () => {
    expect(sanitizeS3ObjectKey('')).toBe('');
  });

  it('should preserve existing square brackets', () => {
    expect(sanitizeS3ObjectKey('file[1].txt')).toBe('file[1].txt');
    expect(sanitizeS3ObjectKey('file[1](2).txt')).toBe('file[1][2].txt');
  });

  it('should handle S3 key paths with parentheses', () => {
    expect(sanitizeS3ObjectKey('dataset/uploads/file (1).pdf')).toBe(
      'dataset/uploads/file [1].pdf'
    );
    expect(sanitizeS3ObjectKey('chat/images/photo(copy).jpg')).toBe('chat/images/photo[copy].jpg');
  });
});

describe('isS3ObjectKey', () => {
  describe('valid keys', () => {
    it('should return true for valid temp source key', () => {
      expect(isS3ObjectKey('temp/team123/file.pdf', 'temp')).toBe(true);
    });

    it('should return true for valid avatar source key', () => {
      expect(isS3ObjectKey('avatar/team123/image.jpg', 'avatar')).toBe(true);
    });

    it('should return true for valid chat source key', () => {
      expect(isS3ObjectKey('chat/app123/user456/chat789/file.txt', 'chat')).toBe(true);
    });

    it('should return true for valid dataset source key', () => {
      expect(isS3ObjectKey('dataset/dataset123/document.pdf', 'dataset')).toBe(true);
    });

    it('should return true for valid rawText source key', () => {
      expect(isS3ObjectKey('rawText/abc123hash', 'rawText')).toBe(true);
    });

    it('should return true for key with nested path', () => {
      expect(isS3ObjectKey('temp/team123/folder1/folder2/file.pdf', 'temp')).toBe(true);
    });

    it('should return true for key with special characters', () => {
      expect(isS3ObjectKey('temp/team123/文档_abc123.pdf', 'temp')).toBe(true);
    });
  });

  describe('invalid keys', () => {
    it('should return false for undefined key', () => {
      expect(isS3ObjectKey(undefined, 'temp')).toBe(false);
    });

    it('should return false for null key', () => {
      expect(isS3ObjectKey(null, 'temp')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isS3ObjectKey('', 'temp')).toBe(false);
    });

    it('should return false for wrong source prefix', () => {
      expect(isS3ObjectKey('avatar/team123/file.pdf', 'temp')).toBe(false);
    });

    it('should return false for key without slash after source', () => {
      expect(isS3ObjectKey('temp', 'temp')).toBe(false);
      expect(isS3ObjectKey('tempfile.pdf', 'temp')).toBe(false);
    });

    it('should return false for key with partial match', () => {
      expect(isS3ObjectKey('notemp/file.pdf', 'temp')).toBe(false);
      expect(isS3ObjectKey('mytempfile.pdf', 'temp')).toBe(false);
    });

    it('should return false for non-string value', () => {
      // @ts-expect-error - testing runtime behavior
      expect(isS3ObjectKey(123, 'temp')).toBe(false);
      // @ts-expect-error - testing runtime behavior
      expect(isS3ObjectKey({}, 'temp')).toBe(false);
      // @ts-expect-error - testing runtime behavior
      expect(isS3ObjectKey([], 'temp')).toBe(false);
    });

    it('should be case-sensitive for source prefix', () => {
      expect(isS3ObjectKey('Temp/team123/file.pdf', 'temp')).toBe(false);
      expect(isS3ObjectKey('TEMP/team123/file.pdf', 'temp')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle key with only source and slash', () => {
      expect(isS3ObjectKey('temp/', 'temp')).toBe(true);
    });

    it('should distinguish between different sources', () => {
      const key = 'temp/team123/file.pdf';
      expect(isS3ObjectKey(key, 'temp')).toBe(true);
      expect(isS3ObjectKey(key, 'avatar')).toBe(false);
      expect(isS3ObjectKey(key, 'chat')).toBe(false);
      expect(isS3ObjectKey(key, 'dataset')).toBe(false);
    });
  });
});

describe('getFileS3Key', () => {
  let mockNanoid: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockNanoid = vi.fn();
    vi.spyOn(stringTools, 'getNanoid').mockImplementation((length) => {
      if (length === 12) return 'random12char';
      if (length === 6) return 'abc123';
      return 'nanoid';
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('temp', () => {
    it('should generate temp file key with filename', () => {
      const result = getFileS3Key.temp({
        teamId: 'team123',
        filename: 'document.pdf'
      });

      expect(result.fileKey).toBe('temp/team123/document_abc123.pdf');
      expect(result.fileParsedPrefix).toBe('temp/team123/document_abc123-parsed');
    });

    it('should generate temp file key without filename', () => {
      const result = getFileS3Key.temp({
        teamId: 'team123'
      });

      expect(result.fileKey).toBe('temp/team123/random12char');
      expect(result.fileParsedPrefix).toBe('temp/team123/random12char-parsed');
    });

    it('should handle filename without extension', () => {
      const result = getFileS3Key.temp({
        teamId: 'team123',
        filename: 'document'
      });

      expect(result.fileKey).toBe('temp/team123/document_abc123');
      expect(result.fileParsedPrefix).toBe('temp/team123/document_abc123-parsed');
    });

    it('should handle Chinese filename', () => {
      const result = getFileS3Key.temp({
        teamId: 'team123',
        filename: '文档.pdf'
      });

      expect(result.fileKey).toBe('temp/team123/文档_abc123.pdf');
      expect(result.fileParsedPrefix).toBe('temp/team123/文档_abc123-parsed');
    });
  });

  describe('avatar', () => {
    it('should generate avatar file key with filename', () => {
      const result = getFileS3Key.avatar({
        teamId: 'team123',
        filename: 'avatar.jpg'
      });

      expect(result.fileKey).toBe('avatar/team123/avatar_abc123.jpg');
    });

    it('should generate avatar file key without filename', () => {
      const result = getFileS3Key.avatar({
        teamId: 'team123'
      });

      expect(result.fileKey).toBe('avatar/team123/random12char');
    });

    it('should handle different image extensions', () => {
      const extensions = ['jpg', 'png', 'gif', 'webp', 'svg'];

      extensions.forEach((ext) => {
        const result = getFileS3Key.avatar({
          teamId: 'team123',
          filename: `avatar.${ext}`
        });

        expect(result.fileKey).toBe(`avatar/team123/avatar_abc123.${ext}`);
      });
    });
  });

  describe('chat', () => {
    it('should generate chat file key with all params', () => {
      const result = getFileS3Key.chat({
        appId: 'app123',
        chatId: 'chat456',
        uId: 'user789',
        filename: 'image.jpg'
      });

      expect(result.fileKey).toBe('chat/app123/user789/chat456/image_abc123.jpg');
      expect(result.fileParsedPrefix).toBe('chat/app123/user789/chat456/image_abc123-parsed');
    });

    it('should generate chat file key without filename', () => {
      const result = getFileS3Key.chat({
        appId: 'app123',
        chatId: 'chat456',
        uId: 'user789'
      });

      expect(result.fileKey).toBe('chat/app123/user789/chat456/random12char');
      expect(result.fileParsedPrefix).toBe('chat/app123/user789/chat456/random12char-parsed');
    });

    it('should handle empty uId', () => {
      const result = getFileS3Key.chat({
        appId: 'app123',
        chatId: 'chat456',
        uId: '',
        filename: 'file.pdf'
      });

      expect(result.fileKey).toBe('chat/app123/chat456/file_abc123.pdf');
    });

    it('should handle different file types', () => {
      const files = [
        { filename: 'image.jpg', ext: 'jpg' },
        { filename: 'document.pdf', ext: 'pdf' },
        { filename: 'data.csv', ext: 'csv' },
        { filename: 'script.js', ext: 'js' }
      ];

      files.forEach(({ filename, ext }) => {
        const result = getFileS3Key.chat({
          appId: 'app123',
          chatId: 'chat456',
          uId: 'user789',
          filename
        });

        expect(result.fileKey).toContain(`.${ext}`);
      });
    });
  });

  describe('dataset', () => {
    it('should generate dataset file key with filename', () => {
      const result = getFileS3Key.dataset({
        datasetId: 'dataset123',
        filename: 'data.csv'
      });

      expect(result.fileKey).toBe('dataset/dataset123/data_abc123.csv');
      expect(result.fileParsedPrefix).toBe('dataset/dataset123/data_abc123-parsed');
    });

    it('should generate dataset file key without filename', () => {
      const result = getFileS3Key.dataset({
        datasetId: 'dataset123',
        filename: ''
      });

      expect(result.fileKey).toBe('dataset/dataset123/random12char');
      expect(result.fileParsedPrefix).toBe('dataset/dataset123/random12char-parsed');
    });

    it('should handle long dataset filenames', () => {
      const longFilename = 'a'.repeat(100) + '.pdf';
      const result = getFileS3Key.dataset({
        datasetId: 'dataset123',
        filename: longFilename
      });

      // Should be truncated
      expect(result.fileKey.length).toBeLessThan(`dataset/dataset123/${longFilename}`.length);
      expect(result.fileKey).toContain('.pdf');
    });
  });

  describe('s3Key', () => {
    it('should generate parsed prefix from existing s3 key', () => {
      const result = getFileS3Key.s3Key('temp/team123/file_abc123.pdf');

      expect(result.fileKey).toBe('temp/team123/file_abc123.pdf');
      expect(result.fileParsedPrefix).toBe('temp/team123/file_abc123-parsed');
    });

    it('should handle key without extension', () => {
      const result = getFileS3Key.s3Key('temp/team123/file_abc123');

      expect(result.fileKey).toBe('temp/team123/file_abc123');
      expect(result.fileParsedPrefix).toBe('temp/team123/file_abc123-parsed');
    });

    it('should handle key with multiple dots', () => {
      const result = getFileS3Key.s3Key('temp/team123/my.file.name.pdf');

      expect(result.fileKey).toBe('temp/team123/my.file.name.pdf');
      expect(result.fileParsedPrefix).toBe('temp/team123/my.file.name-parsed');
    });

    it('should handle nested path', () => {
      const result = getFileS3Key.s3Key('temp/team123/folder1/folder2/file.pdf');

      expect(result.fileKey).toBe('temp/team123/folder1/folder2/file.pdf');
      expect(result.fileParsedPrefix).toBe('temp/team123/folder1/folder2/file-parsed');
    });

    it('should handle root level key', () => {
      const result = getFileS3Key.s3Key('file.pdf');

      expect(result.fileKey).toBe('file.pdf');
      expect(result.fileParsedPrefix).toBe('file-parsed');
    });
  });

  describe('rawText', () => {
    it('should generate rawText key with hash only', () => {
      const result = getFileS3Key.rawText({
        hash: 'abc123hash'
      });

      expect(result).toBe('rawText/abc123hash');
    });

    it('should generate rawText key with customPdfParse false', () => {
      const result = getFileS3Key.rawText({
        hash: 'abc123hash',
        customPdfParse: false
      });

      expect(result).toBe('rawText/abc123hash');
    });

    it('should generate rawText key with customPdfParse true', () => {
      const result = getFileS3Key.rawText({
        hash: 'abc123hash',
        customPdfParse: true
      });

      expect(result).toBe('rawText/abc123hash-true');
    });

    it('should handle different hash formats', () => {
      const hashes = ['md5hash123', 'sha256hash', '123456'];

      hashes.forEach((hash) => {
        const result = getFileS3Key.rawText({ hash });
        expect(result).toBe(`rawText/${hash}`);
      });
    });

    it('should distinguish between customPdfParse true and false', () => {
      const hash = 'samehash';
      const withoutCustom = getFileS3Key.rawText({ hash });
      const withCustom = getFileS3Key.rawText({ hash, customPdfParse: true });

      expect(withoutCustom).not.toBe(withCustom);
      expect(withCustom).toBe('rawText/samehash-true');
      expect(withoutCustom).toBe('rawText/samehash');
    });
  });

  describe('integration - sanitization', () => {
    it('should sanitize parentheses in temp files', () => {
      const result = getFileS3Key.temp({
        teamId: 'team123',
        filename: 'file(1).pdf'
      });

      expect(result.fileKey).toBe('temp/team123/file[1]_abc123.pdf');
    });

    it('should sanitize parentheses in avatar files', () => {
      const result = getFileS3Key.avatar({
        teamId: 'team123',
        filename: 'avatar(copy).jpg'
      });

      expect(result.fileKey).toBe('avatar/team123/avatar[copy]_abc123.jpg');
    });

    it('should sanitize parentheses in chat files', () => {
      const result = getFileS3Key.chat({
        appId: 'app123',
        chatId: 'chat456',
        uId: 'user789',
        filename: 'image(final).png'
      });

      expect(result.fileKey).toBe('chat/app123/user789/chat456/image[final]_abc123.png');
    });

    it('should sanitize parentheses in dataset files', () => {
      const result = getFileS3Key.dataset({
        datasetId: 'dataset123',
        filename: 'data(v2).csv'
      });

      expect(result.fileKey).toBe('dataset/dataset123/data[v2]_abc123.csv');
    });
  });

  describe('integration - existing suffix removal', () => {
    it('should remove existing 6-char suffix from temp files', () => {
      const result = getFileS3Key.temp({
        teamId: 'team123',
        filename: 'file_xyz789.pdf'
      });

      expect(result.fileKey).toBe('temp/team123/file_abc123.pdf');
    });

    it('should remove existing 6-char suffix from chat files', () => {
      const result = getFileS3Key.chat({
        appId: 'app123',
        chatId: 'chat456',
        uId: 'user789',
        filename: 'image_old123.jpg'
      });

      expect(result.fileKey).toBe('chat/app123/user789/chat456/image_abc123.jpg');
    });
  });
});
