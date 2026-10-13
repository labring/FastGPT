import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  ChatFileTypeEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import type { ChatItemMiniType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { resolveAuthorizedChatFiles } from '@fastgpt/service/core/chat/fileContext';
import { PRIVATE_URL_TEXT } from '@fastgpt/service/common/system/utils';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { Readable } from 'node:stream';

const mockGetRawTextBuffer = vi.hoisted(() => vi.fn());
const mockAddRawTextBuffer = vi.hoisted(() => vi.fn());
const mockIsInternalAddress = vi.hoisted(() => vi.fn());
const mockAxiosGet = vi.hoisted(() => vi.fn());
const mockAxiosHead = vi.hoisted(() => vi.fn());
const mockReadFileContentByBuffer = vi.hoisted(() => vi.fn());
const mockReadFileContentBySource = vi.hoisted(() => vi.fn());
const mockVerifyS3DownloadAccess = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/common/s3/sources/rawText', () => ({
  getS3RawTextSource: () => ({
    getRawTextBuffer: mockGetRawTextBuffer,
    addRawTextBuffer: mockAddRawTextBuffer
  })
}));

vi.mock('@fastgpt/service/common/system/utils', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/system/utils')>();
  return {
    ...mod,
    isInternalAddress: mockIsInternalAddress
  };
});

vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/api/axios')>();
  const mockClient = {
    get: mockAxiosGet,
    head: mockAxiosHead,
    defaults: { baseURL: 'http://localhost:3000' }
  };
  return {
    ...mod,
    axios: mockClient
  };
});

vi.mock('@fastgpt/service/common/file/read/utils', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/file/read/utils')>();
  return {
    ...mod,
    readFileContentByBuffer: mockReadFileContentByBuffer,
    readFileContentBySource: mockReadFileContentBySource
  };
});

vi.mock('@fastgpt/service/common/s3/accessLink', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/s3/accessLink')>();
  return {
    ...mod,
    verifyS3DownloadAccess: mockVerifyS3DownloadAccess
  };
});

// 全局 s3 mock 把 S3ChatSource 替换成了 vi.fn()，丢失了静态方法。
// 这里用真实模块覆盖回来，让 parseChatUrl 静态方法可用。
vi.mock('@fastgpt/service/common/s3/sources/chat/index', async (importOriginal) => {
  const mod =
    await importOriginal<typeof import('@fastgpt/service/common/s3/sources/chat/index')>();
  return {
    ...mod,
    getS3ChatSource: () => ({
      createUploadChatFileURL: vi.fn(),
      deleteChatFilesByPrefix: vi.fn(),
      deleteChatFile: vi.fn()
    })
  };
});

import {
  parseFileContentFromUrls,
  normalizeReadableFileUrl,
  formatAIChatUserQueryWithFiles,
  rewriteChatMessagesWithFileContext,
  getFileContentByUrl,
  getFileInfoFromUrl,
  type FileReadContext
} from '@fastgpt/service/core/chat/fileContext';
import type {
  WorkflowFileContext,
  WorkflowFileRef
} from '@fastgpt/service/core/workflow/utils/fileContext';
import {
  createExternalHttpFileSource,
  createS3FileSource,
  resolveFileSourceEncoding,
  resolveFileSourceExtension
} from '@fastgpt/service/common/file/read/source';

const createEmptyWorkflowFileContext = (): FileReadContext => ({
  limits: { maxBytesPerFile: 1024 },
  resolve: () => undefined,
  resolveChatFile: () => undefined,
  getIdentity: () => undefined,
  getSource: vi.fn()
});

const createHumanMessage = (value: UserChatItemValueItemType[]): ChatItemMiniType => ({
  obj: ChatRoleEnum.Human,
  value
});

describe('normalizeReadableFileUrl', () => {
  it('标准化可读取的文档 URL，并过滤非文档 URL', async () => {
    expect(
      await normalizeReadableFileUrl({
        url: ' http://localhost:3000/a.pdf '
      })
    ).toBe('http://localhost:3000/a.pdf');
    expect(await normalizeReadableFileUrl({ url: '/a.pdf' })).toBe('');
    expect(await normalizeReadableFileUrl({ url: '/image.png' })).toBe('');
    expect(await normalizeReadableFileUrl({ url: 'chat/a.pdf' })).toBe('');
    expect(await normalizeReadableFileUrl({ url: '' })).toBe('');
  });

  it('非字符串 url 返回空串', async () => {
    expect(await normalizeReadableFileUrl({ url: undefined })).toBe('');
    expect(await normalizeReadableFileUrl({ url: null as unknown as string })).toBe('');
    expect(await normalizeReadableFileUrl({ url: 123 as unknown as string })).toBe('');
  });

  it('保留绝对 URL', async () => {
    expect(await normalizeReadableFileUrl({ url: 'http://example.com/a.pdf' })).toBe(
      'http://example.com/a.pdf'
    );
  });

  it('URL 解析失败时返回空串', async () => {
    // 输入校验排除无效 URL，不进入分类和读取。
    expect(await normalizeReadableFileUrl({ url: 'http://[bad-host.pdf' })).toBe('');
  });
});

