import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { PRIVATE_URL_TEXT } from '@fastgpt/service/common/system/utils';

const mockGetRawTextBuffer = vi.hoisted(() => vi.fn());
const mockAddRawTextBuffer = vi.hoisted(() => vi.fn());
const mockIsInternalAddress = vi.hoisted(() => vi.fn());
const mockAxiosGet = vi.hoisted(() => vi.fn());
const mockReadFileContentByBuffer = vi.hoisted(() => vi.fn());
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
    defaults: { baseURL: 'http://localhost:3000' }
  };
  return {
    ...mod,
    axios: mockClient
  };
});

vi.mock('axios', () => {
  const internalClient = {
    get: mockAxiosGet,
    defaults: { baseURL: 'http://localhost:3000' }
  };
  return {
    default: {
      get: mockAxiosGet,
      create: vi.fn(() => internalClient)
    }
  };
});

vi.mock('@fastgpt/service/common/file/read/utils', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/file/read/utils')>();
  return {
    ...mod,
    readFileContentByBuffer: mockReadFileContentByBuffer
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
  parseFileInfoFromUrls,
  normalizeReadableFileUrl,
  formatUserQueryWithFiles
} from '@fastgpt/service/core/chat/fileContext';
import type {
  WorkflowFileContext,
  WorkflowFileRef
} from '@fastgpt/service/core/workflow/utils/fileContext';

const createEmptyWorkflowFileContext = (): WorkflowFileContext => ({
  limits: { maxFiles: 20, maxBytesPerFile: 1024 },
  resolve: () => undefined,
  resolveChatFile: () => undefined,
  getIdentity: () => undefined,
  read: vi.fn()
});

const createHumanMessage = (value: UserChatItemValueItemType[]): ChatItemMiniType => ({
  obj: ChatRoleEnum.Human,
  value
});

const createMockParseFileFn = ({ maxFiles = 20 }: { maxFiles?: number } = {}) =>
  vi.fn(async (urls: string[]) => {
    const files = await Promise.all(
      urls.slice(0, maxFiles).map(async (url) => {
        const rawTextBuffer = await mockGetRawTextBuffer({
          sourceId: url,
          customPdfParse: undefined
        });

        return rawTextBuffer
          ? {
              name: rawTextBuffer.filename,
              url,
              content: rawTextBuffer.text
            }
          : undefined;
      })
    );

    return files.filter(Boolean) as { name: string; url: string; content: string }[];
  });

const rewriteMessagesWithFileContent = async ({
  messages,
  maxFiles = 20
}: {
  messages: ChatItemMiniType[];
  maxFiles?: number;
}) =>
  Promise.all(
    messages.map(async (message): Promise<ChatItemMiniType> => {
      if (message.obj !== ChatRoleEnum.Human) {
        return message;
      }

      return {
        ...message,
        value: await formatUserQueryWithFiles({
          userQuery: message.value,
          parseFileFn: createMockParseFileFn({ maxFiles })
        })
      };
    })
  );

describe('normalizeReadableFileUrl', () => {
  it('标准化可读取的文档 URL，并过滤非文档 URL', () => {
    expect(
      normalizeReadableFileUrl({
        url: ' http://localhost:3000/a.pdf ',
        requestOrigin: 'http://localhost:3000'
      })
    ).toBe('http://localhost:3000/a.pdf');
    expect(normalizeReadableFileUrl({ url: '/a.pdf' })).toBe('');
    expect(normalizeReadableFileUrl({ url: '/image.png' })).toBe('');
    expect(normalizeReadableFileUrl({ url: 'chat/a.pdf' })).toBe('');
    expect(normalizeReadableFileUrl({ url: '' })).toBe('');
  });

  it('非字符串 url 返回空串', () => {
    expect(normalizeReadableFileUrl({ url: undefined })).toBe('');
    expect(normalizeReadableFileUrl({ url: null as unknown as string })).toBe('');
    expect(normalizeReadableFileUrl({ url: 123 as unknown as string })).toBe('');
  });

  it('requestOrigin 不匹配时保留原 URL', () => {
    expect(
      normalizeReadableFileUrl({
        url: 'http://other.example.com/a.pdf',
        requestOrigin: 'http://localhost:3000'
      })
    ).toBe('http://other.example.com/a.pdf');
  });

  it('requestOrigin 未提供时保留绝对 URL', () => {
    expect(normalizeReadableFileUrl({ url: 'http://example.com/a.pdf' })).toBe(
      'http://example.com/a.pdf'
    );
  });

  it('URL 解析失败时返回空串', () => {
    // parseUrlToFileType catch fallback 会把 url 当作 file 类型，但第二个 new URL 仍会抛错
    expect(normalizeReadableFileUrl({ url: 'http://[bad-host.pdf' })).toBe('');
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
      requestOrigin: 'http://localhost:3000',
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
        urls: ['https://blocked.example.com/cached.pdf'],
        maxFiles: 20,
        teamId: 'team-1',
        tmbId: 'tmb-1',
        fileContext: createEmptyWorkflowFileContext()
      });

      expect(mockGetRawTextBuffer).not.toHaveBeenCalled();
      expect(result[0]).toMatchObject({
        success: false,
        url: 'https://blocked.example.com/cached.pdf',
        content: 'Invalid file URL domain'
      });
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
    mockVerifyS3DownloadAccess.mockReset();
  });

  it('reads registered private workflow files through the workflow context without axios', async () => {
    const url = 'https://files.example.com/api/system/file/d/signed';
    const ref: WorkflowFileRef = {
      id: 'workflow-file-1',
      name: 'private.pdf',
      type: ChatFileTypeEnum.file,
      modelUrl: url,
      source: {
        type: 'chatObject',
        objectKey: 'chat/app/app-1/user-1/chat-1/private.pdf'
      }
    };
    const read = vi.fn().mockResolvedValue({
      buffer: Buffer.from('%PDF-1.7'),
      filename: 'private.pdf',
      contentType: 'application/pdf',
      sourceKind: 'internal',
      imageParsePrefix: 'chat/app/app-1/user-1/chat-1/private-parsed'
    });
    const fileContext: WorkflowFileContext = {
      limits: { maxFiles: 20, maxBytesPerFile: 1024 },
      resolve: (value) => (value === url || value === ref.id ? ref : undefined),
      resolveChatFile: () => ({
        type: ChatFileTypeEnum.file,
        name: ref.name,
        key: ref.source.type === 'chatObject' ? ref.source.objectKey : undefined,
        url
      }),
      getIdentity: (value) => (value === url ? 'chat:private' : undefined),
      read
    };

    const result = await parseFileContentFromUrls({
      urls: [url],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1',
      fileContext
    });

    expect(read).toHaveBeenCalledWith(url);
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
      requestOrigin: 'http://localhost:3000',
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

describe('parseFileInfoFromUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRawTextBuffer.mockResolvedValue(undefined);
    mockIsInternalAddress.mockResolvedValue(false);
    mockVerifyS3DownloadAccess.mockReset();
  });

  it('缓存命中时返回文件名，不下载文件内容', async () => {
    mockGetRawTextBuffer.mockResolvedValue({
      filename: 'cached.pdf',
      text: 'cached text'
    });

    const result = await parseFileInfoFromUrls({
      urls: ['https://files.example.com/cached.pdf'],
      maxFiles: 20,
      teamId: 'team-1'
    });

    expect(mockGetRawTextBuffer).toHaveBeenCalledWith({
      sourceId: 'https://files.example.com/cached.pdf',
      customPdfParse: false
    });
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        success: true,
        name: 'cached.pdf',
        url: 'https://files.example.com/cached.pdf'
      }
    ]);
  });

  it('内部地址在文件信息缓存命中前被拒绝', async () => {
    mockIsInternalAddress.mockResolvedValue(true);
    mockGetRawTextBuffer.mockResolvedValue({
      filename: 'cached.pdf',
      text: 'cached private content'
    });

    const result = await parseFileInfoFromUrls({
      urls: ['http://internal.svc/cached.pdf'],
      maxFiles: 20,
      teamId: 'team-1'
    });

    expect(mockGetRawTextBuffer).not.toHaveBeenCalled();
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        success: false,
        name: '',
        url: 'http://internal.svc/cached.pdf'
      }
    ]);
  });

  it('缓存未命中时只读取绝对 HTTP(S) 文件信息，并按 maxFiles 限制', async () => {
    mockAxiosGet.mockResolvedValue({
      data: Buffer.from('payload'),
      headers: {
        'content-disposition': 'attachment; filename="report.pdf"'
      }
    });

    const result = await parseFileInfoFromUrls({
      urls: ['http://localhost:3000/report.pdf', '/skip.pdf'],
      requestOrigin: 'http://localhost:3000',
      maxFiles: 1,
      teamId: 'team-1'
    });

    expect(mockAxiosGet).toHaveBeenCalledTimes(1);
    expect(mockAxiosGet).toHaveBeenCalledWith(
      'http://localhost:3000/report.pdf',
      expect.objectContaining({ responseType: 'stream' })
    );
    expect(mockReadFileContentByBuffer).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        success: true,
        name: 'report.pdf',
        url: 'http://localhost:3000/report.pdf'
      }
    ]);
  });

  it('拒绝没有 Workflow key 上下文的相对短链', async () => {
    const signedAlias = 'fileinfoalias01.hp436.abcdefghijklmnop';
    const shortUrl = `/api/system/file/d/${signedAlias}`;
    const result = await parseFileInfoFromUrls({
      urls: [shortUrl],
      maxFiles: 20,
      teamId: 'team-1'
    });

    expect(mockVerifyS3DownloadAccess).not.toHaveBeenCalled();
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('nginx 带路径前缀短链读取文件信息时使用 alias 文件名', async () => {
    const signedAlias = 'fileinfoalias01.hp436.abcdefghijklmnop';
    const shortUrl = `http://localhost:8088/f/${signedAlias}`;
    mockVerifyS3DownloadAccess.mockResolvedValue({
      bucketName: 'fastgpt-private',
      objectKey: 'chat/app/app1/u1/c1/random-key',
      filename: 'analysis.csv',
      expiresAt: new Date('2099-01-01T00:00:00.000Z')
    });
    mockAxiosGet.mockResolvedValue({
      data: Buffer.from('a,b\n1,2', 'utf8'),
      headers: {}
    });

    const result = await parseFileInfoFromUrls({
      urls: [shortUrl],
      maxFiles: 20,
      teamId: 'team-1'
    });

    expect(mockVerifyS3DownloadAccess).toHaveBeenCalledWith(signedAlias);
    expect(result).toEqual([
      {
        success: true,
        name: 'analysis.csv',
        url: shortUrl
      }
    ]);
  });

  it('内部地址返回失败项，并跳过下载', async () => {
    mockIsInternalAddress.mockResolvedValue(true);

    const result = await parseFileInfoFromUrls({
      urls: ['http://internal.svc/a.pdf'],
      maxFiles: 20,
      teamId: 'team-1'
    });

    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        success: false,
        name: '',
        url: 'http://internal.svc/a.pdf'
      }
    ]);
  });

  it('读取文件信息失败时返回失败项', async () => {
    mockAxiosGet.mockRejectedValue(new Error('network down'));

    const result = await parseFileInfoFromUrls({
      urls: ['http://example.com/a.pdf'],
      maxFiles: 20,
      teamId: 'team-1'
    });

    expect(result).toEqual([
      {
        success: false,
        name: '',
        url: 'http://example.com/a.pdf'
      }
    ]);
  });

  it('过滤不支持的 URL 后不触发读取', async () => {
    const result = await parseFileInfoFromUrls({
      urls: ['chat/a.pdf', '/image.png'],
      maxFiles: 20,
      teamId: 'team-1'
    });

    expect(mockGetRawTextBuffer).not.toHaveBeenCalled();
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

describe('formatUserQueryWithFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRawTextBuffer.mockImplementation(({ sourceId }: { sourceId: string }) => {
      const textMap: Record<string, string> = {
        '/a.pdf': 'Alpha',
        '/b.pdf': 'Beta',
        '/c.pdf': 'Gamma'
      };

      return textMap[sourceId]
        ? {
            filename: sourceId.split('/').pop(),
            text: textMap[sourceId]
          }
        : undefined;
    });
  });

  it('userQuery 不含文件时直接返回原 query', async () => {
    const userQuery: UserChatItemValueItemType[] = [{ text: { content: '只有文本' } }];
    const parseFileFn = vi.fn();
    const result = await formatUserQueryWithFiles({
      userQuery,
      parseFileFn
    });

    expect(parseFileFn).not.toHaveBeenCalled();
    expect(result).toBe(userQuery);
  });

  it('parseFileFn 没有返回文件信息时返回原 query', async () => {
    const userQuery: UserChatItemValueItemType[] = [
      { text: { content: '不应被改写' } },
      {
        file: {
          type: ChatFileTypeEnum.file,
          name: 'bad.pdf',
          // 不以 / http ws 开头，会被 normalizeReadableFileUrl 过滤掉
          url: 'chat/bad.pdf'
        }
      }
    ];
    const parseFileFn = vi.fn(async () => []);
    const result = await formatUserQueryWithFiles({
      userQuery,
      parseFileFn
    });

    expect(parseFileFn).toHaveBeenCalledWith(['chat/bad.pdf']);
    expect(result).toBe(userQuery);
  });

  it('image 类型不会被作为文件去解析', async () => {
    const userQuery: UserChatItemValueItemType[] = [
      { text: { content: '看看这张图' } },
      {
        file: {
          type: ChatFileTypeEnum.image,
          name: 'pic.png',
          url: '/pic.png'
        }
      }
    ];
    const parseFileFn = vi.fn();
    const result = await formatUserQueryWithFiles({
      userQuery,
      parseFileFn
    });

    expect(parseFileFn).not.toHaveBeenCalled();
    expect(result).toBe(userQuery);
  });

  it('短链图片会在文档解析前恢复为 image 类型，不再进入 read_file 文档解析', async () => {
    const signedAlias = 'xWqlYoPSsRIoFtHP.hpagc.bpCySSj7HPRrPtWbcAlqxd';
    const shortUrls = [`/api/system/file/d/${signedAlias}`, `http://localhost:8088/${signedAlias}`];
    mockVerifyS3DownloadAccess.mockResolvedValue({
      bucketName: 'fastgpt-private',
      objectKey: 'chat/app/app1/u1/c1/photo.jpeg',
      responseContentType: 'image/jpeg',
      expiresAt: new Date('2099-01-01T00:00:00.000Z')
    });

    for (const shortUrl of shortUrls) {
      mockVerifyS3DownloadAccess.mockClear();
      const parseFileFn = vi.fn(async () => []);

      const result = await formatUserQueryWithFiles({
        userQuery: [
          { text: { content: '图片内容' } },
          {
            file: {
              type: ChatFileTypeEnum.file,
              name: '',
              url: shortUrl
            }
          }
        ],
        parseFileFn
      });

      expect(mockVerifyS3DownloadAccess).toHaveBeenCalledTimes(1);
      expect(mockVerifyS3DownloadAccess).toHaveBeenCalledWith(signedAlias);
      expect(parseFileFn).not.toHaveBeenCalled();
      expect(result).toEqual([
        { text: { content: '图片内容' } },
        {
          file: {
            type: ChatFileTypeEnum.image,
            name: 'photo.jpeg',
            url: shortUrl
          }
        }
      ]);
    }
  });

  it('把 parseFileFn 返回的 id、sandboxPath 和 content 注入到文本 prompt', async () => {
    const parseFileFn = vi.fn(async () => [
      {
        id: 'file-1',
        name: 'a.pdf',
        url: '/a.pdf',
        sandboxPath: 'user_files/a.pdf',
        content: 'Alpha'
      }
    ]);

    const result = await formatUserQueryWithFiles({
      userQuery: [
        { text: { content: '总结这个文件' } },
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'a.pdf',
            url: '/a.pdf'
          }
        }
      ],
      parseFileFn
    });

    const content = result[0].text?.content;
    expect(content).toContain('总结这个文件');
    expect(content).toContain('<id>file-1</id>');
    expect(content).toContain('<name>a.pdf</name>');
    expect(content).toContain('<url>/a.pdf</url>');
    expect(content).toContain('<sandboxPath>user_files/a.pdf</sandboxPath>');
    expect(content).toContain('<content>Alpha</content>');
  });

  it('把历史和当前轮文件内容分别注入到所属 user message', async () => {
    const messages: ChatItemMiniType[] = [
      createHumanMessage([
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'a.pdf',
            url: '/a.pdf'
          }
        }
      ]),
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            text: {
              content: '上一轮回答'
            }
          }
        ]
      },
      createHumanMessage([
        {
          text: {
            content: '继续回答'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'b.pdf',
            url: '/b.pdf'
          }
        }
      ])
    ];

    const result = await rewriteMessagesWithFileContent({ messages });

    expect(messages[0].value.some((item) => item.text)).toBe(false);
    expect(mockGetRawTextBuffer).toHaveBeenCalledTimes(2);

    const firstHumanText = result[0].value.find((item) => item.text)?.text?.content;
    expect(firstHumanText).toContain('Alpha');

    const secondHumanText = result[2].value.find((item) => item.text)?.text?.content;
    expect(secondHumanText).toContain('继续回答');
    expect(secondHumanText).toContain('Beta');
    expect(secondHumanText).not.toContain('Alpha');
  });

  it('单条 user query 的文件解析数量受 maxFiles 控制', async () => {
    const messages: ChatItemMiniType[] = [
      createHumanMessage([
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'a.pdf',
            url: '/a.pdf'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'b.pdf',
            url: '/b.pdf'
          }
        }
      ])
    ];

    const result = await rewriteMessagesWithFileContent({ messages, maxFiles: 1 });

    expect(mockGetRawTextBuffer).toHaveBeenCalledTimes(1);
    expect(mockGetRawTextBuffer).toHaveBeenCalledWith({
      sourceId: '/a.pdf',
      customPdfParse: undefined
    });

    const content = result[0].value.find((item) => item.text)?.text?.content;
    expect(content).toContain('Alpha');
    expect(content).not.toContain('Beta');
  });

  it('同一条 user query 内重复 URL 不去重', async () => {
    const parseFileFn = createMockParseFileFn();
    const result = await formatUserQueryWithFiles({
      userQuery: [
        {
          text: {
            content: '总结这个文件'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'a.pdf',
            url: '/a.pdf'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'a-copy.pdf',
            url: '/a.pdf'
          }
        }
      ],
      parseFileFn
    });

    expect(parseFileFn).toHaveBeenCalledWith(['/a.pdf', '/a.pdf']);
    expect(mockGetRawTextBuffer).toHaveBeenCalledTimes(2);
    expect(mockGetRawTextBuffer).toHaveBeenNthCalledWith(1, {
      sourceId: '/a.pdf',
      customPdfParse: undefined
    });
    expect(mockGetRawTextBuffer).toHaveBeenNthCalledWith(2, {
      sourceId: '/a.pdf',
      customPdfParse: undefined
    });

    const content = result.find((item) => item.text)?.text?.content;
    expect(content).toContain('总结这个文件');
    // 两次重复 URL 都被注入到最终 prompt 里
    expect(content?.match(/<content>Alpha<\/content>/g)?.length).toBe(2);
  });

  it('相同 URL 出现在不同 message 时会分别读取并注入', async () => {
    const messages: ChatItemMiniType[] = [
      createHumanMessage([
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'a.pdf',
            url: '/a.pdf'
          }
        }
      ]),
      createHumanMessage([
        {
          text: {
            content: '再次引用'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'a-copy.pdf',
            url: '/a.pdf'
          }
        }
      ])
    ];

    const result = await rewriteMessagesWithFileContent({ messages });

    expect(mockGetRawTextBuffer).toHaveBeenCalledTimes(2);
    expect(result[0].value.find((item) => item.text)?.text?.content).toContain('Alpha');
    expect(result[1].value.find((item) => item.text)?.text?.content).toContain('Alpha');
  });

  it('多条 user message 会并行重写', async () => {
    const messages: ChatItemMiniType[] = [
      createHumanMessage([
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'a.pdf',
            url: '/a.pdf'
          }
        }
      ]),
      createHumanMessage([
        {
          text: {
            content: '继续回答'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'b.pdf',
            url: '/b.pdf'
          }
        }
      ])
    ];

    const resolveList: (() => void)[] = [];
    mockGetRawTextBuffer.mockImplementation(
      ({ sourceId }: { sourceId: string }) =>
        new Promise((resolve) => {
          resolveList.push(() =>
            resolve({
              filename: sourceId.split('/').pop(),
              text: sourceId === '/a.pdf' ? 'Alpha' : 'Beta'
            })
          );
        })
    );

    const pendingResult = rewriteMessagesWithFileContent({ messages });

    await Promise.resolve();

    // 在底层 buffer 调用 resolve 之前，两条 user message 已并行触发各自的读取
    expect(mockGetRawTextBuffer).toHaveBeenCalledTimes(2);
    expect(mockGetRawTextBuffer).toHaveBeenNthCalledWith(1, {
      sourceId: '/a.pdf',
      customPdfParse: undefined
    });
    expect(mockGetRawTextBuffer).toHaveBeenNthCalledWith(2, {
      sourceId: '/b.pdf',
      customPdfParse: undefined
    });

    resolveList.forEach((resolve) => resolve());
    const result = await pendingResult;

    expect(result[0].value.find((item) => item.text)?.text?.content).toContain('Alpha');
    expect(result[1].value.find((item) => item.text)?.text?.content).toContain('Beta');
  });
});
