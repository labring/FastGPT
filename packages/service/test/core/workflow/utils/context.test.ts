import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  parseUrlToFileType,
  runWithContext,
  getWorkflowContext,
  updateWorkflowContextVal
} from '../../../../core/workflow/utils/context';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

const createWorkflowContext = () => ({
  mcpClientMemory: {}
});

describe('WorkflowContext', () => {
  describe('runWithContext / getWorkflowContext', () => {
    it('should provide context inside callback', async () => {
      const ctx = createWorkflowContext();

      runWithContext(ctx, () => {
        const store = getWorkflowContext();
        expect(store).toBe(ctx);
      });
    });

    it('should return undefined outside of context', async () => {
      expect(getWorkflowContext()).toBeUndefined();
    });

    it('should isolate nested contexts', async () => {
      const outer = createWorkflowContext();
      const inner = createWorkflowContext();

      runWithContext(outer, () => {
        expect(getWorkflowContext()).toBe(outer);

        runWithContext(inner, () => {
          expect(getWorkflowContext()).toBe(inner);
        });

        // outer context restored
        expect(getWorkflowContext()).toBe(outer);
      });
    });

    it('should work with async functions', async () => {
      const ctx = createWorkflowContext();

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
    it('should update existing context values', async () => {
      const ctx = createWorkflowContext();
      const mcpClientMemory = {};

      runWithContext(ctx, () => {
        updateWorkflowContextVal({ mcpClientMemory });

        const store = getWorkflowContext();
        expect(store?.mcpClientMemory).toBe(mcpClientMemory);
      });
    });

    it('should do nothing when called outside context', async () => {
      // Should not throw
      expect(() => {
        updateWorkflowContextVal({});
      }).not.toThrow();
    });

    it('should support partial updates', async () => {
      const ctx = createWorkflowContext();

      runWithContext(ctx, () => {
        // Update with empty partial — no keys iterated
        updateWorkflowContextVal({});
        expect(getWorkflowContext()).toBe(ctx);
      });
    });
  });
});

describe('parseUrlToFileType', () => {
  describe('base64 images', () => {
    it('should parse base64 PNG image', async () => {
      const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'image.png',
        url
      });
    });

    it('should parse base64 JPEG image', async () => {
      const url = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'image.jpeg',
        url
      });
    });

    it('should parse base64 GIF image', async () => {
      const url = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'image.gif',
        url
      });
    });

    it('should parse base64 WebP image', async () => {
      const url =
        'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'image.webp',
        url
      });
    });

    it('should handle base64 with uppercase MIME type', async () => {
      const url = 'data:IMAGE/PNG;base64,ABC123';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'image.png',
        url
      });
    });

    it('should return undefined for non-image base64', async () => {
      const url = 'data:application/pdf;base64,JVBERi0xLjQK';
      const result = await parseUrlToFileType(url);

      expect(result).toBeUndefined();
    });

    it('should return undefined for malformed base64 data URL', async () => {
      const url = 'data:invalid';
      const result = await parseUrlToFileType(url);

      expect(result).toBeUndefined();
    });
  });

  describe('S3 Object Key URLs', () => {
    it('should parse S3 chat image URL', async () => {
      const url = 'chat/image.png';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'image.png',
        url
      });
    });

    it('should parse S3 chat file URL', async () => {
      const url = 'chat/document.pdf';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: 'document.pdf',
        url
      });
    });

    it('should parse S3 nested path', async () => {
      const url = 'chat/subfolder/image.jpg';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'image.jpg',
        url
      });
    });
  });

  describe('HTTP/HTTPS URLs', () => {
    it('should parse HTTP image URL with extension', async () => {
      const url = 'http://example.com/images/photo.jpg';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'photo.jpg',
        url
      });
    });

    it('should parse HTTPS image URL with extension', async () => {
      const url = 'https://cdn.example.com/image.png';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'image.png',
        url
      });
    });

    it('should parse URL with filename query parameter', async () => {
      const url = 'https://example.com/download?filename=photo.jpg&token=abc';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'photo.jpg',
        url
      });
    });

    it('should parse URL without extension as file', async () => {
      const url = 'https://example.com/download/file';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: url,
        url
      });
    });

    it('should detect image type for extensionless URL via axios.head', async () => {
      const url = 'https://example.com/avatar/user123';
      const axiosModule = await import('../../../../common/api/axios');
      const headSpy = vi.spyOn(axiosModule.axios, 'head').mockResolvedValueOnce({
        headers: { 'content-type': 'image/png' }
      } as any);

      const result = await parseUrlToFileType(url);

      expect(headSpy).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          timeout: 3000,
          __safeAxios: { validateUrl: expect.any(Function) }
        })
      );
      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: url,
        url
      });
      headSpy.mockRestore();
    });

    it('should fall back to file when axios.head fails or times out', async () => {
      const url = 'https://example.com/dynamic/unknown';
      const axiosModule = await import('../../../../common/api/axios');
      const headSpy = vi
        .spyOn(axiosModule.axios, 'head')
        .mockRejectedValueOnce(new Error('timeout'));

      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: url,
        url
      });
      headSpy.mockRestore();
    });

    it('should handle URL with no filename', async () => {
      const url = 'https://example.com/';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: url,
        url
      });
    });

    it('should handle URL with empty filename', async () => {
      const url = 'https://example.com/path/';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: url,
        url
      });
    });

    it('should parse document file URL', async () => {
      const url = 'https://example.com/document.pdf';
      const result = await parseUrlToFileType(url);

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
      it(`should detect .${ext} as image type`, async () => {
        const url = `https://example.com/file.${ext}`;
        const result = await parseUrlToFileType(url);

        expect(result?.type).toBe(ChatFileTypeEnum.image);
        expect(result?.name).toBe(`file.${ext}`);
      });

      it(`should detect .${ext.toUpperCase()} as image type (case insensitive)`, async () => {
        const url = `https://example.com/file.${ext.toUpperCase()}`;
        const result = await parseUrlToFileType(url);

        expect(result?.type).toBe(ChatFileTypeEnum.image);
      });
    });
  });

  describe('edge cases', () => {
    it('should return undefined for non-string input', async () => {
      // @ts-expect-error testing runtime behavior
      const result = await parseUrlToFileType(123);

      expect(result).toBeUndefined();
    });

    it('should return undefined for null', async () => {
      // @ts-expect-error testing runtime behavior
      const result = await parseUrlToFileType(null);

      expect(result).toBeUndefined();
    });

    it('should return undefined for undefined', async () => {
      // @ts-expect-error testing runtime behavior
      const result = await parseUrlToFileType(undefined);

      expect(result).toBeUndefined();
    });

    it('should handle malformed URL', async () => {
      const url = 'not-a-valid-url';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: url,
        url
      });
    });

    it('should fall back when decodeURIComponent throws', async () => {
      const url = 'https://example.com/download?filename=%E0%A4%A';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: url,
        url
      });
    });

    it('should handle URL with special characters in filename', async () => {
      const url = 'https://example.com/file%20name.jpg';
      const result = await parseUrlToFileType(url);

      expect(result?.type).toBe(ChatFileTypeEnum.image);
      expect(result?.name).toBe('file name.jpg');
    });

    it('should detect audio URL by extension', async () => {
      const url = 'https://example.com/chat-audio.mp3';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.audio,
        name: 'chat-audio.mp3',
        url
      });
    });

    it('should detect video URL by extension', async () => {
      const url = 'https://example.com/chat-video.mp4';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.video,
        name: 'chat-video.mp4',
        url
      });
    });

    it('should handle URL with multiple dots in filename', async () => {
      const url = 'https://example.com/my.file.name.png';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'my.file.name.png',
        url
      });
    });

    it('should handle URL with query parameters and hash', async () => {
      const url = 'https://example.com/image.jpg?size=large&quality=high#section';
      const result = await parseUrlToFileType(url);

      expect(result?.type).toBe(ChatFileTypeEnum.image);
      expect(result?.name).toBe('image.jpg');
    });

    it('should handle relative URL paths', async () => {
      const url = '/static/images/logo.png';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'logo.png',
        url
      });
    });

    it('should handle filename with no extension', async () => {
      const url = 'https://example.com/download/myfile';
      const result = await parseUrlToFileType(url);

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: url,
        url
      });
    });
  });

  describe('filename extraction priority', () => {
    it('should prefer filename query parameter over pathname', async () => {
      const url = 'https://example.com/download/abc123?filename=document.pdf';
      const result = await parseUrlToFileType(url);

      expect(result?.name).toBe('document.pdf');
    });

    it('should use pathname when filename parameter is missing', async () => {
      const url = 'https://example.com/files/report.xlsx';
      const result = await parseUrlToFileType(url);

      expect(result?.name).toBe('report.xlsx');
    });

    it('should handle empty filename parameter', async () => {
      const url = 'https://example.com/download?filename=';
      const result = await parseUrlToFileType(url);

      // Empty filename parameter should fall back to pathname
      expect(result?.name).toBeDefined();
    });
  });
  it('should handle URL parsing for various sources', async () => {
    const urls = [
      'data:image/png;base64,ABC123',
      'chat/image.jpg',
      'https://cdn.example.com/photo.png',
      'http://example.com/download?filename=file.gif'
    ];

    for (const url of urls) {
      const result = await parseUrlToFileType(url);
      expect(result).toBeDefined();
      expect(result?.url).toBe(url);
    }
  });
});

// 分类测试隔离外部服务，避免无后缀样例发出真实网络请求。
beforeEach(async () => {
  const { axios } = await import('@fastgpt/service/common/api/axios');
  vi.spyOn(axios, 'head').mockResolvedValue({
    headers: { 'content-type': 'application/octet-stream' }
  } as any);
});
afterEach(() => vi.restoreAllMocks());