describe('parseFileContentFromUrls (buffer hit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRawTextBuffer.mockImplementation(({ sourceId }: { sourceId: string }) => {
      const textMap: Record<string, string> = {
        'http://localhost:3000/a.pdf': 'Alpha',
        'https://files.example.com/b.pdf': 'Beta'
      };

      return textMap[sourceId]
        ? {
            filename: sourceId.split('/').pop(),
            text: textMap[sourceId]
          }
        : undefined;
    });
  });

  it('在读取前统一标准化 URL', async () => {
    const result = await parseFileContentFromUrls({
      urls: ['http://localhost:3000/a.pdf', 'https://files.example.com/b.pdf'],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockGetRawTextBuffer).toHaveBeenNthCalledWith(1, {
      sourceId: 'http://localhost:3000/a.pdf',
      customPdfParse: undefined
    });
    expect(mockGetRawTextBuffer).toHaveBeenNthCalledWith(2, {
      sourceId: 'https://files.example.com/b.pdf',
      customPdfParse: undefined
    });
    expect(result.map((item) => item.url)).toEqual([
      'http://localhost:3000/a.pdf',
      'https://files.example.com/b.pdf'
    ]);
    expect(result.map((item) => item.content)).toEqual(['Alpha', 'Beta']);
    expect(result.every((item) => item.success)).toBe(true);
  });

  it.each([0, 1])('空链接在读取额度 %s 裁剪之前过滤，有效链接仍按原顺序选择', async (maxFiles) => {
    const result = await parseFileContentFromUrls({
      urls: [
        '',
        ' \n\t ',
        ' http://localhost:3000/a.pdf ',
        'http://localhost:3000/a.pdf',
        'https://files.example.com/b.pdf'
      ],
      maxFiles,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(result).toEqual(
      maxFiles
        ? [{ success: true, name: 'a.pdf', url: 'http://localhost:3000/a.pdf', content: 'Alpha' }]
        : []
    );
    expect(mockGetRawTextBuffer).toHaveBeenCalledTimes(maxFiles);
    expect(mockAxiosHead).not.toHaveBeenCalled();
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('最多并发读取 5 个文件并保持结果顺序', async () => {
    const urls = Array.from({ length: 6 }, (_, index) => `https://files.example.com/${index}.pdf`);
    let releaseFirstBatch = () => {};
    const firstBatchGate = new Promise<void>((resolve) => {
      releaseFirstBatch = resolve;
    });
    let started = 0;
    let active = 0;
    let maxActive = 0;

    mockGetRawTextBuffer.mockImplementation(async ({ sourceId }: { sourceId: string }) => {
      const currentIndex = started++;
      active += 1;
      maxActive = Math.max(maxActive, active);

      if (currentIndex < 5) {
        await firstBatchGate;
      }

      active -= 1;
      return {
        filename: sourceId.split('/').pop(),
        text: sourceId
      };
    });

    const resultPromise = parseFileContentFromUrls({
      urls,
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    await vi.waitFor(() => expect(mockGetRawTextBuffer).toHaveBeenCalledTimes(5));
    expect(maxActive).toBe(5);

    releaseFirstBatch();
    const result = await resultPromise;

    expect(mockGetRawTextBuffer).toHaveBeenCalledTimes(6);
    expect(maxActive).toBe(5);
    expect(result.map((item) => item.url)).toEqual(urls);
  });

  it('内部地址即使命中 raw-text 缓存也先拒绝', async () => {
    mockIsInternalAddress.mockResolvedValue(true);
    mockGetRawTextBuffer.mockResolvedValue({
      filename: 'cached.pdf',
      text: 'cached private content'
    });

    const result = await parseFileContentFromUrls({
      urls: ['http://internal.svc/cached.pdf'],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockGetRawTextBuffer).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        success: false,
        name: '',
        url: 'http://internal.svc/cached.pdf',
        content: PRIVATE_URL_TEXT
      }
    ]);
  });

  it('不在文件域名白名单的 URL 不查询 raw-text 缓存', async () => {
    const originalSystemEnv = global.systemEnv;
    global.systemEnv = { fileUrlWhitelist: ['allowed.example.com'] } as any;
    mockIsInternalAddress.mockResolvedValue(false);
    mockGetRawTextBuffer.mockResolvedValue({
      filename: 'cached.pdf',
      text: 'cached blocked content'
    });

    try {
      const result = await parseFileContentFromUrls({
        urls: ['https://blocked.example.com/cached.pdf', 'https://allowed.example.com/cached.pdf'],
        maxFiles: 20,
        teamId: 'team-1',
        tmbId: 'tmb-1',
        fileContext: createEmptyWorkflowFileContext()
      });

      expect(mockGetRawTextBuffer).toHaveBeenCalledTimes(1);
      expect(result[1]).toMatchObject({
        success: true,
        url: 'https://allowed.example.com/cached.pdf'
      });
      expect(result[0]).toMatchObject({
        success: false,
        url: 'https://blocked.example.com/cached.pdf',
        content: 'Invalid file URL domain'
      });
    } finally {
      global.systemEnv = originalSystemEnv;
    }
  });

  it('动态工具 URL 可跳过文件域名白名单，但仍先执行内网地址检查', async () => {
    const originalSystemEnv = global.systemEnv;
    global.systemEnv = { fileUrlWhitelist: ['allowed.example.com'] } as any;
    mockGetRawTextBuffer.mockResolvedValue({
      filename: 'generated.pdf',
      text: 'generated content'
    });

    try {
      mockIsInternalAddress.mockResolvedValue(false);
      await expect(
        getFileContentByUrl({
          url: 'https://generated.example.com/result.pdf',
          teamId: 'team-1',
          tmbId: 'tmb-1',
          fileContext: createEmptyWorkflowFileContext(),
          validateExternalUrlDomain: false
        })
      ).resolves.toMatchObject({
        name: 'generated.pdf',
        content: 'generated content'
      });

      mockIsInternalAddress.mockResolvedValue(true);
      await expect(
        getFileContentByUrl({
          url: 'http://internal.svc/result.pdf',
          teamId: 'team-1',
          tmbId: 'tmb-1',
          fileContext: createEmptyWorkflowFileContext(),
          validateExternalUrlDomain: false
        })
      ).rejects.toThrow(PRIVATE_URL_TEXT);
    } finally {
      global.systemEnv = originalSystemEnv;
    }
  });
});

describe('parseFileContentFromUrls (external fetch)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 buffer 缓存未命中，强制走外部读取路径
    mockGetRawTextBuffer.mockResolvedValue(undefined);
    mockIsInternalAddress.mockResolvedValue(false);
    mockReadFileContentByBuffer.mockResolvedValue({ rawText: 'parsed text' });
    mockReadFileContentBySource.mockImplementation(async ({ source, ...props }) => {
      const materialized = await source.materialize({ signal: new AbortController().signal });
      const extension = resolveFileSourceExtension(materialized);
      const encoding = resolveFileSourceEncoding(materialized);
      const result = await mockReadFileContentByBuffer({
        ...props,
        extension,
        encoding,
        buffer: materialized.buffer
      });
      return { ...result, sourceMetadata: { ...materialized.metadata, extension, encoding } };
    });
    mockVerifyS3DownloadAccess.mockReset();
    global.s3BucketMap = {
      ...(global.s3BucketMap ?? {}),
      [S3Buckets.private]: {
        client: {
          getObjectMetadata: vi.fn().mockResolvedValue({
            contentLength: 64,
            contentType: 'application/octet-stream',
            metadata: {}
          }),
          downloadObject: vi.fn().mockResolvedValue({
            body: Readable.from([Buffer.from('short-link-file')])
          })
        }
      } as any
    };
  });

  it('reads registered private workflow files through the workflow context without axios', async () => {
    const url = 'https://files.example.com/api/system/file/d/signed';
    const ref: WorkflowFileRef = {
      name: 'private.pdf',
      type: ChatFileTypeEnum.file,
      modelUrl: url,
      source: {
        type: 'chatObject',
        objectKey: 'chat/app/app-1/user-1/chat-1/private.pdf'
      }
    };
    const getSource = vi.fn().mockResolvedValue({
      source: {
        kind: 's3',
        sizeBytes: 8,
        metadata: { filename: 'private.pdf', contentType: 'application/pdf' },
        materialize: vi.fn().mockResolvedValue({
          buffer: Buffer.from('%PDF-1.7'),
          metadata: { filename: 'private.pdf', contentType: 'application/pdf' }
        })
      },
      sourceKind: 'internal',
      imageParsePrefix: 'chat/app/app-1/user-1/chat-1/private-parsed'
    });
    const fileContext: WorkflowFileContext = {
      limits: { maxFileAmount: 20, maxBytesPerFile: 1024 },
      resolve: (value) => (value === url ? ref : undefined),
      resolveInputFile: (file) => ('url' in file && file.url === url ? ref : undefined),
      resolveChatFile: () => ({
        type: ChatFileTypeEnum.file,
        name: ref.name,
        key: ref.source.type === 'chatObject' ? ref.source.objectKey : undefined,
        url
      }),
      getIdentity: (value) => (value === url ? 'chat:private' : undefined),
      getSource,
      registerExternalFile: vi.fn(),
      derive: async () => fileContext
    };

    const result = await parseFileContentFromUrls({
      urls: [url],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1',
      fileContext
    });

    expect(getSource).toHaveBeenCalledWith(url);
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({
      success: true,
      name: 'private.pdf',
      url,
      content: 'parsed text'
    });
    expect(mockAddRawTextBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'chat:private' })
    );
  });

  it('内部地址命中时返回失败结果和 PRIVATE_URL_TEXT', async () => {
    mockIsInternalAddress.mockResolvedValue(true);

    const result = await parseFileContentFromUrls({
      urls: ['http://internal.svc/a.pdf'],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        success: false,
        name: '',
        url: 'http://internal.svc/a.pdf',
        content: PRIVATE_URL_TEXT
      }
    ]);
  });

  it('外部地址下载并使用 content-disposition 的文件名，按 charset 解码', async () => {
    mockAxiosGet.mockResolvedValue({
      data: Buffer.from('hello'),
      headers: {
        'content-disposition': 'attachment; filename="report.pdf"',
        'content-type': 'application/pdf; charset=utf-8'
      }
    });

    const result = await parseFileContentFromUrls({
      urls: ['http://example.com/raw'],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockAxiosGet).toHaveBeenCalledTimes(1);
    expect(mockReadFileContentByBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        extension: 'pdf',
        teamId: 'team-1',
        tmbId: 'tmb-1',
        encoding: 'utf-8',
        getFormatText: true,
        imageKeyOptions: expect.objectContaining({ prefix: expect.any(String) })
      })
    );
    expect(mockAddRawTextBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'http://example.com/raw',
        sourceName: 'report.pdf',
        text: 'parsed text'
      })
    );
    expect(mockIsInternalAddress.mock.invocationCallOrder[0]!).toBeLessThan(
      mockGetRawTextBuffer.mock.invocationCallOrder[0]!
    );
    expect(mockGetRawTextBuffer.mock.invocationCallOrder[0]!).toBeLessThan(
      mockAxiosGet.mock.invocationCallOrder[0]!
    );
    expect(mockAxiosGet.mock.invocationCallOrder[0]!).toBeLessThan(
      mockReadFileContentByBuffer.mock.invocationCallOrder[0]!
    );
    expect(result[0]).toMatchObject({
      success: true,
      name: 'report.pdf',
      url: 'http://example.com/raw',
      content: 'parsed text'
    });
  });

  it('外部地址无 content-disposition 时回退到 pathname 文件名，并自动检测编码', async () => {
    mockAxiosGet.mockResolvedValue({
      data: Buffer.from('plain text content'),
      headers: {
        'content-type': 'text/plain'
      }
    });

    const result = await parseFileContentFromUrls({
      urls: ['http://example.com/files/notes.txt'],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockReadFileContentByBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        extension: 'txt',
        encoding: expect.any(String)
      })
    );
    expect(result[0]).toMatchObject({
      success: true,
      name: 'notes.txt',
      url: 'http://example.com/files/notes.txt'
    });
  });

  it('外部地址无后缀但 content-type 是 text/plain 时按 txt 解析并保留原文件名', async () => {
    mockAxiosGet.mockResolvedValue({
      data: Buffer.from('MIT License\n\nPermission is hereby granted', 'utf8'),
      headers: {
        'content-type': 'text/plain; charset=utf-8'
      }
    });

    const result = await parseFileContentFromUrls({
      urls: ['https://raw.githubusercontent.com/nodejs/node/master/LICENSE'],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockReadFileContentByBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        extension: 'txt',
        encoding: 'utf-8'
      })
    );
    expect(result[0]).toMatchObject({
      success: true,
      name: 'LICENSE',
      url: 'https://raw.githubusercontent.com/nodejs/node/master/LICENSE'
    });
  });

  it('外部地址无后缀且无 content-type 但内容像文本时按 txt fallback', async () => {
    mockAxiosGet.mockResolvedValue({
      data: Buffer.from('plain text without content type', 'utf8'),
      headers: {}
    });

    await parseFileContentFromUrls({
      urls: ['http://example.com/README'],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockReadFileContentByBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        extension: 'txt'
      })
    );
  });

  it('外部地址显式不支持后缀时不使用文本 fallback 放行', async () => {
    mockAxiosGet.mockResolvedValue({
      data: Buffer.from('{"ok":true}', 'utf8'),
      headers: {
        'content-type': 'text/plain'
      }
    });

    await parseFileContentFromUrls({
      urls: ['http://example.com/config.json'],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockReadFileContentByBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        extension: 'json'
      })
    );
  });

  it('chat S3 key URL 走 S3ChatSource.parseChatUrl 解析路径', async () => {
    const chatUrl = 'http://example.com/fastgpt-private/chat/app1/u1/c1/abc123-doc.pdf';
    mockAxiosGet.mockResolvedValue({
      data: Buffer.from('chat-file'),
      headers: {}
    });

    const result = await parseFileContentFromUrls({
      urls: [chatUrl],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockReadFileContentByBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ extension: 'pdf' })
    );
    expect(result[0]).toMatchObject({
      success: true,
      name: 'abc123-doc.pdf',
      url: chatUrl
    });
  });

  it('短链解析时使用 alias 记录里的文件名推断后缀，不把短链 token 当文件名', async () => {
    const signedAlias = 'itmq831ey0kc0xmklk1rik.hp436.0rpC9RtnHmPy_CVri9pBq8';
    const shortUrl = `https://files.example.com/api/system/file/d/${signedAlias}`;
    mockVerifyS3DownloadAccess.mockResolvedValue({
      bucketName: 'fastgpt-private',
      objectKey: 'chat/app/app1/u1/c1/random-key',
      filename: 'report.pdf',
      expiresAt: new Date('2099-01-01T00:00:00.000Z')
    });
    mockAxiosGet.mockResolvedValue({
      data: Buffer.from('%PDF-1.7'),
      headers: {
        'content-type': 'application/octet-stream'
      }
    });

    const result = await parseFileContentFromUrls({
      urls: [shortUrl],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockVerifyS3DownloadAccess).toHaveBeenCalledWith(signedAlias);
    expect(mockReadFileContentByBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ extension: 'pdf' })
    );
    expect(result[0]).toMatchObject({
      success: true,
      name: 'report.pdf',
      url: shortUrl
    });
  });

  it('nginx 根路径短链解析时也使用 alias 文件名，不把签名最后一段当后缀', async () => {
    const signedAlias = 'vju2QnTFBVFMZouC.hp9bi.febMBKFxSy5_u780dAPDnI';
    const shortUrl = `http://localhost:8088/${signedAlias}`;
    mockVerifyS3DownloadAccess.mockResolvedValue({
      bucketName: 'fastgpt-private',
      objectKey: 'chat/app/app1/u1/c1/license-key',
      filename: 'LICENSE',
      responseContentType: 'text/plain',
      expiresAt: new Date('2099-01-01T00:00:00.000Z')
    });
    mockAxiosGet.mockResolvedValue({
      data: Buffer.from('MIT License\n\nPermission is hereby granted', 'utf8'),
      headers: {
        'content-type': 'application/octet-stream'
      }
    });

    const result = await parseFileContentFromUrls({
      urls: [shortUrl],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockVerifyS3DownloadAccess).toHaveBeenCalledWith(signedAlias);
    expect(mockReadFileContentByBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        extension: 'txt'
      })
    );
    expect(result[0]).toMatchObject({
      success: true,
      name: 'LICENSE',
      url: shortUrl
    });
  });

  it('短链没有 filename 时回退到 objectKey 文件名推断后缀', async () => {
    const signedAlias = 'abc123def456ghi789.hp436.abcdefghijklmnop';
    const shortUrl = `http://localhost:3000/api/system/file/d/${signedAlias}`;
    mockVerifyS3DownloadAccess.mockResolvedValue({
      bucketName: 'fastgpt-private',
      objectKey: 'chat/app/app1/u1/c1/readme.md',
      expiresAt: new Date('2099-01-01T00:00:00.000Z')
    });
    mockAxiosGet.mockResolvedValue({
      data: Buffer.from('# Readme', 'utf8'),
      headers: {}
    });

    const result = await parseFileContentFromUrls({
      urls: [shortUrl],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockReadFileContentByBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ extension: 'md' })
    );
    expect(result[0]).toMatchObject({
      success: true,
      name: 'readme.md',
      url: shortUrl
    });
  });

  it('pathname 没有最后一段时，文件名回退为 "file"', async () => {
    mockAxiosGet.mockResolvedValue({
      data: Buffer.from('payload'),
      headers: {}
    });

    const result = await parseFileContentFromUrls({
      urls: ['http://example.com/?filename=fake.pdf'],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    // pathname 是 '/'，split('/').pop() 返回 ''，最终落到 'file' 兜底
    expect(result[0]).toMatchObject({
      success: true,
      name: 'file',
      url: 'http://example.com/?filename=fake.pdf'
    });
  });

  it('axios 抛错时返回失败结果，错误信息作为 content', async () => {
    mockAxiosGet.mockRejectedValue(new Error('network down'));

    const result = await parseFileContentFromUrls({
      urls: ['http://example.com/x.pdf'],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockAddRawTextBuffer).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({
      success: false,
      name: '',
      url: 'http://example.com/x.pdf',
      content: 'network down'
    });
  });
});

/** 构造消息附件，保持名称、类型和 URL 明确，不复制生产去重或重写逻辑。 */
const attachment = (url: string, type = ChatFileTypeEnum.file): UserChatItemValueItemType => ({
  file: { url, name: url.split('/').pop()!, type }
});

describe('formatAIChatUserQueryWithFiles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('无文档或解析结果为空时保留原 query，不进行无效解析', async () => {
    const parseFileFn = vi.fn(async () => []);
    const text = [{ text: { content: '问题' } }];
    expect(await formatAIChatUserQueryWithFiles({ userQuery: text, parseFileFn })).toBe(text);
    expect(parseFileFn).not.toHaveBeenCalled();
    const query = [...text, attachment('/missing.pdf')];
    expect(await formatAIChatUserQueryWithFiles({ userQuery: query, parseFileFn })).toBe(query);
    expect(parseFileFn).toHaveBeenCalledWith(['/missing.pdf']);
  });

  it.each([false, true])(
    '按 URL 去重，保留多模态附件，文档正文只注入一次（有文档=%s）',
    async (withDocument) => {
      const media = [ChatFileTypeEnum.image, ChatFileTypeEnum.audio, ChatFileTypeEnum.video].map(
        (type) => attachment(`https://files.example.com/${type}`, type)
      );
      const documents = withDocument ? [attachment('/a.pdf'), attachment('/a.pdf')] : [];
      const parseFileFn = vi.fn(async () => [
        { url: '/a.pdf', name: 'a.pdf', sandboxPath: 'user_files/a.pdf', content: 'Alpha' }
      ]);
      const result = await formatAIChatUserQueryWithFiles({
        userQuery: [{ text: { content: '问题' } }, ...documents, ...media, ...media],
        parseFileFn
      });
      expect(result.filter((item) => item.file)).toEqual(media);
      if (withDocument) {
        expect(parseFileFn).toHaveBeenCalledExactlyOnceWith(['/a.pdf']);
        const content = result.find((item) => item.text)?.text?.content;
        for (const expected of [
          '问题',
          '<name>a.pdf</name>',
          '<url>/a.pdf</url>',
          '<sandboxPath>user_files/a.pdf</sandboxPath>',
          '<content>Alpha</content>'
        ]) {
          expect(content).toContain(expected);
        }
        expect(content?.match(/<content>Alpha<\/content>/g)).toHaveLength(1);
        expect(content).not.toContain('<id>');
      } else expect(parseFileFn).not.toHaveBeenCalled();
    }
  );

  it.each(['image/jpeg', 'application/pdf', 'error', 'missing'])(
    '短链通过授权对象元数据恢复媒体类型；%s 不误分类',
    async (outcome) => {
      const alias = 'xWqlYoPSsRIoFtHP.hpagc.bpCySSj7HPRrPtWbcAlqxd';
      if (outcome === 'error')
        mockVerifyS3DownloadAccess.mockRejectedValueOnce(new Error('expired'));
      else
        mockVerifyS3DownloadAccess.mockResolvedValueOnce(
          outcome === 'missing'
            ? undefined
            : {
                objectKey: outcome === 'image/jpeg' ? 'chat/photo.jpeg' : 'chat/report.pdf',
                responseContentType: outcome,
                filename: outcome === 'image/jpeg' ? '原图.jpeg' : 'report.pdf'
              }
        );
      const file = attachment(`https://files.example.com/api/system/file/d/${alias}`);
      file.file!.name = '';
      const parseFileFn = vi.fn(async () => []);
      const result = await formatAIChatUserQueryWithFiles({ userQuery: [file], parseFileFn });
      expect(mockVerifyS3DownloadAccess).toHaveBeenCalledWith(alias);
      if (outcome === 'image/jpeg') {
        expect(result[0].file).toMatchObject({ name: '原图.jpeg', type: ChatFileTypeEnum.image });
        expect(file.file?.type).toBe(ChatFileTypeEnum.file);
        expect(parseFileFn).not.toHaveBeenCalled();
      } else {
        expect(result[0]).toBe(file);
        expect(parseFileFn).toHaveBeenCalledWith([file.file!.url]);
      }
    }
  );
});

