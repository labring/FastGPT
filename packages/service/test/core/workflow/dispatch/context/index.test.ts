import { Readable } from 'node:stream';
import { axios } from '@fastgpt/service/common/api/axios';
import {
  ChatFileTypeEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { prepareWorkflowFileContext } from '@fastgpt/service/core/workflow/dispatch/context/file';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/context/variables';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import {
  createTestWorkflowFileContext,
  createTestVariableContext,
  createTestRuntimeControl
} from './fixtures';

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
  getWorkflowContext,
  updateWorkflowContextVal,
  getWorkflowFileContext,
  getWorkflowResourceContext,
  runWithDerivedWorkflowFileContext,
  runWithContext as runWithRequiredContext
} from '../../../../../core/workflow/dispatch/context';
import {
  runWithTestWorkflowContext as runWithContext,
  createTestNodeResponseContext
} from '@fastgpt/service/test/core/workflow/dispatch/context/fixtures';

const createWorkflowContext = async () => ({
  runtimeControl: createTestRuntimeControl(),
  checkIsStopping: () => false,
  mcpClientMemory: {},
  nodeResponseSink: createTestNodeResponseContext(),
  fileContext: await createTestWorkflowFileContext()
});

describe('WorkflowContext', () => {
  describe('getChildContext', () => {
    it('空覆盖只创建新 Context，继承能力引用，不激活作用域也不自动克隆变量', async () => {
      const context = await createWorkflowContext();
      const variables = createTestVariableContext({ value: 'shared' });
      const sink = createTestNodeResponseContext({ publish: vi.fn(async () => []) });
      const resourceContext = { teamId: 'team', isRoot: false, resourceMap: new Map() };
      const parent = runWithRequiredContext(
        { ...context, variableContext: variables, nodeResponseSink: sink, resourceContext },
        (current) => current
      );

      // 派生仅依赖 Context 对象，本身无需激活 ALS。
      const child = parent.getChildContext();
      expect(child).not.toBe(parent);
      expect(child.checkIsStopping).toBe(parent.checkIsStopping);
      expect(child.mcpClientMemory).toBe(parent.mcpClientMemory);
      expect(child.fileContext).toBe(parent.fileContext);
      expect(child.variableContext).toBe(variables);
      expect(child.nodeResponseSink).toBe(sink);
      expect(child.resourceContext).toBe(resourceContext);
      expect(child.runtimeControl).toEqual(parent.runtimeControl);
      expect(child.runtimeControl).not.toBe(parent.runtimeControl);
      expect(() => getWorkflowContext()).toThrow('Workflow context is unavailable');
      await child.variableContext.set('value', 'shared-write');
      expect(parent.variableContext.get('value')).toBe('shared-write');
    });

    it('一次覆盖多个字段，未激活前父作用域不变，可选依赖显式 undefined 清空', async () => {
      const context = await createWorkflowContext();
      const parentVariables = createTestVariableContext({ value: 'parent' });
      const childVariables = parentVariables.clone();
      const childFileContext = await context.fileContext.derive([]);
      const sink = createTestNodeResponseContext({ publish: vi.fn(async () => []) });
      const resourceContext = { teamId: 'team', isRoot: false, resourceMap: new Map() };

      await runWithRequiredContext(
        { ...context, variableContext: parentVariables, nodeResponseSink: sink, resourceContext },
        async (parent) => {
          const child = parent.getChildContext({
            fileContext: childFileContext,
            variableContext: childVariables,
            nodeResponseSink: createTestNodeResponseContext(),
            resourceContext: undefined
          });
          expect(getWorkflowContext()).toBe(parent);
          await runWithRequiredContext(child, async (current) => {
            expect(current).toBe(child);
            expect(getWorkflowContext()).toBe(child);
            expect(current.fileContext).toBe(childFileContext);
            expect(current.variableContext).toBe(childVariables);
            expect(current.nodeResponseSink.hasOutput).toBe(false);
            expect(current.resourceContext).toBeUndefined();
            await current.variableContext.set('value', 'child');
          });
          expect(getWorkflowContext()).toBe(parent);
          expect(parent.fileContext).toBe(context.fileContext);
          expect(parent.variableContext.get('value')).toBe('parent');
          expect(parent.nodeResponseSink).toBe(sink);
          expect(parent.resourceContext).toBe(resourceContext);
        }
      );
    });

    it('多级派生继承当前子 Context，不回退到最初的父 Context', async () => {
      const context = await createWorkflowContext();
      await runWithContext(context, async (parent) => {
        const variables = createTestVariableContext({ value: 'child' });
        const childFileContext = await parent.fileContext.derive([]);
        const child = parent.getChildContext({
          variableContext: variables,
          fileContext: childFileContext
        });
        const sink = createTestNodeResponseContext({ publish: vi.fn(async () => []) });
        const grandchild = child.getChildContext({ nodeResponseSink: sink });
        const sibling = child.getChildContext({
          nodeResponseSink: createTestNodeResponseContext()
        });
        expect(grandchild.variableContext).toBe(variables);
        expect(grandchild.fileContext).toBe(childFileContext);
        expect(grandchild.nodeResponseSink).toBe(sink);
        expect(sibling.variableContext).toBe(variables);
        expect(sibling.nodeResponseSink.hasOutput).toBe(false);
        expect(child.nodeResponseSink).toBe(parent.nodeResponseSink);
        expect(getWorkflowContext()).toBe(parent);
      });
    });

    it('必填能力不能通过 undefined 覆盖清空', async () => {
      const context = await createWorkflowContext();
      runWithContext(context, (parent) => {
        expect(() => parent.getChildContext({ fileContext: undefined })).toThrow(
          'Workflow file context is unavailable'
        );
        expect(() => parent.getChildContext({ variableContext: undefined })).toThrow(
          'Workflow variable context is unavailable'
        );
        expect(() => parent.getChildContext({ checkIsStopping: undefined })).toThrow(
          'Workflow stop checker is unavailable'
        );
        expect(() => parent.getChildContext({ nodeResponseSink: undefined })).toThrow(
          'Workflow node response context is unavailable'
        );
        expect(() => parent.getChildContext({ runtimeControl: undefined })).toThrow(
          'Workflow runtime control is unavailable'
        );
        expect(getWorkflowContext()).toBe(parent);
      });
    });
  });

  describe('runtimeControl', () => {
    it('读取时同样拒绝运行期间丢失的控制状态', async () => {
      const context = await createWorkflowContext();
      await runWithContext(context, (current) => {
        const control = current.runtimeControl;
        Reflect.deleteProperty(current, 'runtimeControl');
        try {
          expect(() => getWorkflowContext()).toThrow('Workflow runtime control is unavailable');
        } finally {
          current.runtimeControl = control;
        }
      });
    });

    it('缺失控制状态时拒绝启动，不隐式生成预算或运行模式', async () => {
      const context = await createWorkflowContext();
      const fn = vi.fn();
      const { runtimeControl: _runtimeControl, ...incomplete } = {
        ...context,
        variableContext: createTestVariableContext()
      };
      expect(() => runWithRequiredContext(incomplete as any, fn)).toThrow(
        'Workflow runtime control is unavailable'
      );
      expect(fn).not.toHaveBeenCalled();
    });

    it('按当前父级派生并局部覆盖，保留零预算且不共享深度或工具标记', async () => {
      const context = await createWorkflowContext();
      await runWithContext(context, (parent) => {
        parent.runtimeControl.maxRunTimes = 0;
        parent.runtimeControl.workflowDispatchDeep = 4;
        const child = parent.getChildContext({ runtimeControl: { isToolCall: true } });
        const grandchild = child.getChildContext();
        expect(child.runtimeControl).toEqual({
          mode: 'test',
          maxRunTimes: 0,
          workflowDispatchDeep: 4,
          isToolCall: true
        });
        expect(grandchild.runtimeControl).toEqual(child.runtimeControl);
        grandchild.runtimeControl.workflowDispatchDeep++;
        child.runtimeControl.maxRunTimes -= 0.1;
        expect(parent.runtimeControl).toMatchObject({
          maxRunTimes: 0,
          workflowDispatchDeep: 4,
          isToolCall: false
        });
        expect(child.runtimeControl.workflowDispatchDeep).toBe(4);
        expect(grandchild.runtimeControl.maxRunTimes).toBe(0);
      });
    });

    it('并行分支独立扣减快照预算，完成或抛错后恢复父级控制状态', async () => {
      const context = await createWorkflowContext();
      await runWithContext(context, async (parent) => {
        const initial = { ...parent.runtimeControl };
        const branches = [parent.getChildContext(), parent.getChildContext()];
        const results = await Promise.allSettled(
          branches.map((branch, index) =>
            runWithRequiredContext(branch, async () => {
              const control = getWorkflowContext().runtimeControl;
              control.maxRunTimes -= index + 1;
              control.workflowDispatchDeep++;
              await Promise.resolve();
              expect(getWorkflowContext().runtimeControl).toBe(control);
              if (index === 1) throw new Error('branch failed');
            })
          )
        );
        expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
        expect(branches.map((branch) => branch.runtimeControl.maxRunTimes)).toEqual([
          initial.maxRunTimes - 1,
          initial.maxRunTimes - 2
        ]);
        expect(getWorkflowContext()).toBe(parent);
        expect(parent.runtimeControl).toEqual(initial);
      });
    });
  });

  it('变量 Context 必填，缺失时不启动回调', async () => {
    const context = await createWorkflowContext();
    const fn = vi.fn();
    expect(() => runWithRequiredContext(context as any, fn)).toThrow(
      'Workflow variable context is unavailable'
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('响应 Context 缺失或不是完整 Scope 时，不启动执行', async () => {
    const context = await createWorkflowContext();
    const fn = vi.fn();
    for (const nodeResponseSink of [undefined, { publish: vi.fn() }]) {
      expect(() =>
        runWithRequiredContext(
          { ...context, variableContext: createTestVariableContext(), nodeResponseSink } as any,
          fn
        )
      ).toThrow('Workflow node response context is unavailable');
    }
    expect(fn).not.toHaveBeenCalled();
    runWithContext(context, () => {
      updateWorkflowContextVal({ nodeResponseSink: undefined });
      expect(() => getWorkflowContext()).toThrow('Workflow node response context is unavailable');
    });
  });

  it('运行 Context 的变量能力被错误清空时，getter 明确拒绝缺失依赖', async () => {
    const context = await createWorkflowContext();
    runWithContext(context, () => {
      updateWorkflowContextVal({ variableContext: undefined });
      expect(() => getWorkflowContext()).toThrow('Workflow variable context is unavailable');
    });
  });

  it('并发分支隔离变量 Context，抛错和返回后恢复父作用域', async () => {
    const context = await createWorkflowContext();
    const parent = createTestVariableContext({ value: 'parent' });
    const left = createTestVariableContext({ value: 'left' });
    const right = createTestVariableContext({ value: 'right' });

    await runWithRequiredContext({ ...context, variableContext: parent }, async () => {
      const results = await Promise.allSettled([
        runWithRequiredContext(
          getWorkflowContext().getChildContext({ variableContext: left }),
          async () => {
            await Promise.resolve();
            expect(getWorkflowContext().variableContext).toBe(left);
            expect(getWorkflowContext().fileContext).toBe(context.fileContext);
            await left.set('value', 'changed');
            throw new Error('branch failed');
          }
        ),
        runWithRequiredContext(
          getWorkflowContext().getChildContext({ variableContext: right }),
          async () => {
            await Promise.resolve();
            expect(getWorkflowContext().variableContext).toBe(right);
            return right.get('value');
          }
        )
      ]);
      expect(results[0].status).toBe('rejected');
      expect(results[1]).toEqual({ status: 'fulfilled', value: 'right' });
      expect(getWorkflowContext().variableContext).toBe(parent);
      expect(parent.get('value')).toBe('parent');
    });
    expect(getWorkflowFileContext()).toBeUndefined();
  });

  it('注入时缺少停止检查会明确失败，不启动节点回调', async () => {
    const fileContext = await createTestWorkflowFileContext();
    const fn = vi.fn();
    expect(() =>
      runWithContext({ mcpClientMemory: {}, fileContext, variableContext: {} } as any, fn)
    ).toThrow('Workflow stop checker is unavailable');
    expect(fn).not.toHaveBeenCalled();
  });

  describe('runWithContext / getWorkflowContext', () => {
    it('should provide context inside callback', async () => {
      const ctx = await createWorkflowContext();

      runWithContext(ctx, () => {
        const store = getWorkflowContext();
        expect(store).toBe(ctx);
      });
    });

    it('should throw a clear error outside of context', async () => {
      expect(() => getWorkflowContext()).toThrow('Workflow context is unavailable');
    });

    it('should isolate nested contexts', async () => {
      const outer = await createWorkflowContext();
      const inner = await createWorkflowContext();

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
      const ctx = await createWorkflowContext();

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
      const ctx = await createWorkflowContext();
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
      const ctx = await createWorkflowContext();

      runWithContext(ctx, () => {
        // Update with empty partial — no keys iterated
        updateWorkflowContextVal({});
        expect(getWorkflowContext()).toBe(ctx);
      });
    });
  });
});

describe('runWithDerivedWorkflowFileContext', () => {
  it('子流程继承同一个请求级停止检查，异步调用观察最新停止状态', async () => {
    let stopping = false;
    const checkIsStopping = () => stopping;
    const fileContext = await createTestWorkflowFileContext();
    await runWithContext(
      { checkIsStopping, mcpClientMemory: {}, fileContext, variableContext: {} as any },
      async () => {
        await runWithDerivedWorkflowFileContext({
          files: [],
          fn: async () => {
            expect(getWorkflowContext().checkIsStopping).toBe(checkIsStopping);
            expect(getWorkflowContext().checkIsStopping()).toBe(false);
            stopping = true;
            await Promise.resolve();
            expect(getWorkflowContext().checkIsStopping()).toBe(true);
          }
        });
        expect(getWorkflowContext().checkIsStopping).toBe(checkIsStopping);
      }
    );
  });

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
  it.each(['replace', 'inherit'])('空文件 Context 中资源快照可替换或继承（%s）', async (mode) => {
    const originalResource = { isRoot: true, resourceMap: new Map() };
    const childResource = { isRoot: false, resourceMap: new Map() };
    const { fileContext } = await prepare();
    const parent = {
      checkIsStopping: () => false,
      mcpClientMemory: {},
      resourceContext: originalResource,
      fileContext
    };
    const run = () =>
      runWithDerivedWorkflowFileContext({
        files: [],
        resourceContext: mode === 'inherit' ? undefined : childResource,
        query: [{ text: { content: 'query' } }],
        histories: [createHistory({ text: { content: 'history' } })],
        fn: async ({ query, histories, filterFiles }) => {
          expect(getWorkflowResourceContext()).toBe(
            mode === 'inherit' ? originalResource : childResource
          );
          expect(query[0].text?.content).toBe('query');
          expect(histories[0].value[0]).toEqual({ text: { content: 'history' } });
          expect(filterFiles([{}])).toEqual([]);
        }
      });
    await runWithContext(parent, run);
    expect(parent.resourceContext).toBe(originalResource);
  });

  it('keeps the parent model URL when a child variable restores its private key', async () => {
    const getPreviewUrl = vi.fn().mockResolvedValue('https://files.example.com/parent-signed');
    const { fileContext } = await prepareWorkflowFileContext({
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

    await runWithContext({ checkIsStopping: () => false, mcpClientMemory: {}, fileContext }, () =>
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
    const { fileContext } = await prepareWorkflowFileContext({
      query: [createFile({ key: privateKey })],
      histories: [],
      scope,
      maxFileAmount: 1,
      getPreviewUrl: vi.fn().mockResolvedValue(parentUrl)
    });

    await runWithContext({ checkIsStopping: () => false, mcpClientMemory: {}, fileContext }, () =>
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
    const { fileContext, query } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [],
      scope,
      maxFileAmount: 20,
      getPreviewUrl
    });

    await runWithContext({ checkIsStopping: () => false, mcpClientMemory: {}, fileContext }, () =>
      runWithDerivedWorkflowFileContext({
        files: [query[0].file!.url],
        fn: async () => {
          const ref = await getWorkflowContext().fileContext.register({
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
    const { fileContext, query } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [],
      scope,
      maxFileAmount: 2,
      getPreviewUrl
    });

    await runWithContext({ checkIsStopping: () => false, mcpClientMemory: {}, fileContext }, () =>
      runWithDerivedWorkflowFileContext({
        files: [query[0].file!.url, query[0].file!.url],
        fn: async () => {
          const acceptedRef = await getWorkflowContext().fileContext.register({
            file: {
              url: 'https://external.example.com/accepted.pdf',
              name: 'accepted.pdf',
              type: ChatFileTypeEnum.file
            },
            source: 'interactive'
          });
          const overflowRef = await getWorkflowContext().fileContext.register({
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
    const { fileContext } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [createHistory(historyFile)],
      scope,
      maxFileAmount: 2,
      getPreviewUrl: vi.fn()
    });

    await runWithContext({ checkIsStopping: () => false, mcpClientMemory: {}, fileContext }, () =>
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
    const { fileContext } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [],
      scope,
      maxFileAmount: 2,
      getPreviewUrl: vi.fn()
    });

    await runWithContext({ checkIsStopping: () => false, mcpClientMemory: {}, fileContext }, () =>
      runWithDerivedWorkflowFileContext({
        query: [queryFile],
        files: [],
        fn: async () => {
          const scopedFileContext = getWorkflowContext().fileContext;
          const registrations = await Promise.all([
            scopedFileContext.register({
              file: {
                url: 'https://files.example.com/first.pdf',
                type: ChatFileTypeEnum.file
              },
              source: 'interactive'
            }),
            scopedFileContext.register({
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

  it.each([undefined, { isRoot: false, resourceMap: new Map() }])(
    '无父运行上下文时拒绝派生，资源快照不能代替文件 Context',
    async (resourceContext) => {
      const fn = vi.fn();
      await expect(
        runWithDerivedWorkflowFileContext({
          resourceContext,
          files: [],
          fn
        })
      ).rejects.toThrow('Workflow context is unavailable');
      expect(fn).not.toHaveBeenCalled();
    }
  );

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

    await runWithContext({ checkIsStopping: () => false, mcpClientMemory: {}, fileContext }, () =>
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

    await runWithContext({ checkIsStopping: () => false, mcpClientMemory: {}, fileContext }, () =>
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

  it('拒绝从缺少登记能力的不完整父 Context 派生，不执行子流程', async () => {
    const { fileContext } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFileAmount: 1,
      getPreviewUrl: vi.fn()
    });

    const fn = vi.fn();
    await expect(
      runWithContext(
        {
          checkIsStopping: () => false,
          mcpClientMemory: {},
          fileContext: { ...fileContext, register: undefined } as any
        },
        () =>
          runWithDerivedWorkflowFileContext({
            files: [],
            fn
          })
      )
    ).rejects.toThrow('Workflow file registration is unavailable');
    expect(fn).not.toHaveBeenCalled();
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
        checkIsStopping: () => false,
        mcpClientMemory: {},
        fileContext: { ...fileContext, register: registerInputFile }
      },
      () =>
        runWithDerivedWorkflowFileContext({
          files: [],
          fn: async () => {
            await expect(
              getWorkflowContext().fileContext.register({
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

    await runWithContext({ checkIsStopping: () => false, mcpClientMemory: {}, fileContext }, () =>
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
    const acceptedRef = await fileContext.register({
      file: { url: acceptedUrl, type: ChatFileTypeEnum.file },
      source: 'interactive'
    });
    const registerInputFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('registration failed'))
      .mockResolvedValueOnce(acceptedRef);

    await runWithContext(
      {
        checkIsStopping: () => false,
        mcpClientMemory: {},
        fileContext: { ...fileContext, register: registerInputFile }
      },
      () =>
        runWithDerivedWorkflowFileContext({
          files: [],
          fn: async () => {
            const scopedFileContext = getWorkflowContext().fileContext;
            await expect(
              scopedFileContext.register({
                file: {
                  url: 'https://files.example.com/failed.pdf',
                  type: ChatFileTypeEnum.file
                },
                source: 'interactive'
              })
            ).rejects.toThrow('registration failed');

            await expect(
              scopedFileContext.register({
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
    const { fileContext } = await prepareWorkflowFileContext({
      query: [queryFile],
      histories: [],
      scope,
      maxFileAmount: 2,
      getPreviewUrl: vi.fn()
    });
    const parentRegisterSpy = vi.spyOn(fileContext, 'register');

    await runWithContext({ checkIsStopping: () => false, mcpClientMemory: {}, fileContext }, () =>
      runWithDerivedWorkflowFileContext({
        query: [queryFile],
        files: [],
        fn: async () => {
          const ref = await getWorkflowContext().fileContext.register({
            file: queryFile.file!,
            source: 'interactive'
          });

          expect(ref).toBe(getWorkflowFileContext()?.resolve(fileUrl));
        }
      })
    );

    expect(parentRegisterSpy).not.toHaveBeenCalled();
  });

  it('registration keeps the child Context reference and scoped capability stable', async () => {
    const getPreviewUrl = vi.fn(async () => 'https://signed.example.com/new-input.pdf');
    const { fileContext } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFileAmount: 1,
      getPreviewUrl
    });

    await runWithContext({ checkIsStopping: () => false, mcpClientMemory: {}, fileContext }, () =>
      runWithDerivedWorkflowFileContext({
        files: [],
        fn: async ({ filterFiles }) => {
          const childContext = getWorkflowContext().fileContext;
          const register = childContext.register;
          const ref = await register({
            file: { key: privateKey, name: 'report.pdf', type: ChatFileTypeEnum.file },
            source: 'interactive'
          });

          expect(ref).toBeDefined();
          expect(getWorkflowContext().fileContext).toBe(childContext);
          expect(childContext.register).toBe(register);
          expect(childContext.resolve(ref!.modelUrl)).toBe(ref);
          expect(filterFiles([ref!.modelUrl])).toEqual([ref!.modelUrl]);
          expect(fileContext.resolve(ref!.modelUrl)).toBe(ref);
          await expect(
            register({
              file: {
                key: 'chat/app/app-1/user-1/chat-1/overflow.pdf',
                name: 'overflow.pdf',
                type: ChatFileTypeEnum.file
              },
              source: 'interactive'
            })
          ).resolves.toBeUndefined();
        }
      })
    );
    expect(getPreviewUrl).toHaveBeenCalledTimes(1);
  });

  it('normalizes child query and history using its registered classifications', async () => {
    const { fileContext } = await prepare();
    const file = createFile({ url: 'https://files.example.com/child-opaque' });
    await runWithContext({ checkIsStopping: () => false, fileContext, mcpClientMemory: {} }, () =>
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
      { checkIsStopping: () => false, mcpClientMemory: {}, fileContext },
      async () => {
        await Promise.resolve();
        expect(getWorkflowFileContext()).toBe(fileContext);
      }
    );
    expect(getWorkflowFileContext()).toBeUndefined();
  });
});

describe('getWorkflowContext 文件上下文读取', () => {
  it('无 Workflow Context 时抛出明确错误', () => {
    expect(() => getWorkflowContext()).toThrow('Workflow context is unavailable');
  });

  it('拒绝注入缺少文件上下文的运行作用域，不启动回调', () => {
    const fn = vi.fn();
    expect(() =>
      runWithContext({ checkIsStopping: () => false, mcpClientMemory: {} } as any, fn)
    ).toThrow('Workflow file context is unavailable');
    expect(fn).not.toHaveBeenCalled();
  });

  it('文件数量限额未初始化时保留原有报错行为', () => {
    runWithContext(
      {
        checkIsStopping: () => false,
        mcpClientMemory: {},
        fileContext: { limits: { maxBytesPerFile: 1024 } } as any
      },
      () => {
        expect(() => getWorkflowContext().fileContext).toThrow(
          'Workflow file context is unavailable'
        );
      }
    );
  });

  it('跨异步调用返回同一个完整上下文，零额度和大小限额均原样保留', async () => {
    const { fileContext } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFileAmount: 0,
      maxBytesPerFile: 1024
    });
    await runWithContext(
      { checkIsStopping: () => false, mcpClientMemory: {}, fileContext },
      async () => {
        await Promise.resolve();
        const currentFileContext = getWorkflowContext().fileContext;
        expect(currentFileContext).toBe(fileContext);
        expect(currentFileContext.limits).toEqual({ maxFileAmount: 0, maxBytesPerFile: 1024 });
        expect(currentFileContext.getSource).toBe(fileContext.getSource);
      }
    );
    expect(() => getWorkflowContext()).toThrow('Workflow context is unavailable');
  });

  it('嵌套运行读取当前文件上下文，退出后恢复父上下文', async () => {
    const { fileContext: parentFileContext } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope,
      maxFileAmount: 5,
      maxBytesPerFile: 2048
    });
    const childFileContext = await parentFileContext.derive([]);

    runWithContext(
      { checkIsStopping: () => false, mcpClientMemory: {}, fileContext: parentFileContext },
      () => {
        expect(getWorkflowContext().fileContext).toBe(parentFileContext);
        runWithContext(
          { checkIsStopping: () => false, mcpClientMemory: {}, fileContext: childFileContext },
          () => {
            expect(getWorkflowContext().fileContext).toBe(childFileContext);
            expect(getWorkflowContext().fileContext.limits).toBe(parentFileContext.limits);
          }
        );
        expect(getWorkflowContext().fileContext).toBe(parentFileContext);
      }
    );
  });
});
