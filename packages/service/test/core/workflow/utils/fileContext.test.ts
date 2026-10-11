import { prepareChatFiles, type ChatFileInput } from '@fastgpt/service/core/chat/file/service';
import { Readable } from 'node:stream';
import { resolveFileSourceExtension } from '@fastgpt/service/common/file/read/source';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatFileTypeEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { getFileMaxSize } from '@fastgpt/service/common/file/utils';

const axiosGetMock = vi.hoisted(() => vi.fn());
const axiosHeadMock = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/api/axios')>();
  return {
    ...mod,
    axios: {
      get: axiosGetMock,
      head: axiosHeadMock
    }
  };
});

import { prepareWorkflowFileContext } from '@fastgpt/service/core/workflow/utils/fileContext';
const scope = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app-1',
  uid: 'user-1',
  chatId: 'chat-1'
};
const privateKey = 'chat/app/app-1/user-1/chat-1/report.pdf';

const createFile = (
  overrides: Partial<UserChatItemValueItemType['file']> = {}
): UserChatItemValueItemType => ({
  file: {
    type: ChatFileTypeEnum.file,
    name: 'report.pdf',
    url: '/uploading/report.pdf',
    ...overrides
  }
});

const createHistory = (file: UserChatItemValueItemType): ChatItemMiniType => ({
  obj: ChatRoleEnum.Human,
  value: [file]
});

