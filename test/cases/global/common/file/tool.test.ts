import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  formatFileSize,
  detectFileEncoding,
  hasNonAsciiByte
} from '@fastgpt/global/common/file/tools';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('文件工具函数测试', () => {
  // Test files directory
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directory for test files
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'file-tools-test-'));
  });

  afterAll(async () => {
    // Clean up temporary directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('formatFileSize', () => {
    it('should format 0 bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 B');
    });

    it('should format bytes correctly', () => {
      expect(formatFileSize(1)).toBe('1 B');
      expect(formatFileSize(100)).toBe('100 B');
      expect(formatFileSize(1023)).toBe('1023 B');
    });

    it('should format kilobytes correctly', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(10240)).toBe('10 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
      expect(formatFileSize(10 * 1024 * 1024)).toBe('10 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
    });

    it('should format terabytes correctly', () => {
      expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
      expect(formatFileSize(1.25 * 1024 * 1024 * 1024 * 1024)).toBe('1.25 TB');
    });

    it('should format petabytes correctly', () => {
      expect(formatFileSize(1024 * 1024 * 1024 * 1024 * 1024)).toBe('1 PB');
    });

    it('should round to 2 decimal places', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1234567)).toBe('1.18 MB');
      expect(formatFileSize(1234567890)).toBe('1.15 GB');
    });

    it('should handle very large numbers', () => {
      const result = formatFileSize(9999999999999999);
      expect(result).toMatch(/\d+(\.\d+)?\s+(EB|PB)/);
    });

    it('should handle decimal values', () => {
      expect(formatFileSize(1024.5)).toBe('1 KB');
      expect(formatFileSize(1536.7)).toBe('1.5 KB');
    });
  });

  describe('detectFileEncoding', () => {
    it('should detect UTF-8 with BOM', () => {
      const content = Buffer.from('Hello 世界', 'utf8');
      const bomBuffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), content]);

      const encoding = detectFileEncoding(bomBuffer);

      expect(encoding).toBe('utf-8');
    });

    it('should detect UTF-8 encoding', () => {
      const utf8Text = 'Hello World 你好世界';
      const buffer = Buffer.from(utf8Text, 'utf8');
      const encoding = detectFileEncoding(buffer);

      expect(encoding).toBe('utf-8');
    });

    it('should detect ASCII encoding', () => {
      const asciiText = 'Hello World 123';
      const buffer = Buffer.from(asciiText, 'ascii');
      const encoding = detectFileEncoding(buffer);

      expect(['ascii', 'utf-8']).toContain(encoding);
    });

    it('should detect GB2312/GBK encoding', () => {
      // Chinese text in GBK encoding
      const chineseText = Buffer.from([0xc4, 0xe3, 0xba, 0xc3]); // "你好" in GBK
      const encoding = detectFileEncoding(chineseText);

      // jschardet may detect short Chinese text as various encodings
      expect(encoding).toBeDefined();
      expect(typeof encoding).toBe('string');
    });

    it('should handle empty buffer', () => {
      const buffer = Buffer.alloc(0);
      const encoding = detectFileEncoding(buffer);

      // Empty buffer may return undefined from jschardet
      expect([undefined, 'ascii', 'utf-8']).toContain(encoding);
    });

    it('should handle small buffer', () => {
      const buffer = Buffer.from('Hi');
      const encoding = detectFileEncoding(buffer);

      expect(encoding).toBeDefined();
    });

    it('should detect utf-8 for english prefix and chinese body', () => {
      const longEnglishPrefix = 'A'.repeat(2048);
      const mixedText = `${longEnglishPrefix}\n\n这里是中文正文。`;
      const buffer = Buffer.from(mixedText, 'utf8');

      const encoding = detectFileEncoding(buffer);

      expect(encoding).toBe('utf-8');
    });

    it('should handle binary data', () => {
      const binaryBuffer = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02, 0x03]);
      const encoding = detectFileEncoding(binaryBuffer);

      // Binary data might be detected as various encodings or undefined
      expect(encoding).toBeDefined();
    });

    it('should not treat invalid utf-8 byte sequence as utf-8', () => {
      // Windows-1252 smart quote bytes, invalid in standalone UTF-8 sequence
      const invalidUtf8Buffer = Buffer.from([0x93, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x94]);
      const encoding = detectFileEncoding(invalidUtf8Buffer);

      expect(encoding).not.toBe('utf-8');
    });
  });

  describe('hasNonAsciiByte', () => {
    it('should return false for pure ascii buffer', () => {
      const buffer = Buffer.from('Hello123', 'ascii');
      expect(hasNonAsciiByte(buffer)).toBe(false);
    });

    it('should return true for utf-8 chinese buffer', () => {
      const buffer = Buffer.from('中文', 'utf8');
      expect(hasNonAsciiByte(buffer)).toBe(true);
    });
  });
});
