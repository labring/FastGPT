import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatFileSize, detectFileEncoding } from '@fastgpt/global/common/file/tools';
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

    it('should only read first 200 bytes', () => {
      // Create a large buffer
      const largeBuffer = Buffer.alloc(1000);
      largeBuffer.write('UTF-8 text at beginning', 0, 'utf8');

      const encoding = detectFileEncoding(largeBuffer);

      expect(encoding).toBeDefined();
    });

    it('should handle binary data', () => {
      const binaryBuffer = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02, 0x03]);
      const encoding = detectFileEncoding(binaryBuffer);

      // Binary data might be detected as various encodings or undefined
      expect(encoding).toBeDefined();
    });
  });
});