describe('rewriteChatMessagesWithFileContext', () => {
  it.each([false, true])(
    '历史文件开关=%s；跨消息只读取一次，结果注入各自的消息且不修改输入',
    async (parseHistoryFiles) => {
      const messages = [
        createHumanMessage([
          { text: { content: '历史问题' } },
          attachment('/a.pdf'),
          attachment('/missing.pdf')
        ]),
        { obj: ChatRoleEnum.AI, value: [{ text: { content: '回答' } }] },
        createHumanMessage([
          { text: { content: '当前问题' } },
          attachment('/a.pdf'),
          attachment('/b.pdf')
        ])
      ];
      const snapshot = structuredClone(messages);
      const parseFileFn = vi.fn(async () => [{ url: '/a.pdf', name: 'a.pdf', content: 'Alpha' }]);
      const result = await rewriteChatMessagesWithFileContext({
        messages,
        parseHistoryFiles,
        parseFileFn
      });
      expect(parseFileFn).toHaveBeenCalledExactlyOnceWith(
        parseHistoryFiles ? ['/a.pdf', '/missing.pdf', '/b.pdf'] : ['/a.pdf', '/b.pdf']
      );
      expect(result[1]).toBe(messages[1]);
      expect(result[0].value.find((item) => item.text)?.text?.content).toContain('历史问题');
      expect(result[0].value.find((item) => item.text)?.text?.content.includes('Alpha')).toBe(
        parseHistoryFiles
      );
      expect(result[0].value.some((item) => 'file' in item && item.file)).toBe(false);
      expect(result[2].value.find((item) => item.text)?.text?.content).toContain('Alpha');
      expect(messages).toEqual(snapshot);
    }
  );

  it.each([0, 1.9])('每条消息使用取整后的文件额度 %s，零额度不解析', async (maxFiles) => {
    const messages = [createHumanMessage([attachment('/a.pdf'), attachment('/b.pdf')])];
    const parseFileFn = vi.fn(async () => []);
    expect(
      await rewriteChatMessagesWithFileContext({
        messages,
        parseHistoryFiles: true,
        maxFiles,
        parseFileFn
      })
    ).toEqual(messages);
    if (maxFiles === 0) expect(parseFileFn).not.toHaveBeenCalled();
    else expect(parseFileFn).toHaveBeenCalledExactlyOnceWith(['/a.pdf']);
  });
});