describe('prepareWorkflowFileContext', () => {
  const originalS3BucketMap = global.s3BucketMap;
  let originalSystemEnv: typeof global.systemEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalSystemEnv = global.systemEnv;
    global.systemEnv = { fileUrlWhitelist: [] } as any;
  });

  afterEach(() => {
    global.s3BucketMap = originalS3BucketMap;
    global.systemEnv = originalSystemEnv;
  });

  it('保留文本和非 Human 历史，不共享可变消息对象', async () => {
    const text = { text: { content: 'question' } };
    const history = createHistory(text);
    const ai = { obj: ChatRoleEnum.AI, value: [{ text: { content: 'answer' } }] };
    const result = await prepareWorkflowFileContext({
      query: [text],
      histories: [history, ai],
      scope,
      maxFileAmount: 2
    });
    expect(result.query).toEqual([text]);
    expect(result.query[0]).not.toBe(text);
    expect(result.histories).toEqual([history, ai]);
    expect(result.histories[0].value[0]).not.toBe(text);
  });

  it('同一私有 key 并发登记只生成一个 Ref，所有原始 URL 均可解析', async () => {
    const urls = ['https://files.example.com/one', 'https://files.example.com/two'];
    const { fileContext, fileRegistrar } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFileAmount: 3,
      getPreviewUrl: async () => 'https://files.example.com/signed'
    });
    const refs = await Promise.all([
      ...urls.map((url) =>
        fileRegistrar.registerInputFile({
          file: { key: privateKey, url, name: '', type: ChatFileTypeEnum.file },
          source: 'variable'
        })
      ),
      fileRegistrar.registerInputFile({
        file: { key: privateKey, name: '', type: ChatFileTypeEnum.file },
        source: 'interactive'
      })
    ]);
    expect(refs.every((ref) => ref === refs[0])).toBe(true);
    expect(refs[0]?.name).toBe('report.pdf');
    for (const url of urls) expect(fileContext.resolve(url)).toBe(refs[0]);
    const child = await fileContext.derive([{ key: privateKey }]);
    expect(child.resolveChatFile('https://files.example.com/signed')).toMatchObject({
      key: privateKey
    });
    expect(child.getIdentity('https://files.example.com/signed')).toBe(`chat:${privateKey}`);
  });

  it('派生 Context 去重继承别名，孙级只继承所选文件并拒绝越权读取', async () => {
    const first = 'https://files.example.com/one.pdf';
    const second = 'https://files.example.com/two.pdf';
    const { fileContext } = await prepareWorkflowFileContext({
      query: [createFile({ url: first }), createFile({ url: second })],
      histories: [],
      scope,
      maxFileAmount: 3
    });
    const child = await fileContext.derive([first, `${first}#alias`]);
    expect(child.resolve(`${first}#alias`)).toBe(fileContext.resolve(first));
    const repeated = child.registerExternalFile({
      url: first,
      name: '重复',
      type: ChatFileTypeEnum.audio
    });
    expect(repeated).toBe(fileContext.resolve(first));
    const grandchild = await child.derive([first]);
    expect((await grandchild.getSource(first)).sourceKind).toBe('external');
    expect(grandchild.resolveChatFile(second)).toBeUndefined();
    expect(grandchild.getIdentity(second)).toBeUndefined();
    expect(grandchild.resolveInputFile({})).toBeUndefined();
    expect(fileContext.resolveInputFile({})).toBeUndefined();
    await expect(grandchild.getSource(second)).rejects.toThrow('not selected');
    await expect(grandchild.getSource(fileContext.resolve(second)!)).rejects.toThrow(
      'not selected'
    );
    await expect(fileContext.getSource('https://files.example.com/missing')).rejects.toThrow(
      'not registered'
    );
    await expect(child.derive(['/relative.pdf'])).rejects.toThrow(
      'Invalid child workflow file URL'
    );
    await expect(child.derive([{}])).rejects.toThrow('Invalid child workflow file URL');
    global.systemEnv.fileUrlWhitelist = ['allowed.example.com'];
    await expect(child.derive(['https://blocked.example.com/a.pdf'])).rejects.toThrow(
      'Invalid child workflow file URL'
    );
  });

  it.each(['variable', 'interactive'] as const)('%s 登记拒绝无效外链', async (source) => {
    const { fileRegistrar } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFileAmount: 2
    });
    await expect(
      fileRegistrar.registerInputFile({ file: { url: '', type: ChatFileTypeEnum.file }, source })
    ).rejects.toThrow(`Invalid workflow ${source} file URL`);
  });

  it.each([undefined, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    '私有来源拒绝非法大小 %s，获取正文前失败',
    async (contentLength) => {
      const { fileContext } = await prepareWorkflowFileContext({
        query: [createFile({ key: privateKey })],
        histories: [],
        scope,
        maxFileAmount: 2,
        getPreviewUrl: async () => 'https://files.example.com/signed'
      });
      const downloadObject = vi.fn();
      global.s3BucketMap = {
        [S3Buckets.private]: {
          client: { getObjectMetadata: async () => ({ contentLength }), downloadObject }
        }
      } as any;
      await expect(fileContext.getSource('https://files.example.com/signed')).rejects.toThrow(
        'invalid metadata'
      );
      expect(downloadObject).not.toHaveBeenCalled();
    }
  );

  it('私有来源缺少 bucket 或正文时明确失败，损坏的编码名称原样保留', async () => {
    const key = privateKey.replace('.pdf', '');
    const { fileContext } = await prepareWorkflowFileContext({
      query: [createFile({ key })],
      histories: [],
      scope,
      maxFileAmount: 2,
      getPreviewUrl: async () => 'https://files.example.com/signed'
    });
    global.s3BucketMap = {} as any;
    await expect(fileContext.getSource('https://files.example.com/signed')).rejects.toThrow(
      'not initialized'
    );
    global.s3BucketMap = {
      [S3Buckets.private]: {
        client: {
          getObjectMetadata: async () => ({
            contentLength: 0,
            metadata: { originFilename: '%invalid' }
          }),
          downloadObject: async () => ({})
        }
      }
    } as any;
    const { source, imageParsePrefix } = await fileContext.getSource(
      'https://files.example.com/signed'
    );
    expect(source.metadata.filename).toBe('%invalid');
    expect(imageParsePrefix).toBe(`${key}-parsed`);
    await expect(source.materialize({ signal: new AbortController().signal })).rejects.toThrow(
      'no body'
    );
  });

  it('uses the system file size limit by default', async () => {
    const { fileContext } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFileAmount: 20,
      getPreviewUrl: vi.fn()
    });

    expect(fileContext.limits).toEqual({
      maxFileAmount: 20,
      maxBytesPerFile: getFileMaxSize()
    });
  });

  it('validates, signs and deduplicates the same private key across query and history', async () => {
    const queryFile = createFile({ key: privateKey });
    const historyFile = createFile({ key: privateKey, url: 'https://old.example.com/report.pdf' });
    const getPreviewUrl = vi
      .fn()
      .mockResolvedValue('https://files.example.com/api/system/file/d/signed');

    const {
      fileContext,
      getPreviewUrl: cachedGetPreviewUrl,
      query,
      histories
    } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [createHistory(historyFile)],
      scope,
      maxFileAmount: 20,
      maxBytesPerFile: 1024,
      getPreviewUrl
    });
    const queryUrl = query[0].file!.url;
    const historyUrl = (histories[0].value[0] as UserChatItemValueItemType).file!.url;

    expect(getPreviewUrl).toHaveBeenCalledTimes(1);
    expect(queryUrl).toBe('https://files.example.com/api/system/file/d/signed');
    expect(historyUrl).toBe('https://files.example.com/api/system/file/d/signed');
    expect(queryFile.file?.url).toBe('/uploading/report.pdf');
    expect(historyFile.file?.url).toBe('https://old.example.com/report.pdf');

    const queryRef = fileContext.resolve(queryUrl);
    const historyRef = fileContext.resolve('https://old.example.com/report.pdf');
    expect(queryRef).toBe(historyRef);
    expect(queryRef?.source).toEqual({ type: 'chatObject', objectKey: privateKey });
    expect(fileContext.resolveChatFile(queryUrl)).toEqual({
      type: ChatFileTypeEnum.file,
      name: 'report.pdf',
      key: privateKey,
      url: 'https://files.example.com/api/system/file/d/signed'
    });
    expect(fileContext.getIdentity(queryUrl)).toBe(`chat:${privateKey}`);
    expect(fileContext.resolve('https://unknown.example.com/new.pdf')).toBeUndefined();

    await cachedGetPreviewUrl(privateKey);
    expect(getPreviewUrl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['source type', 'chat/skillEdit/app-1/user-1/chat-1/report.pdf'],
    ['source id', 'chat/app/app-2/user-1/chat-1/report.pdf'],
    ['uid', 'chat/app/app-1/user-2/chat-1/report.pdf'],
    ['chat id', 'chat/app/app-1/user-1/chat-2/report.pdf']
  ])('rejects a private key with mismatched %s', async (_name, key) => {
    await expect(
      prepareWorkflowFileContext({
        query: [createFile({ key })],
        histories: [],
        scope,
        maxFileAmount: 20,
        getPreviewUrl: vi.fn()
      })
    ).rejects.toThrow('does not belong to the current workflow');
  });

  it('skips a history private key that does not belong to the current workflow', async () => {
    const invalidHistoryKey = 'chat/app/app-1/user-1/other-chat/report.pdf';
    const historyFile = createFile({ key: invalidHistoryKey });
    const getPreviewUrl = vi.fn();

    const { histories } = await prepareWorkflowFileContext({
      query: [],
      histories: [createHistory(historyFile)],
      scope,
      maxFileAmount: 20,
      getPreviewUrl
    });

    expect(getPreviewUrl).not.toHaveBeenCalled();
    expect(histories[0].value).toEqual([]);
    expect(historyFile.file?.key).toBe(invalidHistoryKey);
  });

  it('registers absolute external URLs and skips invalid history URLs', async () => {
    const queryFile = createFile({ key: undefined, url: 'https://cdn.example.com/report.pdf' });
    const invalidHistoryFile = createFile({ key: undefined, url: '/api/system/file/d/legacy' });

    const { fileContext, histories } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [createHistory(invalidHistoryFile)],
      scope,
      maxFileAmount: 5,
      maxBytesPerFile: 512,
      getPreviewUrl: vi.fn()
    });

    expect(fileContext.resolve(queryFile.file!.url)?.source).toEqual({
      type: 'externalHttp',
      url: 'https://cdn.example.com/report.pdf'
    });
    expect(fileContext.resolve(invalidHistoryFile.file!.url)).toBeUndefined();
    expect(histories[0].value).toEqual([]);
    expect(invalidHistoryFile.file?.url).toBe('/api/system/file/d/legacy');
    expect(fileContext.limits).toEqual({ maxFileAmount: 5, maxBytesPerFile: 512 });
  });

  it('registers trusted variable and interactive files after context creation', async () => {
    const getPreviewUrl = vi.fn().mockResolvedValue('https://files.example.com/signed-variable');
    const { fileContext, fileRegistrar } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFileAmount: 20,
      getPreviewUrl
    });

    const privateRef = await fileRegistrar.registerInputFile({
      file: {
        key: privateKey,
        name: 'report.pdf',
        type: ChatFileTypeEnum.file
      },
      source: 'variable'
    });
    const externalRef = await fileRegistrar.registerInputFile({
      file: {
        url: 'https://external.example.com/form.pdf',
        name: 'form.pdf',
        type: ChatFileTypeEnum.file
      },
      source: 'interactive'
    });

    expect(privateRef?.source).toEqual({ type: 'chatObject', objectKey: privateKey });
    expect(externalRef?.source).toEqual({
      type: 'externalHttp',
      url: 'https://external.example.com/form.pdf'
    });
    expect(fileContext.resolve('https://files.example.com/signed-variable')).toBe(privateRef);
    expect(fileContext.resolve('https://external.example.com/form.pdf')).toBe(externalRef);

    await expect(
      fileRegistrar.registerInputFile({
        file: {
          key: 'chat/app/other-app/user-1/chat-1/report.pdf',
          name: 'report.pdf',
          type: ChatFileTypeEnum.file
        },
        source: 'interactive'
      })
    ).rejects.toThrow('does not belong to the current workflow');
  });

  it('derives an isolated child context from selected parent files and new external URLs', async () => {
    const firstKey = privateKey;
    const secondKey = 'chat/app/app-1/user-1/chat-1/other.pdf';
    const firstFile = createFile({ key: firstKey });
    const secondFile = createFile({ key: secondKey });
    const getPreviewUrl = vi.fn(async (key: string) => `https://files.example.com/${key}`);
    const { fileContext, query } = await prepareWorkflowFileContext({
      query: [firstFile, secondFile],
      histories: [],
      scope,
      maxFileAmount: 20,
      getPreviewUrl
    });
    const firstUrl = query[0].file!.url;
    const secondUrl = query[1].file!.url;
    const childExternalUrl = 'https://child.example.com/generated.pdf';

    const childContext = await fileContext.derive([firstUrl, childExternalUrl]);

    expect(childContext.resolve(firstUrl)).toBe(fileContext.resolve(firstUrl));
    expect(childContext.resolve(secondUrl)).toBeUndefined();
    expect(
      childContext.resolveInputFile({
        key: firstKey,
        name: 'report.pdf',
        type: ChatFileTypeEnum.file
      })
    ).toBe(fileContext.resolve(firstUrl));
    expect(childContext.resolve(childExternalUrl)?.source).toEqual({
      type: 'externalHttp',
      url: childExternalUrl
    });
    await expect(childContext.getSource(fileContext.resolve(secondUrl)!)).rejects.toThrow(
      'not selected'
    );
    expect(getPreviewUrl).toHaveBeenCalledTimes(2);
  });

  it('does not let a conflicting URL bypass an unknown child private key', async () => {
    const queryFile = createFile({ key: privateKey });
    const { fileContext } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [],
      scope,
      maxFileAmount: 20,
      getPreviewUrl: vi.fn().mockResolvedValue('https://files.example.com/selected')
    });

    await expect(
      fileContext.derive([
        {
          key: 'chat/app/app-1/user-1/other-chat/unknown.pdf',
          url: queryFile.file!.url,
          name: 'unknown.pdf',
          type: ChatFileTypeEnum.file
        }
      ])
    ).rejects.toThrow('not registered in the parent context');
  });

  it('propagates an invalid signer result as a system error for history files', async () => {
    await expect(
      prepareWorkflowFileContext({
        query: [],
        histories: [createHistory(createFile({ key: privateKey }))],
        scope,
        maxFileAmount: 20,
        getPreviewUrl: vi.fn().mockResolvedValue('/api/system/file/d/relative')
      })
    ).rejects.toThrow('signer must return an absolute HTTP(S) URL');
  });

  it('rejects invalid query URLs and configured non-whitelisted domains', async () => {
    await expect(
      prepareWorkflowFileContext({
        query: [createFile({ key: undefined, url: '/api/system/file/d/legacy' })],
        histories: [],
        scope,
        maxFileAmount: 20,
        getPreviewUrl: vi.fn()
      })
    ).rejects.toThrow('Invalid workflow file URL');

    global.systemEnv = { fileUrlWhitelist: ['allowed.example.com'] } as any;
    await expect(
      prepareWorkflowFileContext({
        query: [createFile({ key: undefined, url: 'https://blocked.example.com/a.pdf' })],
        histories: [],
        scope,
        maxFileAmount: 20,
        getPreviewUrl: vi.fn()
      })
    ).rejects.toThrow('Invalid workflow file URL');
  });

  it('returns a lazy trusted S3 source without repeating the business size limit', async () => {
    const getObjectMetadata = vi.fn().mockResolvedValue({
      contentLength: 5,
      contentType: 'application/pdf',
      metadata: { originFilename: 'report.pdf' }
    });
    const downloadObject = vi
      .fn()
      .mockResolvedValue({ body: Readable.from([Buffer.from('hello')]) });
    global.s3BucketMap = {
      ...originalS3BucketMap,
      [S3Buckets.private]: {
        client: { getObjectMetadata, downloadObject }
      } as any
    };
    const { fileContext } = await prepareWorkflowFileContext({
      query: [createFile({ key: privateKey })],
      histories: [],
      scope,
      maxFileAmount: 20,
      maxBytesPerFile: 5,
      getPreviewUrl: vi.fn().mockResolvedValue('https://files.example.com/signed')
    });
    const ref = fileContext.resolve('https://files.example.com/signed')!;

    const sourceResult = await fileContext.getSource(ref);
    expect(sourceResult).toMatchObject({
      source: {
        kind: 's3',
        sizeBytes: 5,
        metadata: { filename: 'report.pdf', contentType: 'application/pdf' }
      },
      sourceKind: 'internal',
      imageParsePrefix: 'chat/app/app-1/user-1/chat-1/report-parsed'
    });
    expect(downloadObject).not.toHaveBeenCalled();
    await expect(
      sourceResult.source.materialize({ signal: new AbortController().signal })
    ).resolves.toMatchObject({ buffer: Buffer.from('hello') });
    expect(downloadObject).toHaveBeenCalledWith({
      key: privateKey,
      abortSignal: expect.any(AbortSignal)
    });

    getObjectMetadata.mockResolvedValueOnce({ contentLength: 6, metadata: {} });
    await expect(fileContext.getSource(ref)).resolves.toMatchObject({
      source: { kind: 's3', sizeBytes: 6 }
    });
  });

  it.each([
    ['root', '报告', 'remote.pdf'],
    ['root', '报告.', 'remote.pdf'],
    ['root', 'https://cdn.example.com/download?token=signed.value', 'remote.pdf'],
    ['root', '', 'remote.pdf'],
    ['root', 'trusted.pdf', 'trusted.pdf'],
    ['inherited', 'https://cdn.example.com/download?token=signed.value', 'remote.pdf'],
    ['child', 'https://cdn.example.com/download?token=signed.value', 'remote.pdf']
  ])(
    '%s Context 的外链名称 %s 只在带有效后缀时覆盖响应文件名',
    async (kind, name, expectedFilename) => {
      const { fileContext } = await prepareWorkflowFileContext({
        query: [],
        histories: [],
        scope,
        maxFileAmount: 20
      });
      const url = 'https://cdn.example.com/download?token=signed.value';
      const rootRef =
        kind === 'child'
          ? undefined
          : fileContext.registerExternalFile({ url, name, type: ChatFileTypeEnum.file });
      const context = kind === 'root' ? fileContext : await fileContext.derive([url]);
      const ref = context.resolve(url)!;
      if (kind === 'inherited') expect(ref).toBe(rootRef);
      if (kind === 'child') expect(fileContext.resolve(url)).toBeUndefined();
      const displayName = ref.name;
      axiosGetMock.mockResolvedValueOnce({
        data: Readable.from([Buffer.from('%PDF-1.7\n')]),
        headers: {
          'content-type': 'application/octet-stream',
          'content-disposition': 'attachment; filename="remote.pdf"'
        }
      });
      const { source } = await context.getSource(ref);
      const result = await source.materialize({ signal: new AbortController().signal });
      expect(result.metadata.filename).toBe(expectedFilename);
      expect(resolveFileSourceExtension({ buffer: result.buffer, metadata: result.metadata })).toBe(
        'pdf'
      );
      expect(ref.name).toBe(displayName);
    }
  );

  it('returns a lazy External source and enforces the streamed business size when materialized', async () => {
    const { fileContext } = await prepareWorkflowFileContext({
      query: [createFile({ key: undefined, url: 'https://cdn.example.com/report.pdf' })],
      histories: [],
      scope,
      maxFileAmount: 20,
      maxBytesPerFile: 5,
      getPreviewUrl: vi.fn()
    });
    const ref = fileContext.resolve('https://cdn.example.com/report.pdf')!;
    axiosGetMock.mockResolvedValueOnce({
      data: Readable.from([Buffer.from('hello')]),
      headers: {
        'content-length': '5',
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="external.pdf"'
      }
    });

    const sourceResult = await fileContext.getSource(ref);
    expect(sourceResult).toMatchObject({
      source: {
        kind: 'externalHttp',
        maxSizeBytes: 5,
        metadata: { filename: 'report.pdf' }
      },
      sourceKind: 'external'
    });
    expect(axiosGetMock).not.toHaveBeenCalled();
    await expect(
      sourceResult.source.materialize({ signal: new AbortController().signal })
    ).resolves.toEqual({
      buffer: Buffer.from('hello'),
      metadata: { filename: 'report.pdf', contentType: 'application/pdf' }
    });
    expect(axiosGetMock).toHaveBeenCalledWith(
      'https://cdn.example.com/report.pdf',
      expect.objectContaining({ responseType: 'stream', maxContentLength: 5 })
    );

    const oversizedStream = Readable.from([Buffer.from('ignored')]);
    const destroySpy = vi.spyOn(oversizedStream, 'destroy');
    axiosGetMock.mockResolvedValueOnce({
      data: oversizedStream,
      headers: { 'content-length': '6' }
    });
    await expect(
      sourceResult.source.materialize({ signal: new AbortController().signal })
    ).rejects.toThrow('maximum allowed size');
    expect(destroySpy).toHaveBeenCalled();

    axiosGetMock.mockResolvedValueOnce({
      data: Readable.from([Buffer.from('123'), Buffer.from('456')]),
      headers: {}
    });
    await expect(
      sourceResult.source.materialize({ signal: new AbortController().signal })
    ).rejects.toThrow('maximum allowed size');
  });

  it('rejects refs that were not created by the current context', async () => {
    const { fileContext } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFileAmount: 20,
      getPreviewUrl: vi.fn()
    });

    await expect(
      fileContext.getSource({
        name: 'forged.pdf',
        type: ChatFileTypeEnum.file,
        modelUrl: 'https://evil.example.com/a.pdf',
        source: { type: 'externalHttp', url: 'https://evil.example.com/a.pdf' }
      })
    ).rejects.toThrow('not registered');
  });

  it('returns signed runtime chat inputs without mutating caller data', async () => {
    const query = [createFile({ key: privateKey })];
    const histories = [createHistory(createFile({ key: privateKey }))];
    const prepared = await prepareWorkflowFileContext({
      query,
      histories,
      scope,
      maxFileAmount: 2,
      getPreviewUrl: vi.fn().mockResolvedValue('https://files.example.com/signed')
    });

    expect(prepared.query[0].file?.url).toBe('https://files.example.com/signed');
    expect((prepared.histories[0].value[0] as UserChatItemValueItemType).file?.url).toBe(
      'https://files.example.com/signed'
    );
    expect(query[0].file?.url).toBe('/uploading/report.pdf');
    expect((histories[0].value[0] as UserChatItemValueItemType).file?.url).toBe(
      '/uploading/report.pdf'
    );
  });
});

