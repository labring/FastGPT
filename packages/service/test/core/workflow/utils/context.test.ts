import { Readable } from 'node:stream';
import { axios } from '@fastgpt/service/common/api/axios';
import {
  ChatFileTypeEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { prepareWorkflowFileContext } from '@fastgpt/service/core/workflow/utils/fileContext';
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runWithContext,
  getWorkflowContext,
  updateWorkflowContextVal,
  getWorkflowFileContext,
  getWorkflowFileMaxAmount,
  getWorkflowResourceContext,
  getWorkflowFileRegistrar,
  readWorkflowFileBuffer,
  prepareWorkflowFiles,
  runWithDerivedWorkflowFileContext
} from '../../../../core/workflow/utils/context';

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

describe('runWithDerivedWorkflowFileContext', () => {
  const prepare = () =>
    prepareWorkflowFileContext({ query: [], histories: [], scope, maxFileAmount: 20 });
  let savedEnv: typeof global.systemEnv;
  beforeEach(() => {
    savedEnv = global.systemEnv;
    global.systemEnv = { ...savedEnv, fileUrlWhitelist: [] };
    vi.spyOn(axios, 'head').mockResolvedValue({ headers: { 'content-type': 'image/png' } });
    vi.spyOn(axios, 'get').mockResolvedValue({ headers: {}, data: Readable.from([]) });
  });
  afterEach(() => {
    global.systemEnv = savedEnv;
    vi.restoreAllMocks();
  });
  it.each([
    ['none', 'replace'],
    ['none', 'inherit'],
    ['store', 'replace'],
    ['store', 'inherit'],
    ['files', 'replace'],
    ['files', 'inherit']
  ])('资源快照可独立于文件 Context 替换或继承（%s/%s）', async (parentKind, mode) => {
    const originalResource = { isRoot: true, resourceMap: new Map() };
    const childResource = { isRoot: false, resourceMap: new Map() };
    const { fileContext } = await prepare();
    const parent = {
      mcpClientMemory: {},
      resourceContext: originalResource,
      fileContext: parentKind === 'files' ? fileContext : undefined
    };
    const run = () =>
      runWithDerivedWorkflowFileContext({
        files: [],
        resourceContext: mode === 'inherit' ? undefined : childResource,
        query: [{ text: { content: 'query' } }],
        histories: [createHistory({ text: { content: 'history' } })],
        fn: async ({ query, histories, filterFiles }) => {
          expect(getWorkflowResourceContext()).toBe(
            mode === 'inherit'
              ? parentKind === 'none'
                ? undefined
                : originalResource
              : childResource
          );
          expect(query[0].text?.content).toBe('query');
          expect(histories[0].value[0]).toEqual({ text: { content: 'history' } });
          expect(filterFiles([{}])).toEqual(parentKind === 'files' ? [] : [{}]);
        }
      });
    if (parentKind === 'none') await run();
    else await runWithContext(parent, run);
    expect(parent.resourceContext).toBe(originalResource);
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

  it('normalizes child query and history using its registered classifications', async () => {
    const { fileContext } = await prepare();
    const file = createFile({ url: 'https://files.example.com/child-opaque' });
    await runWithContext({ fileContext, mcpClientMemory: {} }, () =>
      runWithDerivedWorkflowFileContext({
        query: [file],
        histories: [createHistory(file)],
        files: [],
        fn: async ({ query, histories }) => {
          expect(query[0].file?.type).toBe(ChatFileTypeEnum.image);
          expect(histories[0].value[0]).toMatchObject({ file: { type: ChatFileTypeEnum.image } });
        }
      })
    );
    expect(vi.mocked(axios.head)).toHaveBeenCalledTimes(1);
    expect(fileContext.resolve(file.file!.url)).toBeUndefined();
  });
});

describe('getWorkflowFileContext', () => {
  beforeEach(() => {
    vi.spyOn(axios, 'get').mockResolvedValue({ headers: {}, data: Readable.from([]) });
  });
  afterEach(() => vi.restoreAllMocks());
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
});

describe('readWorkflowFileBuffer', () => {
  beforeEach(() => {
    vi.spyOn(axios, 'get').mockResolvedValue({ headers: {}, data: Readable.from([]) });
  });
  afterEach(() => vi.restoreAllMocks());
  it('无 Workflow Context 时使用系统大小额度读取外链', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      headers: {},
      data: Readable.from([Buffer.from('body')])
    });
    expect(await readWorkflowFileBuffer({ url: 'https://files.example.com/report.txt' })).toEqual(
      Buffer.from('body')
    );
  });

  it('uses the same workflow size limit for registered and unregistered URLs', async () => {
    const contextGetSource = vi.fn().mockResolvedValue({
      source: {
        kind: 's3',
        sizeBytes: 8,
        metadata: { filename: 'internal.txt' },
        materialize: vi.fn().mockResolvedValue({
          buffer: Buffer.from('internal'),
          metadata: { filename: 'internal.txt' }
        })
      },
      sourceKind: 'internal'
    });
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: Readable.from([Buffer.from('outside')]),
      headers: {}
    });
    const fileContext = {
      limits: { maxFileAmount: 20, maxBytesPerFile: 7 },
      resolve: vi.fn((url: string) =>
        url === 'https://files.example.com/registered' ? ({ id: 'registered' } as any) : undefined
      ),
      getSource: contextGetSource
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

    expect(contextGetSource).toHaveBeenCalledTimes(1);
    expect(vi.mocked(axios.get)).toHaveBeenCalledWith(
      'https://node.example.com/generated.pdf',
      expect.objectContaining({ maxContentLength: 7, responseType: 'stream' })
    );
  });
});

describe('getWorkflowFileMaxAmount', () => {
  it('无 Context 抛出明确错误，已配置的零额度原样返回', async () => {
    expect(() => getWorkflowFileMaxAmount()).toThrow('Workflow file context is unavailable');
    const { fileContext } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFileAmount: 0
    });
    runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      expect(getWorkflowFileMaxAmount()).toBe(0)
    );
  });
});

describe('prepareWorkflowFiles', () => {
  it.each([
    [false, undefined, undefined, 3],
    [false, undefined, false, 2],
    [true, undefined, undefined, 1],
    [true, 0, undefined, 0],
    [true, 3, true, 3]
  ])(
    '组合 Context 额度和 Data URL 默认值（%s/%s/%s）',
    async (withContext, maxFiles, allowDataUrl, count) => {
      const files = [
        { url: 'https://files.example.com/a.pdf' },
        { url: 'https://files.example.com/b.pdf' },
        { url: 'data:image/png;base64,abc' }
      ];
      const { fileContext } = await prepareWorkflowFileContext({
        query: [],
        histories: [],
        scope,
        maxFileAmount: 1
      });
      const result = await runWithContext(
        { mcpClientMemory: {}, fileContext: withContext ? fileContext : undefined },
        () => prepareWorkflowFiles({ files, maxFiles, allowDataUrl })
      );
      expect(result).toHaveLength(count);
      if (withContext && count)
        expect(fileContext.resolve(files[0].url)?.type).toBe(ChatFileTypeEnum.file);
    }
  );
});
