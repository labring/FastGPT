import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  parseUrlToChatFileType,
  prepareChatFiles,
  validateChatFileInput
} from '@fastgpt/service/core/chat/file/service';
describe('parseUrlToChatFileType', () => {
  describe('base64 images', () => {
    it('should parse base64 PNG image', async () => {
      const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'image.png',
        url
      });
    });

    it('should parse base64 JPEG image', async () => {
      const url = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'image.jpeg',
        url
      });
    });

    it('should parse base64 GIF image', async () => {
      const url = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'image.gif',
        url
      });
    });

    it('should parse base64 WebP image', async () => {
      const url =
        'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'image.webp',
        url
      });
    });

    it('should handle base64 with uppercase MIME type', async () => {
      const url = 'data:IMAGE/PNG;base64,ABC123';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'image.png',
        url
      });
    });

    it('should return undefined for non-image base64', async () => {
      const url = 'data:application/pdf;base64,JVBERi0xLjQK';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toBeUndefined();
    });

    it('should return undefined for malformed base64 data URL', async () => {
      const url = 'data:invalid';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toBeUndefined();
    });
  });

  describe('S3 Object Key URLs', () => {
    it('should parse S3 chat image URL', async () => {
      const url = 'chat/image.png';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'image.png',
        url
      });
    });

    it('should parse S3 chat file URL', async () => {
      const url = 'chat/document.pdf';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: 'document.pdf',
        url
      });
    });

    it('should parse S3 nested path', async () => {
      const url = 'chat/subfolder/image.jpg';
      const result = await parseUrlToChatFileType({ url: url });

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
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'photo.jpg',
        url
      });
    });

    it('should parse HTTPS image URL with extension', async () => {
      const url = 'https://cdn.example.com/image.png';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'image.png',
        url
      });
    });

    it('should parse URL with filename query parameter', async () => {
      const url = 'https://example.com/download?filename=photo.jpg&token=abc';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'photo.jpg',
        url
      });
    });

    it('should parse URL without extension as file', async () => {
      const url = 'https://example.com/download/file';
      const result = await parseUrlToChatFileType({ url: url });

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

      const result = await parseUrlToChatFileType({ url: url });

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

      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: url,
        url
      });
      headSpy.mockRestore();
    });

    it('should handle URL with no filename', async () => {
      const url = 'https://example.com/';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: url,
        url
      });
    });

    it('should handle URL with empty filename', async () => {
      const url = 'https://example.com/path/';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: url,
        url
      });
    });

    it('should parse document file URL', async () => {
      const url = 'https://example.com/document.pdf';
      const result = await parseUrlToChatFileType({ url: url });

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
        const result = await parseUrlToChatFileType({ url: url });

        expect(result?.type).toBe(ChatFileTypeEnum.image);
        expect(result?.name).toBe(`file.${ext}`);
      });

      it(`should detect .${ext.toUpperCase()} as image type (case insensitive)`, async () => {
        const url = `https://example.com/file.${ext.toUpperCase()}`;
        const result = await parseUrlToChatFileType({ url: url });

        expect(result?.type).toBe(ChatFileTypeEnum.image);
      });
    });
  });

  describe('edge cases', () => {
    it('should return undefined for non-string input', async () => {
      // @ts-expect-error testing runtime behavior
      const result = await parseUrlToChatFileType({ url: 123 });

      expect(result).toBeUndefined();
    });

    it('should return undefined for null', async () => {
      // @ts-expect-error testing runtime behavior
      const result = await parseUrlToChatFileType({ url: null });

      expect(result).toBeUndefined();
    });

    it('should return undefined for undefined', async () => {
      // @ts-expect-error testing runtime behavior
      const result = await parseUrlToChatFileType({ url: undefined });

      expect(result).toBeUndefined();
    });

    it('should handle malformed URL', async () => {
      const url = 'not-a-valid-url';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: url,
        url
      });
    });

    it('should fall back when decodeURIComponent throws', async () => {
      const url = 'https://example.com/download?filename=%E0%A4%A';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.file,
        name: url,
        url
      });
    });

    it('should handle URL with special characters in filename', async () => {
      const url = 'https://example.com/file%20name.jpg';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result?.type).toBe(ChatFileTypeEnum.image);
      expect(result?.name).toBe('file name.jpg');
    });

    it('should detect audio URL by extension', async () => {
      const url = 'https://example.com/chat-audio.mp3';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.audio,
        name: 'chat-audio.mp3',
        url
      });
    });

    it('should detect video URL by extension', async () => {
      const url = 'https://example.com/chat-video.mp4';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.video,
        name: 'chat-video.mp4',
        url
      });
    });

    it('should handle URL with multiple dots in filename', async () => {
      const url = 'https://example.com/my.file.name.png';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'my.file.name.png',
        url
      });
    });

    it('should handle URL with query parameters and hash', async () => {
      const url = 'https://example.com/image.jpg?size=large&quality=high#section';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result?.type).toBe(ChatFileTypeEnum.image);
      expect(result?.name).toBe('image.jpg');
    });

    it('should handle relative URL paths', async () => {
      const url = '/static/images/logo.png';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result).toEqual({
        type: ChatFileTypeEnum.image,
        name: 'logo.png',
        url
      });
    });

    it('should handle filename with no extension', async () => {
      const url = 'https://example.com/download/myfile';
      const result = await parseUrlToChatFileType({ url: url });

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
      const result = await parseUrlToChatFileType({ url: url });

      expect(result?.name).toBe('document.pdf');
    });

    it('should use pathname when filename parameter is missing', async () => {
      const url = 'https://example.com/files/report.xlsx';
      const result = await parseUrlToChatFileType({ url: url });

      expect(result?.name).toBe('report.xlsx');
    });

    it('should handle empty filename parameter', async () => {
      const url = 'https://example.com/download?filename=';
      const result = await parseUrlToChatFileType({ url: url });

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
      const result = await parseUrlToChatFileType({ url: url });
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

describe('Context classification and preparation boundaries', () => {
  const createContext = () => {
    const files = new Map<
      string,
      import('@fastgpt/global/core/chat/type').UserChatItemFileItemType
    >();
    const context = {
      resolveChatFile: (url: string) => files.get(url),
      getIdentity: (url: string) => (files.has(url) ? `registered:${url}` : undefined),
      registerExternalFile: vi.fn(
        (file: import('@fastgpt/global/core/chat/type').UserChatItemFileItemType) => {
          files.set(file.url, file);
          return { name: file.name || 'file', type: file.type, modelUrl: file.url };
        }
      )
    };
    return { context, files };
  };

  it('classifies without registering, then respects registered metadata over conflicting hints', async () => {
    const { context, files } = createContext();
    const url = 'https://files.example.com/opaque';
    await parseUrlToChatFileType({ url, fileContext: context });
    expect(files.size).toBe(0);
    expect(context.registerExternalFile).not.toHaveBeenCalled();
    const authoritative = { name: 'photo', type: ChatFileTypeEnum.image, url };
    files.set(url, authoritative);
    expect(
      await parseUrlToChatFileType({ url, type: ChatFileTypeEnum.video, fileContext: context })
    ).toBe(authoritative);
    expect(
      await prepareChatFiles({
        files: [{ url, type: ChatFileTypeEnum.audio }],
        maxFiles: 1,
        fileContext: context
      })
    ).toEqual([authoritative]);
  });

  it('shares HEAD including fallback but does not cache caller names or explicit type hints', async () => {
    const { axios } = await import('@fastgpt/service/common/api/axios');
    vi.mocked(axios.head).mockRejectedValue(new Error('timeout'));
    const { context } = createContext();
    const url = 'https://files.example.com/opaque';
    const [first, second] = await Promise.all([
      parseUrlToChatFileType({ url, name: 'first', fileContext: context }),
      parseUrlToChatFileType({ url: `${url}#section`, name: 'second', fileContext: context })
    ]);
    expect(first).toMatchObject({ name: 'first', type: ChatFileTypeEnum.file, url });
    expect(second).toMatchObject({
      name: 'second',
      type: ChatFileTypeEnum.file,
      url: `${url}#section`
    });
    expect(
      await parseUrlToChatFileType({ url, type: ChatFileTypeEnum.audio, fileContext: context })
    ).toMatchObject({ type: ChatFileTypeEnum.audio });
    expect(axios.head).toHaveBeenCalledTimes(1);
    await parseUrlToChatFileType({ url, fileContext: createContext().context });
    expect(axios.head).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['IMAGE/PNG; charset=utf-8', ChatFileTypeEnum.image],
    ['audio/mpeg', ChatFileTypeEnum.audio],
    ['video/mp4', ChatFileTypeEnum.video],
    ['application/pdf', ChatFileTypeEnum.file],
    [undefined, ChatFileTypeEnum.file]
  ])('classifies HEAD content type %s', async (mime, expected) => {
    const { axios } = await import('@fastgpt/service/common/api/axios');
    vi.mocked(axios.head).mockResolvedValue({ headers: { 'content-type': mime } });
    const url = 'https://files.example.com/opaque';
    expect((await parseUrlToChatFileType({ url }))?.type).toBe(expected);
    expect(axios.head).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        timeout: 3000,
        __safeAxios: { validateUrl: expect.any(Function) }
      })
    );
  });

  it.each([
    [{ filename: 'cover.jpg', contentType: 'audio/mpeg' }, ChatFileTypeEnum.audio],
    [{ filename: 'cover.jpg' }, ChatFileTypeEnum.image],
    [{ filename: 'download', contentType: 'application/octet-stream' }, ChatFileTypeEnum.video]
  ])('classifies verified object metadata with the same rules: %j', async (metadata, expected) => {
    const { axios } = await import('@fastgpt/service/common/api/axios');
    expect((await parseUrlToChatFileType({ url: 'chat/object.mp4', metadata }))?.type).toBe(
      expected
    );
    expect(axios.head).not.toHaveBeenCalled();
  });

  it('limits concurrent HEAD across independent batches sharing a Context', async () => {
    const { axios } = await import('@fastgpt/service/common/api/axios');
    const { context } = createContext();
    let active = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    vi.mocked(axios.head).mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return { headers: { 'content-type': 'image/png' } };
    });
    const pending = Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        prepareChatFiles({
          files: [{ url: `https://files.example.com/${index}` }],
          maxFiles: 1,
          fileContext: context
        })
      )
    );
    await vi.waitFor(() => expect(releases).toHaveLength(5));
    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(releases).toHaveLength(5));
    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0).forEach((release) => release());
    const result = await pending;
    expect(peak).toBe(5);
    expect(result.map(([file]) => file.url)).toEqual(
      Array.from({ length: 12 }, (_, index) => `https://files.example.com/${index}`)
    );
  });

  it('deduplicates aliases and truncates before validating or probing excess inputs', async () => {
    const { axios } = await import('@fastgpt/service/common/api/axios');
    const { context } = createContext();
    const savedEnv = global.systemEnv;
    global.systemEnv = { ...savedEnv, fileUrlWhitelist: ['files.example.com'] };
    try {
      const result = await prepareChatFiles({
        files: [
          { url: ' https://files.example.com/opaque#first ' },
          { url: 'https://files.example.com/opaque#second' },
          { url: 'https://files.example.com/other' },
          { url: 'https://blocked.example.com/excess' }
        ],
        maxFiles: 2,
        fileContext: context
      });
      expect(result.map((file) => file.url)).toEqual([
        'https://files.example.com/opaque#first',
        'https://files.example.com/other'
      ]);
      expect(axios.head).toHaveBeenCalledTimes(2);
      expect(context.registerExternalFile).toHaveBeenCalledTimes(2);
      await expect(
        prepareChatFiles({
          files: [{ url: 'https://blocked.example.com/rejected' }],
          maxFiles: 1,
          fileContext: context
        })
      ).rejects.toThrow('Invalid file URL domain');
      expect(axios.head).toHaveBeenCalledTimes(2);
      expect(context.registerExternalFile).toHaveBeenCalledTimes(2);
    } finally {
      global.systemEnv = savedEnv;
    }
  });

  it('keeps Data URL acceptance in validation and excludes unsupported data from preparation', async () => {
    const { axios } = await import('@fastgpt/service/common/api/axios');
    const image = 'data:image/png;base64,abc';
    expect(validateChatFileInput({ url: image })).toBe(false);
    expect(validateChatFileInput({ url: image, allowDataUrl: true })).toBe(true);
    expect(
      await prepareChatFiles({
        files: [{ url: image }, { url: 'data:text/plain;base64,abc' }],
        maxFiles: 2,
        allowDataUrl: true
      })
    ).toEqual([{ url: image, name: 'image.png', type: ChatFileTypeEnum.image }]);
    expect(
      await prepareChatFiles({
        files: [{ url: '/relative.pdf' }, { url: '' }, { url: 123 as any }],
        maxFiles: 10
      })
    ).toEqual([]);
    expect(axios.head).not.toHaveBeenCalled();
  });

  it('accepts registered signed domains while refusing to probe unregistered blocked URLs', async () => {
    const { axios } = await import('@fastgpt/service/common/api/axios');
    const { context, files } = createContext();
    const savedEnv = global.systemEnv;
    global.systemEnv = { ...savedEnv, fileUrlWhitelist: ['allowed.example.com'] };
    const url = 'https://signed.example.com/private';
    files.set(url, { url, type: ChatFileTypeEnum.file, name: 'report.pdf' });
    try {
      expect(validateChatFileInput({ url, fileContext: context })).toBe(true);
      expect(
        (
          await parseUrlToChatFileType({
            url: 'https://blocked.example.com/opaque',
            fileContext: context
          })
        )?.type
      ).toBe(ChatFileTypeEnum.file);
      expect(axios.head).not.toHaveBeenCalled();
    } finally {
      global.systemEnv = savedEnv;
    }
  });
});