describe('prepareWorkflowFileContext — 外链登记与派生', () => {
  const prepareExternal = async (
    fileContext: import('@fastgpt/service/core/workflow/utils/fileContext').WorkflowFileContext,
    file: ChatFileInput
  ) => {
    const [result] = await prepareChatFiles({ files: [file], maxFiles: 1, fileContext });
    return fileContext.resolve(result.url)!;
  };
  let savedEnv: typeof global.systemEnv;
  beforeEach(() => {
    savedEnv = global.systemEnv;
    axiosHeadMock.mockReset().mockResolvedValue({ headers: { 'content-type': 'image/png' } });
    global.systemEnv = { fileUrlWhitelist: [] } as any;
  });

  afterEach(() => {
    global.systemEnv = savedEnv;
  });

  const prepare = (query: UserChatItemValueItemType[] = [], maxFileAmount = 20) =>
    prepareWorkflowFileContext({
      query,
      histories: [],
      scope,
      maxFileAmount,
      getPreviewUrl: vi.fn()
    });

  it('classifies query and history before registration and shares concurrent requests', async () => {
    const url = 'https://files.example.com/opaque';
    const file = createFile({ url, name: 'photo', type: ChatFileTypeEnum.file });
    const result = await prepareWorkflowFileContext({
      query: [file, file],
      histories: [createHistory(file)],
      scope,
      maxFileAmount: 20
    });
    expect(axiosHeadMock).toHaveBeenCalledTimes(1);
    expect(result.query.every((item) => item.file?.type === ChatFileTypeEnum.image)).toBe(true);
    expect(result.histories[0].value[0]).toMatchObject({ file: { type: ChatFileTypeEnum.image } });
    expect(file.file?.type).toBe(ChatFileTypeEnum.file);
    expect(result.fileContext.resolve(url)?.type).toBe(ChatFileTypeEnum.image);
  });

  it('inherits selected classifications and keeps new child registrations isolated', async () => {
    const url = 'https://files.example.com/opaque';
    const { fileContext } = await prepare([createFile({ url })]);
    const child = await fileContext.derive([url]);
    expect(child.resolve(url)).toBe(fileContext.resolve(url));
    const childUrl = 'https://files.example.com/child-opaque';
    await prepareExternal(child, { url: childUrl });
    expect(child.resolve(childUrl)?.type).toBe(ChatFileTypeEnum.image);
    expect(fileContext.resolve(childUrl)).toBeUndefined();
    expect(axiosHeadMock).toHaveBeenCalledTimes(2);
  });

  it('Child 新外链最多 5 并发，去重保留首个名称且不污染 Parent', async () => {
    const { fileContext } = await prepare();
    const urls = Array.from(
      { length: 8 },
      (_, index) => `https://files.example.com/child-${index}`
    );
    const pending = new Map<string, () => void>();
    let active = 0;
    let peak = 0;
    axiosHeadMock.mockImplementation((url: string) => {
      active += 1;
      peak = Math.max(peak, active);
      return new Promise((resolve) => {
        pending.set(url, () => {
          active -= 1;
          resolve({ headers: { 'content-type': 'image/png' } });
        });
      });
    });

    const childPromise = fileContext.derive([
      { url: urls[0], name: 'first', type: ChatFileTypeEnum.file },
      { url: `${urls[0]}#duplicate`, name: 'duplicate', type: ChatFileTypeEnum.audio },
      ...urls.slice(1)
    ]);
    try {
      await vi.waitFor(() => expect(pending.size).toBe(5));
      expect(active).toBe(5);
      expect(axiosHeadMock).toHaveBeenCalledTimes(5);
      // 先完成较后的请求，验证空出的槽位能继续准备剩余文件。
      pending.get(urls[4])!();
      await vi.waitFor(() => expect(pending.size).toBe(6));
      expect(active).toBe(5);
      for (const url of urls.slice(0, 4)) pending.get(url)!();
      await vi.waitFor(() => expect(pending.size).toBe(8));
      for (const url of urls.slice(5)) pending.get(url)!();

      const child = await childPromise;
      expect(peak).toBe(5);
      expect(axiosHeadMock).toHaveBeenCalledTimes(8);
      expect(child.resolve(urls[0])).toMatchObject({ name: 'first', type: ChatFileTypeEnum.image });
      expect(child.resolve(`${urls[0]}#duplicate`)).toBe(child.resolve(urls[0]));
      for (const url of urls) {
        expect(child.resolveChatFile(url)?.type).toBe(ChatFileTypeEnum.image);
        expect(fileContext.resolve(url)).toBeUndefined();
      }
    } finally {
      // 断言失败时也释放 HTTP 替身，防止悬挂请求影响后续测例。
      axiosHeadMock.mockResolvedValue({ headers: { 'content-type': 'image/png' } });
      pending.forEach((release) => release());
      await childPromise;
    }
  });

  it.each([0, 1])('truncates query files before probing with limit %s', async (maxFileAmount) => {
    const result = await prepare(
      [
        createFile({ url: 'https://files.example.com/first' }),
        createFile({ url: 'https://files.example.com/second' })
      ],
      maxFileAmount
    );
    expect(result.query).toHaveLength(maxFileAmount);
    expect(axiosHeadMock).toHaveBeenCalledTimes(maxFileAmount);
  });
});
