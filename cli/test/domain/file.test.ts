import { describe, expect, it, vi } from 'vitest';
import { createFileService } from '../../src/domain/file/file-service';
import type { FastGptHttpClient } from '../../src/infra/http/fastgpt-http-client';

const SAMPLE_PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function createMockHttpClient({
  requestHandler,
  putPresignedUrlHandler
}: {
  requestHandler?: (params: any) => Promise<any>;
  putPresignedUrlHandler?: (params: any) => Promise<void>;
}): FastGptHttpClient {
  return {
    baseUrl: 'https://cloud.fastgpt.cn/api',
    request: vi.fn(requestHandler ?? (async () => ({}))),
    requestRaw: vi.fn(),
    uploadMultipart: vi.fn(),
    uploadBinary: vi.fn(),
    putPresignedUrl: vi.fn(putPresignedUrlHandler ?? (async () => undefined)),
    streamSse: vi.fn()
  };
}

describe('FileService (cli/src/domain/file/file-service.ts)', () => {
  const service = createFileService();

  it('validates extension and file size locally before presigning', async () => {
    const client = createMockHttpClient({});

    await expect(
      service.uploadAvatar({
        client,
        file: {
          filename: 'icon.svg',
          size: 100,
          mimeType: 'image/svg+xml',
          data: new Uint8Array([1, 2, 3])
        }
      })
    ).rejects.toMatchObject({
      code: 'CLI_ARGUMENT_INVALID',
      hint: expect.stringContaining('.jpg, .jpeg, or .png')
    });

    await expect(
      service.uploadAvatar({
        client,
        file: {
          filename: 'empty.png',
          size: 0,
          mimeType: 'image/png',
          data: new Uint8Array([])
        }
      })
    ).rejects.toThrow('cannot be empty');

    await expect(
      service.uploadAvatar({
        client,
        file: {
          filename: 'huge.png',
          size: 5 * 1024 * 1024 + 1,
          mimeType: 'image/png',
          data: SAMPLE_PNG
        }
      })
    ).rejects.toThrow('exceeds the 5 MB limit');

    expect(client.request).not.toHaveBeenCalled();
  });

  it('supports dry-run preview and uploads via presignAvatarPostUrl + putPresignedUrl', async () => {
    let putCall: any;
    const client = createMockHttpClient({
      requestHandler: async ({ method, path, body }) => {
        expect(method).toBe('POST');
        expect(path).toBe('/common/file/presignAvatarPostUrl');
        expect(body).toEqual({
          filename: 'bot-icon.png',
          size: SAMPLE_PNG.byteLength,
          autoExpired: true
        });
        return {
          url: 'https://cloud.fastgpt.cn/api/system/file/u/token-123',
          key: 'avatar/team-1/file/abc123.png',
          headers: { 'content-type': 'image/png' },
          previewUrl: 'https://cloud.fastgpt.cn/api/system/file/d/preview.png',
          maxSize: 5242880,
          uploadMode: 'single'
        };
      },
      putPresignedUrlHandler: async (params) => {
        putCall = params;
      }
    });

    const dry = await service.uploadAvatar({
      client,
      file: {
        filename: 'bot-icon.png',
        size: SAMPLE_PNG.byteLength,
        mimeType: 'image/png',
        data: SAMPLE_PNG
      },
      dryRun: true
    });
    expect(dry.changed).toBe(false);
    expect(dry.data).toMatchObject({
      dryRun: true,
      risk: 'write',
      path: '/common/file/presignAvatarPostUrl',
      payload: { filename: 'bot-icon.png', size: SAMPLE_PNG.byteLength, autoExpired: true }
    });
    expect(client.request).not.toHaveBeenCalled();

    const uploaded = await service.uploadAvatar({
      client,
      file: {
        filename: 'bot-icon.png',
        size: SAMPLE_PNG.byteLength,
        mimeType: 'image/png',
        data: SAMPLE_PNG
      }
    });
    expect(uploaded.changed).toBe(true);
    expect(uploaded.data).toEqual({
      avatar: '/api/system/img/avatar/team-1/file/abc123.png',
      key: 'avatar/team-1/file/abc123.png',
      previewUrl: 'https://cloud.fastgpt.cn/api/system/file/d/preview.png',
      filename: 'bot-icon.png',
      sizeBytes: SAMPLE_PNG.byteLength,
      autoExpired: true
    });
    expect(putCall).toEqual({
      url: 'https://cloud.fastgpt.cn/api/system/file/u/token-123',
      body: SAMPLE_PNG,
      headers: { 'content-type': 'image/png' }
    });
  });

  it('defaults legacy presign responses without uploadMode to single PUT', async () => {
    const client = createMockHttpClient({
      requestHandler: async () => ({
        url: '/api/system/file/u/legacy-token',
        key: 'avatar/team-1/file/legacy.jpg',
        headers: { 'content-type': 'image/jpeg' },
        previewUrl: 'https://cloud.fastgpt.cn/api/system/file/d/legacy.jpg'
      })
    });

    const res = await service.uploadAvatar({
      client,
      file: {
        filename: 'legacy.jpg',
        size: SAMPLE_PNG.byteLength,
        mimeType: 'image/jpeg',
        data: SAMPLE_PNG
      },
      autoExpired: false
    });
    expect(res.changed).toBe(true);
    expect(res.data).toMatchObject({
      avatar: '/api/system/img/avatar/team-1/file/legacy.jpg',
      autoExpired: false
    });
    expect(client.putPresignedUrl).toHaveBeenCalledOnce();
  });
});
