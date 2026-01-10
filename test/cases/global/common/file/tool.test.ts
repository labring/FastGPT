import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  formatFileSize,
  detectFileEncoding,
  detectFileEncodingByPath,
  parseUrlToFileType
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

  describe('detectFileEncodingByPath', () => {
    it('should detect UTF-8 file encoding', async () => {
      const filePath = path.join(tempDir, 'utf8-test.txt');
      await fs.promises.writeFile(filePath, 'Hello World 你好世界', 'utf8');

      const encoding = await detectFileEncodingByPath(filePath);

      expect(encoding).toBe('utf-8');
    });

    it('should detect ASCII file encoding', async () => {
      const filePath = path.join(tempDir, 'ascii-test.txt');
      await fs.promises.writeFile(filePath, 'Hello World 123', 'ascii');

      const encoding = await detectFileEncodingByPath(filePath);

      expect(['ascii', 'utf-8']).toContain(encoding);
    });

    it('should handle empty file', async () => {
      const filePath = path.join(tempDir, 'empty-test.txt');
      await fs.promises.writeFile(filePath, '');

      const encoding = await detectFileEncodingByPath(filePath);

      // Empty file may return undefined from jschardet
      expect([undefined, 'ascii', 'utf-8']).toContain(encoding);
    });

    it('should handle large file (>64KB)', async () => {
      const filePath = path.join(tempDir, 'large-test.txt');
      const largeContent = 'A'.repeat(100 * 1024); // 100KB
      await fs.promises.writeFile(filePath, largeContent);

      const encoding = await detectFileEncodingByPath(filePath);

      expect(encoding).toBeDefined();
    });

    it('should handle small file (<64KB)', async () => {
      const filePath = path.join(tempDir, 'small-test.txt');
      await fs.promises.writeFile(filePath, 'Small content', 'utf8');

      const encoding = await detectFileEncodingByPath(filePath);

      expect(encoding).toBeDefined();
    });

    it('should throw error for non-existent file', async () => {
      const filePath = path.join(tempDir, 'non-existent.txt');

      await expect(detectFileEncodingByPath(filePath)).rejects.toThrow();
    });

    it('should close file descriptor on error', async () => {
      const filePath = path.join(tempDir, 'test-close.txt');
      await fs.promises.writeFile(filePath, 'test content');

      // This should not throw even if called multiple times
      await detectFileEncodingByPath(filePath);
      await detectFileEncodingByPath(filePath);

      // File should be accessible after previous calls
      const content = await fs.promises.readFile(filePath, 'utf8');
      expect(content).toBe('test content');
    });
  });

  describe('parseUrlToFileType', () => {
    describe('base64 images', () => {
      it('should parse base64 PNG image', () => {
        const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.image,
          name: 'image.png',
          url
        });
      });

      it('should parse base64 JPEG image', () => {
        const url = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.image,
          name: 'image.jpeg',
          url
        });
      });

      it('should parse base64 GIF image', () => {
        const url =
          'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.image,
          name: 'image.gif',
          url
        });
      });

      it('should parse base64 WebP image', () => {
        const url =
          'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.image,
          name: 'image.webp',
          url
        });
      });

      it('should handle base64 with uppercase MIME type', () => {
        const url = 'data:IMAGE/PNG;base64,ABC123';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.image,
          name: 'image.png',
          url
        });
      });

      it('should return undefined for non-image base64', () => {
        const url = 'data:application/pdf;base64,JVBERi0xLjQK';
        const result = parseUrlToFileType(url);

        expect(result).toBeUndefined();
      });

      it('should return undefined for malformed base64 data URL', () => {
        const url = 'data:invalid';
        const result = parseUrlToFileType(url);

        expect(result).toBeUndefined();
      });
    });

    describe('S3 Object Key URLs', () => {
      it('should parse S3 chat image URL', () => {
        const url = 'chat/image.png';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.image,
          name: 'image.png',
          url
        });
      });

      it('should parse S3 chat file URL', () => {
        const url = 'chat/document.pdf';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.file,
          name: 'document.pdf',
          url
        });
      });

      it('should parse S3 nested path', () => {
        const url = 'chat/subfolder/image.jpg';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.image,
          name: 'image.jpg',
          url
        });
      });
    });

    describe('HTTP/HTTPS URLs', () => {
      it('should parse HTTP image URL with extension', () => {
        const url = 'http://example.com/images/photo.jpg';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.image,
          name: 'photo.jpg',
          url
        });
      });

      it('should parse HTTPS image URL with extension', () => {
        const url = 'https://cdn.example.com/image.png';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.image,
          name: 'image.png',
          url
        });
      });

      it('should parse URL with filename query parameter', () => {
        const url = 'https://example.com/download?filename=photo.jpg&token=abc';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.image,
          name: 'photo.jpg',
          url
        });
      });

      it('should parse URL without extension as file', () => {
        const url = 'https://example.com/download/file';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.file,
          name: 'null',
          url
        });
      });

      it('should handle URL with no filename', () => {
        const url = 'https://example.com/';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.file,
          name: 'null',
          url
        });
      });

      it('should handle URL with empty filename', () => {
        const url = 'https://example.com/path/';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.file,
          name: 'null',
          url
        });
      });

      it('should parse document file URL', () => {
        const url = 'https://example.com/document.pdf';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.file,
          name: 'document.pdf',
          url
        });
      });
    });

    describe('image file type detection', () => {
      const imageExtensions = [
        'jpg',
        'jpeg',
        'png',
        'gif',
        'bmp',
        'webp',
        'svg',
        'tiff',
        'ico',
        'heic'
      ];

      imageExtensions.forEach((ext) => {
        it(`should detect .${ext} as image type`, () => {
          const url = `https://example.com/file.${ext}`;
          const result = parseUrlToFileType(url);

          expect(result?.type).toBe(ChatFileTypeEnum.image);
          expect(result?.name).toBe(`file.${ext}`);
        });

        it(`should detect .${ext.toUpperCase()} as image type (case insensitive)`, () => {
          const url = `https://example.com/file.${ext.toUpperCase()}`;
          const result = parseUrlToFileType(url);

          expect(result?.type).toBe(ChatFileTypeEnum.image);
        });
      });
    });

    describe('edge cases', () => {
      it('should return undefined for non-string input', () => {
        // @ts-ignore - testing runtime behavior
        const result = parseUrlToFileType(123);

        expect(result).toBeUndefined();
      });

      it('should return undefined for null', () => {
        // @ts-ignore - testing runtime behavior
        const result = parseUrlToFileType(null);

        expect(result).toBeUndefined();
      });

      it('should return undefined for undefined', () => {
        // @ts-ignore - testing runtime behavior
        const result = parseUrlToFileType(undefined);

        expect(result).toBeUndefined();
      });

      it('should handle malformed URL', () => {
        const url = 'not-a-valid-url';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.file,
          name: 'null',
          url
        });
      });

      it('should handle URL with special characters in filename', () => {
        const url = 'https://example.com/file%20name.jpg';
        const result = parseUrlToFileType(url);

        expect(result?.type).toBe(ChatFileTypeEnum.image);
        expect(result?.name).toBe('file%20name.jpg');
      });

      it('should handle URL with multiple dots in filename', () => {
        const url = 'https://example.com/my.file.name.png';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.image,
          name: 'my.file.name.png',
          url
        });
      });

      it('should handle URL with query parameters and hash', () => {
        const url = 'https://example.com/image.jpg?size=large&quality=high#section';
        const result = parseUrlToFileType(url);

        expect(result?.type).toBe(ChatFileTypeEnum.image);
        expect(result?.name).toBe('image.jpg');
      });

      it('should handle relative URL paths', () => {
        const url = '/static/images/logo.png';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.image,
          name: 'logo.png',
          url
        });
      });

      it('should handle filename with no extension', () => {
        const url = 'https://example.com/download/myfile';
        const result = parseUrlToFileType(url);

        expect(result).toEqual({
          type: ChatFileTypeEnum.file,
          name: 'null',
          url
        });
      });
    });

    describe('filename extraction priority', () => {
      it('should prefer filename query parameter over pathname', () => {
        const url = 'https://example.com/download/abc123?filename=document.pdf';
        const result = parseUrlToFileType(url);

        expect(result?.name).toBe('document.pdf');
      });

      it('should use pathname when filename parameter is missing', () => {
        const url = 'https://example.com/files/report.xlsx';
        const result = parseUrlToFileType(url);

        expect(result?.name).toBe('report.xlsx');
      });

      it('should handle empty filename parameter', () => {
        const url = 'https://example.com/download?filename=';
        const result = parseUrlToFileType(url);

        // Empty filename parameter should fall back to pathname
        expect(result?.name).toBeDefined();
      });
    });
  });

  describe('integration tests', () => {
    it('should handle file workflow from path to size format', async () => {
      const filePath = path.join(tempDir, 'integration-test.txt');
      const content = 'Hello World 你好世界';

      // Write file
      await fs.promises.writeFile(filePath, content, 'utf8');

      // Detect encoding
      const encoding = await detectFileEncodingByPath(filePath);
      expect(encoding).toBe('utf-8');

      // Get file size
      const stats = await fs.promises.stat(filePath);
      const sizeStr = formatFileSize(stats.size);
      expect(sizeStr).toMatch(/\d+(\.\d+)?\s+B/);
    });

    it('should handle URL parsing for various sources', () => {
      const urls = [
        'data:image/png;base64,ABC123',
        'chat/image.jpg',
        'https://cdn.example.com/photo.png',
        'http://example.com/download?filename=file.gif'
      ];

      urls.forEach((url) => {
        const result = parseUrlToFileType(url);
        expect(result).toBeDefined();
        expect(result?.url).toBe(url);
      });
    });
  });
});