describe('parseFileContentFromUrls — 探测额度', () => {
  it.each([0, 1])('only probes the first %s file candidates', async (maxFiles) => {
    mockAxiosHead.mockReset().mockResolvedValue({ headers: { 'content-type': 'image/png' } });
    const urls = Array.from({ length: 25 }, (_, i) => `https://files.example.com/opaque-${i}`);
    const result = await parseFileContentFromUrls({
      urls,
      maxFiles,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });
    expect(result).toEqual([]);
    expect(mockAxiosHead).toHaveBeenCalledTimes(maxFiles);
    if (maxFiles) expect(mockAxiosHead).toHaveBeenCalledWith(urls[0], expect.any(Object));
  });
});

describe('getFileInfoFromUrl', () => {
  let savedBuckets: typeof global.s3BucketMap;
  beforeEach(() => {
    savedBuckets = global.s3BucketMap;
    vi.clearAllMocks();
  });
  afterEach(() => {
    global.s3BucketMap = savedBuckets;
  });

  it.each(['external', 'internal'] as const)(
    '已授权 %s 来源保留文件名回退和解析前缀',
    async (sourceKind) => {
      const url = 'https://files.example.com/report.pdf';
      const fileContext = createEmptyWorkflowFileContext();
      fileContext.resolve = () => ({
        name: 'report.pdf',
        modelUrl: url,
        type: ChatFileTypeEnum.file
      });
      fileContext.getSource = async () => ({
        sourceKind,
        source:
          sourceKind === 'external'
            ? createExternalHttpFileSource({ url, maxSizeBytes: 1024, metadata: {} })
            : createS3FileSource({
                sizeBytes: 0,
                metadata: {},
                getStream: async () => Readable.from([])
              })
      });
      const result = await getFileInfoFromUrl({ url, teamId: 'team-1', fileContext });
      expect(result.filename).toBe('report.pdf');
      expect(result.isChatExternalUrl).toBe(sourceKind === 'external');
      expect(Boolean(result.imageParsePrefix)).toBe(sourceKind === 'external');
    }
  );

  it('拒绝相对路径，并容忍普通外链名称中的非法百分号编码', async () => {
    await expect(getFileInfoFromUrl({ url: '/relative.pdf', teamId: 'team-1' })).rejects.toThrow(
      'absolute HTTP(S)'
    );
    expect(
      (await getFileInfoFromUrl({ url: 'https://files.example.com/%invalid', teamId: 'team-1' }))
        .filename
    ).toBe('%invalid');
  });

  it('短链私有文件缺少 bucket、大小元数据或正文时分别失败', async () => {
    const alias = 'xWqlYoPSsRIoFtHP.hpagc.bpCySSj7HPRrPtWbcAlqxd';
    const url = `https://files.example.com/${alias}`;
    mockVerifyS3DownloadAccess.mockResolvedValue({
      bucketName: S3Buckets.private,
      objectKey: 'chat/app/app1/u1/c1/report.pdf'
    });
    global.s3BucketMap = {} as any;
    await expect(getFileInfoFromUrl({ url, teamId: 'team-1' })).rejects.toThrow('not initialized');
    const getObjectMetadata = vi.fn().mockResolvedValue({ contentLength: -1 });
    global.s3BucketMap = {
      [S3Buckets.private]: { client: { getObjectMetadata, downloadObject: async () => ({}) } }
    } as any;
    await expect(getFileInfoFromUrl({ url, teamId: 'team-1' })).rejects.toThrow('invalid metadata');
    getObjectMetadata.mockResolvedValue({ contentLength: 0 });
    const { source } = await getFileInfoFromUrl({ url, teamId: 'team-1' });
    await expect(source.materialize({ signal: new AbortController().signal })).rejects.toThrow(
      'no body'
    );
  });
});

