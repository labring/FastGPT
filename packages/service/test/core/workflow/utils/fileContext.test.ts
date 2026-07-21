import { Readable } from 'node:stream';
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

vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/api/axios')>();
  return {
    ...mod,
    axios: {
      get: axiosGetMock
    }
  };
});

import {
  isAbsoluteHttpUrl,
  prepareWorkflowFileContext
} from '@fastgpt/service/core/workflow/utils/fileContext';
import {
  getWorkflowFileContext,
  getWorkflowFileRegistrar,
  readWorkflowFileBuffer,
  runWithContext,
  runWithDerivedWorkflowFileContext
} from '@fastgpt/service/core/workflow/utils/context';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/utils/variables';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';

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

describe('isAbsoluteHttpUrl', () => {
  it.each([
    ['https://files.example.com/a.pdf', true],
    ['http://files.example.com/a.pdf', true],
    ['/api/system/file/d/token', false],
    ['//files.example.com/a.pdf', false],
    ['file:///tmp/a.pdf', false],
    ['data:text/plain,a', false],
    ['ws://files.example.com/a.pdf', false],
    ['http://[invalid', false]
  ])('validates %s', (url, expected) => {
    expect(isAbsoluteHttpUrl(url)).toBe(expected);
  });
});

describe('prepareWorkflowFileContext', () => {
  const originalS3BucketMap = global.s3BucketMap;

  beforeEach(() => {
    vi.clearAllMocks();
    global.systemEnv = { fileUrlWhitelist: [] } as any;
  });

  afterEach(() => {
    global.s3BucketMap = originalS3BucketMap;
  });

  it('uses the system file size limit by default', async () => {
    const { fileContext } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFiles: 20,
      getPreviewUrl: vi.fn()
    });

    expect(fileContext.limits).toEqual({
      maxFiles: 20,
      maxBytesPerFile: getFileMaxSize()
    });
  });

  it('validates, signs and deduplicates the same private key across query and history', async () => {
    const queryFile = createFile({ key: privateKey });
    const historyFile = createFile({ key: privateKey, url: 'https://old.example.com/report.pdf' });
    const getPreviewUrl = vi
      .fn()
      .mockResolvedValue('https://files.example.com/api/system/file/d/signed');

    const { fileContext, getPreviewUrl: cachedGetPreviewUrl } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [createHistory(historyFile)],
      scope,
      maxFiles: 20,
      maxFileSize: 1024,
      getPreviewUrl
    });

    expect(getPreviewUrl).toHaveBeenCalledTimes(1);
    expect(queryFile.file?.url).toBe('https://files.example.com/api/system/file/d/signed');
    expect(historyFile.file?.url).toBe('https://files.example.com/api/system/file/d/signed');

    const queryRef = fileContext.resolve(queryFile.file!.url);
    const historyRef = fileContext.resolve('https://old.example.com/report.pdf');
    expect(queryRef).toBe(historyRef);
    expect(queryRef?.source).toEqual({ type: 'chatObject', objectKey: privateKey });
    expect(fileContext.resolveChatFile(queryFile.file!.url)).toEqual({
      type: ChatFileTypeEnum.file,
      name: 'report.pdf',
      key: privateKey,
      url: 'https://files.example.com/api/system/file/d/signed'
    });
    expect(fileContext.getIdentity(queryFile.file!.url)).toBe(`chat:${privateKey}`);
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
        maxFiles: 20,
        getPreviewUrl: vi.fn()
      })
    ).rejects.toThrow('does not belong to the current workflow');
  });

  it('skips a history private key that does not belong to the current workflow', async () => {
    const invalidHistoryKey = 'chat/app/app-1/user-1/other-chat/report.pdf';
    const historyFile = createFile({ key: invalidHistoryKey });
    const getPreviewUrl = vi.fn();

    await prepareWorkflowFileContext({
      query: [],
      histories: [createHistory(historyFile)],
      scope,
      maxFiles: 20,
      getPreviewUrl
    });

    expect(getPreviewUrl).not.toHaveBeenCalled();
    expect(historyFile.file?.url).toBe('/uploading/report.pdf');
  });

  it('registers absolute external URLs and skips invalid history URLs', async () => {
    const queryFile = createFile({ key: undefined, url: 'https://cdn.example.com/report.pdf' });
    const invalidHistoryFile = createFile({ key: undefined, url: '/api/system/file/d/legacy' });

    const { fileContext } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [createHistory(invalidHistoryFile)],
      scope,
      maxFiles: 5,
      maxFileSize: 512,
      getPreviewUrl: vi.fn()
    });

    expect(fileContext.resolve(queryFile.file!.url)?.source).toEqual({
      type: 'externalHttp',
      url: 'https://cdn.example.com/report.pdf'
    });
    expect(fileContext.resolve(invalidHistoryFile.file!.url)).toBeUndefined();
    expect(fileContext.limits).toEqual({ maxFiles: 5, maxBytesPerFile: 512 });
  });

  it('registers trusted variable and interactive files after context creation', async () => {
    const getPreviewUrl = vi.fn().mockResolvedValue('https://files.example.com/signed-variable');
    const { fileContext, fileRegistrar } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFiles: 20,
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
    const { fileContext } = await prepareWorkflowFileContext({
      query: [firstFile, secondFile],
      histories: [],
      scope,
      maxFiles: 20,
      getPreviewUrl
    });
    const firstUrl = firstFile.file!.url;
    const secondUrl = secondFile.file!.url;
    const childExternalUrl = 'https://child.example.com/generated.pdf';

    const childContext = fileContext.derive([firstUrl, childExternalUrl]);

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
    await expect(childContext.read(fileContext.resolve(secondUrl)!)).rejects.toThrow(
      'not selected'
    );
    expect(getPreviewUrl).toHaveBeenCalledTimes(2);
  });

  it('keeps the parent model URL when a child variable restores its private key', async () => {
    const getPreviewUrl = vi.fn().mockResolvedValue('https://files.example.com/parent-signed');
    const { fileContext, fileRegistrar } = await prepareWorkflowFileContext({
      query: [createFile({ key: privateKey })],
      histories: [],
      scope,
      maxFiles: 20,
      getPreviewUrl
    });
    const parentUrl = 'https://files.example.com/parent-signed';
    const sourceVariableState = {
      getFileStoreValueByRuntimeUrl: vi.fn(() => ({
        key: privateKey,
        name: 'report.pdf',
        type: ChatFileTypeEnum.file
      }))
    } as any;

    await runWithContext(
      {
        mcpClientMemory: {},
        fileContext,
        fileRegistrar
      },
      () =>
        runWithDerivedWorkflowFileContext({
          files: [parentUrl],
          fn: async ({ resolveInputFile }) => {
            const childState = await WorkflowVariableState.create({
              timezone: 'Asia/Shanghai',
              runningAppInfo: {
                sourceType: ChatSourceTypeEnum.app,
                sourceId: 'child-app',
                teamId: 'team-1',
                tmbId: 'tmb-1',
                name: 'child'
              },
              uid: scope.uid,
              chatId: scope.chatId,
              variablesConfig: [{ key: 'files', type: VariableInputEnum.file } as any],
              inputVariables: { files: [parentUrl] },
              sourceVariableState,
              resolveInputFile
            });

            expect(childState.get('files')).toEqual([parentUrl]);
          }
        })
    );

    expect(getPreviewUrl).toHaveBeenCalledTimes(1);
  });

  it('adds child interactive files to the active derived context', async () => {
    const interactiveKey = 'chat/app/app-1/user-1/chat-1/interactive.pdf';
    const getPreviewUrl = vi.fn(async (key: string) => `https://files.example.com/${key}`);
    const queryFile = createFile({ key: privateKey });
    const { fileContext, fileRegistrar } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [],
      scope,
      maxFiles: 20,
      getPreviewUrl
    });

    await runWithContext(
      {
        mcpClientMemory: {},
        fileContext,
        fileRegistrar
      },
      () =>
        runWithDerivedWorkflowFileContext({
          files: [queryFile.file!.url],
          fn: async () => {
            const ref = await getWorkflowFileRegistrar()?.registerInputFile({
              file: {
                key: interactiveKey,
                name: 'interactive.pdf',
                type: ChatFileTypeEnum.file
              },
              source: 'interactive'
            });

            expect(ref).toBeDefined();
            expect(getWorkflowFileContext()?.resolve(ref!.modelUrl)).toBe(ref);
          }
        })
    );
  });

  it('rejects invalid query URLs and configured non-whitelisted domains', async () => {
    await expect(
      prepareWorkflowFileContext({
        query: [createFile({ key: undefined, url: '/api/system/file/d/legacy' })],
        histories: [],
        scope,
        maxFiles: 20,
        getPreviewUrl: vi.fn()
      })
    ).rejects.toThrow('Invalid workflow file URL');

    global.systemEnv = { fileUrlWhitelist: ['allowed.example.com'] } as any;
    await expect(
      prepareWorkflowFileContext({
        query: [createFile({ key: undefined, url: 'https://blocked.example.com/a.pdf' })],
        histories: [],
        scope,
        maxFiles: 20,
        getPreviewUrl: vi.fn()
      })
    ).rejects.toThrow('Invalid workflow file URL');
  });

  it('reads private objects through S3 with metadata and stream size limits', async () => {
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
      maxFiles: 20,
      maxFileSize: 5,
      getPreviewUrl: vi.fn().mockResolvedValue('https://files.example.com/signed')
    });
    const ref = fileContext.resolve('https://files.example.com/signed')!;

    await expect(fileContext.read(ref)).resolves.toEqual({
      buffer: Buffer.from('hello'),
      filename: 'report.pdf',
      contentType: 'application/pdf',
      sourceKind: 'internal',
      imageParsePrefix: 'chat/app/app-1/user-1/chat-1/report-parsed'
    });
    expect(downloadObject).toHaveBeenCalledWith({ key: privateKey });

    getObjectMetadata.mockResolvedValueOnce({ contentLength: 6, metadata: {} });
    await expect(fileContext.read(ref)).rejects.toThrow('maximum allowed size');
  });

  it('reads external files through the SSRF axios and enforces streamed size', async () => {
    const { fileContext } = await prepareWorkflowFileContext({
      query: [createFile({ key: undefined, url: 'https://cdn.example.com/report.pdf' })],
      histories: [],
      scope,
      maxFiles: 20,
      maxFileSize: 5,
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

    await expect(fileContext.read(ref)).resolves.toEqual({
      buffer: Buffer.from('hello'),
      filename: 'external.pdf',
      contentType: 'application/pdf',
      sourceKind: 'external'
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
    await expect(fileContext.read(ref)).rejects.toThrow('maximum allowed size');
    expect(destroySpy).toHaveBeenCalled();

    axiosGetMock.mockResolvedValueOnce({
      data: Readable.from([Buffer.from('123'), Buffer.from('456')]),
      headers: {}
    });
    await expect(fileContext.read(ref)).rejects.toThrow('maximum allowed size');
  });

  it('rejects refs that were not created by the current context', async () => {
    const { fileContext } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFiles: 20,
      getPreviewUrl: vi.fn()
    });

    await expect(
      fileContext.read({
        id: 'forged',
        name: 'forged.pdf',
        type: ChatFileTypeEnum.file,
        modelUrl: 'https://evil.example.com/a.pdf',
        source: { type: 'externalHttp', url: 'https://evil.example.com/a.pdf' }
      })
    ).rejects.toThrow('not registered');
  });

  it('keeps the readonly context across the workflow async call chain', async () => {
    const { fileContext } = await prepareWorkflowFileContext({
      query: [createFile({ key: undefined, url: 'https://cdn.example.com/report.pdf' })],
      histories: [],
      scope,
      maxFiles: 20,
      getPreviewUrl: vi.fn()
    });

    expect(getWorkflowFileContext()).toBeUndefined();
    await runWithContext(
      {
        mcpClientMemory: {},
        fileContext
      },
      async () => {
        await Promise.resolve();
        expect(getWorkflowFileContext()).toBe(fileContext);
      }
    );
    expect(getWorkflowFileContext()).toBeUndefined();
  });

  it('uses the same workflow size limit for registered and unregistered URLs', async () => {
    const contextRead = vi.fn().mockResolvedValue({ buffer: Buffer.from('internal') });
    axiosGetMock.mockResolvedValueOnce({
      data: Readable.from([Buffer.from('outside')]),
      headers: {}
    });
    const fileContext = {
      limits: { maxFiles: 20, maxBytesPerFile: 7 },
      resolve: vi.fn((url: string) =>
        url === 'https://files.example.com/registered' ? ({ id: 'registered' } as any) : undefined
      ),
      read: contextRead
    } as any;

    await runWithContext(
      {
        mcpClientMemory: {},
        fileContext
      },
      async () => {
        await expect(
          readWorkflowFileBuffer({
            url: 'https://files.example.com/registered'
          })
        ).resolves.toEqual(Buffer.from('internal'));
        await expect(
          readWorkflowFileBuffer({
            url: 'https://node.example.com/generated.pdf'
          })
        ).resolves.toEqual(Buffer.from('outside'));
      }
    );

    expect(contextRead).toHaveBeenCalledTimes(1);
    expect(axiosGetMock).toHaveBeenCalledWith(
      'https://node.example.com/generated.pdf',
      expect.objectContaining({ maxContentLength: 7, responseType: 'stream' })
    );
  });
});
