import { describe, it, expect } from 'vitest';
import {
  parseUrlToFileType,
  runWithContext,
  getWorkflowContext,
  updateWorkflowContextVal,
  WorkflowContext
} from '@fastgpt/service/core/workflow/utils/context';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

describe('WorkflowContext', () => {
  describe('runWithContext / getWorkflowContext', () => {
    it('should provide context inside callback', () => {
      const ctx = { queryUrlTypeMap: { 'http://a.com/f.pdf': ChatFileTypeEnum.file } };

      runWithContext(ctx, () => {
        const store = getWorkflowContext();
        expect(store).toBeDefined();
        expect(store?.queryUrlTypeMap).toEqual(ctx.queryUrlTypeMap);
      });
    });

    it('should return undefined outside of context', () => {
      expect(getWorkflowContext()).toBeUndefined();
    });

    it('should isolate nested contexts', () => {
      const outer = { queryUrlTypeMap: { a: ChatFileTypeEnum.file } };
      const inner = { queryUrlTypeMap: { b: ChatFileTypeEnum.image } };

      runWithContext(outer, () => {
        expect(getWorkflowContext()?.queryUrlTypeMap).toEqual(outer.queryUrlTypeMap);

        runWithContext(inner, () => {
          expect(getWorkflowContext()?.queryUrlTypeMap).toEqual(inner.queryUrlTypeMap);
        });

        // outer context restored
        expect(getWorkflowContext()?.queryUrlTypeMap).toEqual(outer.queryUrlTypeMap);
      });
    });

    it('should work with async functions', async () => {
      const ctx = { queryUrlTypeMap: { url1: ChatFileTypeEnum.image } };

      await new Promise<void>((resolve) => {
        runWithContext(ctx, async () => {
          await Promise.resolve();
          expect(getWorkflowContext()).toEqual(ctx);
          resolve();
        });
      });
    });
  });

  describe('updateWorkflowContextVal', () => {
    it('should update existing context values', () => {
      const ctx = { queryUrlTypeMap: { a: ChatFileTypeEnum.file } };

      runWithContext(ctx, () => {
        updateWorkflowContextVal({
          queryUrlTypeMap: { b: ChatFileTypeEnum.image }
        });

        const store = getWorkflowContext();
        expect(store?.queryUrlTypeMap).toEqual({ b: ChatFileTypeEnum.image });
      });
    });

    it('should do nothing when called outside context', () => {
      // Should not throw
      expect(() => {
        updateWorkflowContextVal({ queryUrlTypeMap: { x: ChatFileTypeEnum.file } });
      }).not.toThrow();
    });

    it('should support partial updates', () => {
      const ctx = { queryUrlTypeMap: { a: ChatFileTypeEnum.file } };

      runWithContext(ctx, () => {
        // Update with empty partial — no keys iterated
        updateWorkflowContextVal({});
        expect(getWorkflowContext()?.queryUrlTypeMap).toEqual({ a: ChatFileTypeEnum.file });
      });
    });
  });

  describe('parseUrlToFileType with context', () => {
    it('should use queryUrlTypeMap to determine file type', () => {
      const url = 'https://example.com/unknown-resource';
      const ctx = { queryUrlTypeMap: { [url]: ChatFileTypeEnum.image } };

      runWithContext(ctx, () => {
        const result = parseUrlToFileType(url);
        expect(result?.type).toBe(ChatFileTypeEnum.image);
      });
    });

    it('should prefer context type over extension-based detection', () => {
      const url = 'https://example.com/photo.png';
      const ctx = { queryUrlTypeMap: { [url]: ChatFileTypeEnum.file } };

      runWithContext(ctx, () => {
        const result = parseUrlToFileType(url);
        // Context says file, even though extension is image
        expect(result?.type).toBe(ChatFileTypeEnum.file);
      });
    });

    it('should fall back to extension detection when URL not in context', () => {
      const ctx = { queryUrlTypeMap: { 'other-url': ChatFileTypeEnum.file } };

      runWithContext(ctx, () => {
        const result = parseUrlToFileType('https://example.com/photo.png');
        expect(result?.type).toBe(ChatFileTypeEnum.image);
      });
    });
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
      const url = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
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
        name: url,
        url
      });
    });

    it('should handle URL with no filename', () => {
      const url = 'https://example.com/';
      const result = parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: url,
        url
      });
    });

    it('should handle URL with empty filename', () => {
      const url = 'https://example.com/path/';
      const result = parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: url,
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
        name: url,
        url
      });
    });

    it('should fall back when decodeURIComponent throws', () => {
      const url = 'https://example.com/download?filename=%E0%A4%A';
      const result = parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: url,
        url
      });
    });

    it('should handle URL with special characters in filename', () => {
      const url = 'https://example.com/file%20name.jpg';
      const result = parseUrlToFileType(url);

      expect(result?.type).toBe(ChatFileTypeEnum.image);
      expect(result?.name).toBe('file name.jpg');
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
        name: url,
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
