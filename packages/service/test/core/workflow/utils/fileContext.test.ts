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
  filterWorkflowQueryFiles,
  getWorkflowFileAmountLimits
} from '@fastgpt/service/core/workflow/utils/fileLimits';
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

describe('filterWorkflowQueryFiles', () => {
  const textItem: UserChatItemValueItemType = { text: { content: 'question' } };
  const firstFile = createFile({ name: 'first.pdf' });
  const secondFile = createFile({ name: 'second.pdf' });

  it('keeps non-file inputs and only the first files within the limit', () => {
    expect(
      filterWorkflowQueryFiles({
        query: [firstFile, textItem, secondFile],
        maxFileAmount: 1
      })
    ).toEqual([firstFile, textItem]);
  });

  it('removes all file inputs when the limit is zero', () => {
    expect(
      filterWorkflowQueryFiles({
        query: [firstFile, textItem, secondFile],
        maxFileAmount: 0
      })
    ).toEqual([textItem]);
  });
});

describe('getWorkflowFileAmountLimits', () => {
  it('uses the team plan for Context and the app config for query uploads', () => {
    expect(
      getWorkflowFileAmountLimits({
        teamMaxFileAmount: 100,
        systemMaxFileAmount: 1000,
        queryMaxFileAmount: 3
      })
    ).toEqual({
      maxFileAmount: 100,
      queryMaxFileAmount: 3
    });
  });

  it('falls back to the system limit and then uses it for an unconfigured query', () => {
    expect(
      getWorkflowFileAmountLimits({
        systemMaxFileAmount: 1000
      })
    ).toEqual({
      maxFileAmount: 1000,
      queryMaxFileAmount: 1000
    });
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
    const preparedFile = (histories[0].value[0] as UserChatItemValueItemType).file;
    expect(preparedFile?.key).toBeUndefined();
    expect(preparedFile?.url).toBe('');
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
    const preparedFile = (histories[0].value[0] as UserChatItemValueItemType).file;
    expect(fileContext.resolve(invalidHistoryFile.file!.url)).toBeUndefined();
    expect(preparedFile?.url).toBe('');
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

  it('does not let a conflicting URL bypass an unknown child private key', async () => {
    const queryFile = createFile({ key: privateKey });
    const { fileContext } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [],
      scope,
      maxFileAmount: 20,
      getPreviewUrl: vi.fn().mockResolvedValue('https://files.example.com/selected')
    });

    expect(() =>
      fileContext.derive([
        {
          key: 'chat/app/app-1/user-1/other-chat/unknown.pdf',
          url: queryFile.file!.url,
          name: 'unknown.pdf',
          type: ChatFileTypeEnum.file
        }
      ])
    ).toThrow('not registered in the parent context');
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

  it('keeps the parent model URL when a child variable restores its private key', async () => {
    const getPreviewUrl = vi.fn().mockResolvedValue('https://files.example.com/parent-signed');
    const { fileContext, fileRegistrar } = await prepareWorkflowFileContext({
      query: [createFile({ key: privateKey })],
      histories: [],
      scope,
      maxFileAmount: 20,
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

  it('only suppresses child variable files explicitly truncated by the workflow limit', async () => {
    const parentUrl = 'https://files.example.com/parent-signed';
    const overflowUrl = 'https://external.example.com/overflow.pdf';
    const { fileContext, fileRegistrar } = await prepareWorkflowFileContext({
      query: [createFile({ key: privateKey })],
      histories: [],
      scope,
      maxFileAmount: 1,
      getPreviewUrl: vi.fn().mockResolvedValue(parentUrl)
    });

    await runWithContext(
      {
        mcpClientMemory: {},
        fileContext,
        fileRegistrar
      },
      () =>
        runWithDerivedWorkflowFileContext({
          files: [parentUrl, overflowUrl],
          fn: async ({ resolveInputFile }) => {
            await expect(
              resolveInputFile?.({
                url: overflowUrl,
                name: 'overflow.pdf',
                type: ChatFileTypeEnum.file
              })
            ).resolves.toBeUndefined();
            await expect(
              resolveInputFile?.({
                url: 'https://external.example.com/unlisted.pdf',
                name: 'unlisted.pdf',
                type: ChatFileTypeEnum.file
              })
            ).rejects.toThrow('not selected in its file context');
          }
        })
    );
  });

  it('adds child interactive files to the active derived context', async () => {
    const interactiveKey = 'chat/app/app-1/user-1/chat-1/interactive.pdf';
    const getPreviewUrl = vi.fn(async (key: string) => `https://files.example.com/${key}`);
    const queryFile = createFile({ key: privateKey });
    const { fileContext, fileRegistrar, query } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [],
      scope,
      maxFileAmount: 20,
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
          files: [query[0].file!.url],
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

  it('deduplicates child inputs before silently enforcing the workflow file limit', async () => {
    const getPreviewUrl = vi.fn(async (key: string) => `https://files.example.com/${key}`);
    const queryFile = createFile({ key: privateKey });
    const { fileContext, fileRegistrar, query } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [],
      scope,
      maxFileAmount: 2,
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
          files: [query[0].file!.url, query[0].file!.url],
          fn: async () => {
            const acceptedRef = await getWorkflowFileRegistrar()?.registerInputFile({
              file: {
                url: 'https://external.example.com/accepted.pdf',
                name: 'accepted.pdf',
                type: ChatFileTypeEnum.file
              },
              source: 'interactive'
            });
            const overflowRef = await getWorkflowFileRegistrar()?.registerInputFile({
              file: {
                url: 'https://external.example.com/overflow.pdf',
                name: 'overflow.pdf',
                type: ChatFileTypeEnum.file
              },
              source: 'interactive'
            });

            expect(acceptedRef).toBeDefined();
            expect(overflowRef).toBeUndefined();
            expect(
              getWorkflowFileContext()?.resolve('https://external.example.com/accepted.pdf')
            ).toBe(acceptedRef);
            expect(
              getWorkflowFileContext()?.resolve('https://external.example.com/overflow.pdf')
            ).toBeUndefined();
          }
        })
    );

    expect(getPreviewUrl).toHaveBeenCalledTimes(1);
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
      maxFileAmount: 20,
      maxBytesPerFile: 5,
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
      maxFileAmount: 20,
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
      maxFileAmount: 20,
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
      limits: { maxFileAmount: 20, maxBytesPerFile: 7 },
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

  it('filters child payload before deriving its file context', async () => {
    const queryFile = createFile({ key: undefined, url: 'https://files.example.com/query.pdf' });
    const explicitFile = 'https://files.example.com/variable.pdf';
    const historyFile = createFile({
      key: undefined,
      url: 'https://files.example.com/history.pdf'
    });
    const { fileContext, fileRegistrar } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [createHistory(historyFile)],
      scope,
      maxFileAmount: 2,
      getPreviewUrl: vi.fn()
    });

    await runWithContext({ mcpClientMemory: {}, fileContext, fileRegistrar }, () =>
      runWithDerivedWorkflowFileContext({
        query: [queryFile],
        histories: [createHistory(historyFile)],
        files: [explicitFile],
        fn: async ({ query, histories, filterFiles }) => {
          expect(query).toEqual([queryFile]);
          expect(histories[0].value).toEqual([]);
          expect(filterFiles([explicitFile])).toEqual([explicitFile]);
          expect(getWorkflowFileContext()?.resolve(explicitFile)).toBeDefined();
          expect(
            getWorkflowFileContext()?.resolve('https://files.example.com/history.pdf')
          ).toBeUndefined();
        }
      })
    );
  });

  it('serializes concurrent child registrations before checking capacity', async () => {
    const queryFile = createFile({ key: undefined, url: 'https://files.example.com/query.pdf' });
    const { fileContext, fileRegistrar } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [],
      scope,
      maxFileAmount: 2,
      getPreviewUrl: vi.fn()
    });

    await runWithContext({ mcpClientMemory: {}, fileContext, fileRegistrar }, () =>
      runWithDerivedWorkflowFileContext({
        query: [queryFile],
        files: [],
        fn: async () => {
          const registrar = getWorkflowFileRegistrar()!;
          const registrations = await Promise.all([
            registrar.registerInputFile({
              file: {
                url: 'https://files.example.com/first.pdf',
                type: ChatFileTypeEnum.file
              },
              source: 'interactive'
            }),
            registrar.registerInputFile({
              file: {
                url: 'https://files.example.com/second.pdf',
                type: ChatFileTypeEnum.file
              },
              source: 'interactive'
            })
          ]);

          expect(registrations.filter(Boolean)).toHaveLength(1);
        }
      })
    );
  });

  it('isolates child inputs when no parent file context exists', async () => {
    const query = [createFile({ url: 'https://files.example.com/query.pdf' })];
    const histories = [createHistory(createFile({ url: 'https://files.example.com/history.pdf' }))];
    const files = ['https://files.example.com/variable.pdf'];

    await expect(
      runWithDerivedWorkflowFileContext({
        query,
        histories,
        files,
        fn: async ({
          resolveInputFile,
          query: childQuery,
          histories: childHistories,
          filterFiles
        }) => {
          expect(resolveInputFile).toBeUndefined();
          expect(childQuery).toEqual(query);
          expect(childQuery).not.toBe(query);
          expect(childQuery[0]).not.toBe(query[0]);
          expect(childQuery[0].file).not.toBe(query[0].file);
          expect(childHistories).toEqual(histories);
          expect(childHistories).not.toBe(histories);
          expect(childHistories[0]).not.toBe(histories[0]);
          expect(childHistories[0].value[0]).not.toBe(histories[0].value[0]);
          const childFiles = filterFiles(files);
          expect(childFiles).toEqual(files);
          expect(childFiles).not.toBe(files);
          return 'completed';
        }
      })
    ).resolves.toBe('completed');
  });

  it('selects recent history files first while preserving history order', async () => {
    const oldFile = createFile({ url: 'https://files.example.com/old.pdf' });
    const recentFile = createFile({ url: 'https://files.example.com/recent.pdf' });
    const assistantHistory = {
      obj: ChatRoleEnum.AI,
      value: [{ text: { content: 'answer' } }]
    } as ChatItemMiniType;
    const histories = [createHistory(oldFile), assistantHistory, createHistory(recentFile)];
    const { fileContext } = await prepareWorkflowFileContext({
      query: [],
      histories,
      scope,
      maxFileAmount: 1,
      getPreviewUrl: vi.fn()
    });

    await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      runWithDerivedWorkflowFileContext({
        histories,
        files: [],
        fn: async ({ histories: childHistories }) => {
          expect(childHistories).toHaveLength(3);
          expect(childHistories[0].value).toEqual([]);
          expect(childHistories[1]).not.toBe(assistantHistory);
          expect(childHistories[1]).toEqual(assistantHistory);
          expect(childHistories[2].value).toEqual([recentFile]);
          expect(
            getWorkflowFileContext()?.resolve('https://files.example.com/old.pdf')
          ).toBeUndefined();
          expect(
            getWorkflowFileContext()?.resolve('https://files.example.com/recent.pdf')
          ).toBeDefined();
        }
      })
    );
  });

  it('does not expose parent chat or file object references to a child workflow', async () => {
    const query = [createFile({ url: 'https://files.example.com/query.pdf' })];
    const histories = [createHistory(createFile({ url: 'https://files.example.com/history.pdf' }))];
    const files = [
      {
        url: 'https://files.example.com/variable.pdf',
        name: 'variable.pdf',
        type: ChatFileTypeEnum.file
      }
    ];
    const { fileContext } = await prepareWorkflowFileContext({
      query,
      histories,
      scope,
      maxFileAmount: 3,
      getPreviewUrl: vi.fn()
    });

    await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      runWithDerivedWorkflowFileContext({
        query,
        histories,
        files,
        fn: async ({ query: childQuery, histories: childHistories, filterFiles }) => {
          const childFiles = filterFiles(files);

          expect(childQuery[0]).not.toBe(query[0]);
          expect(childQuery[0].file).not.toBe(query[0].file);
          expect(childHistories[0]).not.toBe(histories[0]);
          expect(childHistories[0].value[0]).not.toBe(histories[0].value[0]);
          expect(childFiles[0]).not.toBe(files[0]);

          childQuery[0].file!.url = 'https://child.example.com/query.pdf';
          (childHistories[0].value[0] as UserChatItemValueItemType).file!.url =
            'https://child.example.com/history.pdf';
          (childFiles[0] as (typeof files)[number]).url = 'https://child.example.com/variable.pdf';
        }
      })
    );

    expect(query[0].file?.url).toBe('https://files.example.com/query.pdf');
    expect((histories[0].value[0] as UserChatItemValueItemType).file?.url).toBe(
      'https://files.example.com/history.pdf'
    );
    expect(files[0].url).toBe('https://files.example.com/variable.pdf');
  });

  it('does not expose a child registrar when the parent has none', async () => {
    const { fileContext } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFileAmount: 1,
      getPreviewUrl: vi.fn()
    });

    await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      runWithDerivedWorkflowFileContext({
        files: [],
        fn: async () => {
          expect(getWorkflowFileRegistrar()).toBeUndefined();
        }
      })
    );
  });

  it('keeps the child context unchanged when the parent registrar rejects a file', async () => {
    const rejectedUrl = 'https://files.example.com/rejected.pdf';
    const { fileContext } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFileAmount: 1,
      getPreviewUrl: vi.fn()
    });
    const registerInputFile = vi.fn().mockResolvedValue(undefined);

    await runWithContext(
      {
        mcpClientMemory: {},
        fileContext,
        fileRegistrar: { registerInputFile }
      },
      () =>
        runWithDerivedWorkflowFileContext({
          files: [],
          fn: async () => {
            await expect(
              getWorkflowFileRegistrar()?.registerInputFile({
                file: { url: rejectedUrl, type: ChatFileTypeEnum.file },
                source: 'interactive'
              })
            ).resolves.toBeUndefined();
            expect(getWorkflowFileContext()?.resolve(rejectedUrl)).toBeUndefined();
          }
        })
    );

    expect(registerInputFile).toHaveBeenCalledTimes(1);
  });

  it('identifies and suppresses an unregistered keyed file rejected by a zero limit', async () => {
    const keyedFile = {
      key: 'chat/app/app-1/user-1/chat-1/unregistered.pdf',
      name: 'unregistered.pdf',
      type: ChatFileTypeEnum.file
    };
    const { fileContext } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFileAmount: 0,
      getPreviewUrl: vi.fn()
    });

    await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      runWithDerivedWorkflowFileContext({
        files: [keyedFile],
        fn: async ({ resolveInputFile }) => {
          await expect(resolveInputFile?.(keyedFile)).resolves.toBeUndefined();
        }
      })
    );
  });

  it('continues processing registrations after the parent registrar throws', async () => {
    const acceptedUrl = 'https://files.example.com/accepted-after-error.pdf';
    const { fileContext } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFileAmount: 1,
      getPreviewUrl: vi.fn()
    });
    const acceptedRef = {
      name: 'accepted-after-error.pdf',
      type: ChatFileTypeEnum.file,
      modelUrl: acceptedUrl,
      source: { type: 'externalHttp' as const, url: acceptedUrl }
    };
    const registerInputFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('registration failed'))
      .mockResolvedValueOnce(acceptedRef);

    await runWithContext(
      {
        mcpClientMemory: {},
        fileContext,
        fileRegistrar: { registerInputFile }
      },
      () =>
        runWithDerivedWorkflowFileContext({
          files: [],
          fn: async () => {
            const registrar = getWorkflowFileRegistrar()!;
            await expect(
              registrar.registerInputFile({
                file: {
                  url: 'https://files.example.com/failed.pdf',
                  type: ChatFileTypeEnum.file
                },
                source: 'interactive'
              })
            ).rejects.toThrow('registration failed');

            await expect(
              registrar.registerInputFile({
                file: { url: acceptedUrl, type: ChatFileTypeEnum.file },
                source: 'interactive'
              })
            ).resolves.toBe(acceptedRef);
            expect(getWorkflowFileContext()?.resolve(acceptedUrl)).toBeDefined();
          }
        })
    );

    expect(registerInputFile).toHaveBeenCalledTimes(2);
  });

  it('reuses an existing child ref without invoking the parent registrar', async () => {
    const fileUrl = 'https://files.example.com/existing.pdf';
    const queryFile = createFile({ url: fileUrl });
    const { fileContext, fileRegistrar } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [],
      scope,
      maxFileAmount: 2,
      getPreviewUrl: vi.fn()
    });
    const parentRegisterSpy = vi.spyOn(fileRegistrar, 'registerInputFile');

    await runWithContext({ mcpClientMemory: {}, fileContext, fileRegistrar }, () =>
      runWithDerivedWorkflowFileContext({
        query: [queryFile],
        files: [],
        fn: async () => {
          const ref = await getWorkflowFileRegistrar()?.registerInputFile({
            file: queryFile.file!,
            source: 'interactive'
          });

          expect(ref).toBe(getWorkflowFileContext()?.resolve(fileUrl));
        }
      })
    );

    expect(parentRegisterSpy).not.toHaveBeenCalled();
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