describe('getFileContentByUrl', () => {
  it('未登记文件在命中缓存之前仍须通过协议和 Context 域名策略', async () => {
    const savedEnv = global.systemEnv;
    global.systemEnv = { ...savedEnv, fileUrlWhitelist: ['allowed.example.com'] };
    mockGetRawTextBuffer.mockClear();
    try {
      await expect(
        getFileContentByUrl({ url: '/relative.pdf', teamId: 'team-1', tmbId: 'member-1' })
      ).rejects.toThrow('absolute HTTP(S)');
      await expect(
        getFileContentByUrl({
          url: 'https://blocked.example.com/a.pdf',
          teamId: 'team-1',
          tmbId: 'member-1',
          fileContext: createEmptyWorkflowFileContext()
        })
      ).rejects.toThrow('Invalid file URL domain');
      expect(mockGetRawTextBuffer).not.toHaveBeenCalled();
    } finally {
      global.systemEnv = savedEnv;
    }
  });
});

describe('resolveAuthorizedChatFiles', () => {
  const scope = {
    sourceType: ChatSourceTypeEnum.workflowBuilder,
    sourceId: 'app-1',
    uid: 'member-1',
    chatId: 'chat-1'
  };
  const key = 'chat/workflowBuilder/app-1/member-1/chat-1/requirements.md';

  it('validates the S3 key scope and replaces the client URL with a trusted preview URL', async () => {
    const getPreviewUrl = vi.fn(async () => 'https://trusted.test/requirements.md');

    await expect(
      resolveAuthorizedChatFiles({
        files: [
          {
            type: ChatFileTypeEnum.file,
            name: 'requirements.md',
            key,
            url: 'https://untrusted.test/requirements.md'
          }
        ],
        ...scope,
        getPreviewUrl
      })
    ).resolves.toEqual([
      {
        type: ChatFileTypeEnum.file,
        name: 'requirements.md',
        key,
        url: 'https://trusted.test/requirements.md'
      }
    ]);
    expect(getPreviewUrl).toHaveBeenCalledWith(key);
  });

  it.each([
    ['missing key', undefined, scope],
    ['wrong source', key, { ...scope, sourceType: ChatSourceTypeEnum.chatAgentHelper }],
    ['wrong source id', key, { ...scope, sourceId: 'app-2' }],
    ['wrong member', key, { ...scope, uid: 'member-2' }],
    ['wrong chat', key, { ...scope, chatId: 'chat-2' }]
  ])('rejects %s before signing the file URL', async (_name, fileKey, invalidScope) => {
    const getPreviewUrl = vi.fn();

    await expect(
      resolveAuthorizedChatFiles({
        files: [{ key: fileKey, url: 'https://untrusted.test/file' }],
        ...invalidScope,
        getPreviewUrl
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
    expect(getPreviewUrl).not.toHaveBeenCalled();
  });

  it('returns an empty list without creating preview URLs', async () => {
    const getPreviewUrl = vi.fn();

    await expect(
      resolveAuthorizedChatFiles({ files: [], ...scope, getPreviewUrl })
    ).resolves.toEqual([]);
    expect(getPreviewUrl).not.toHaveBeenCalled();
  });
});
