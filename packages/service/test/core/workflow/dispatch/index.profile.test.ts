import { beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { createNode } from '../utils';

const logger = vi.hoisted(() => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@fastgpt/service/common/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/logger')>()),
  getLogger: () => logger
}));
vi.mock('@fastgpt/service/support/permission/teamLimit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/permission/teamLimit')>()),
  checkTeamAIPoints: vi.fn(async () => undefined)
}));

let dispatch: typeof import('@fastgpt/service/core/workflow/dispatch');
let profiling: typeof import('@fastgpt/service/common/profiling');
let callbacks: typeof import('@fastgpt/service/core/workflow/dispatch/constants');

beforeAll(async () => {
  // Mongo setup 会提前加载采集器，重载以注入本文件的日志输出端；实际执行器和采集器均保留。
  vi.resetModules();
  dispatch = await import('@fastgpt/service/core/workflow/dispatch');
  profiling = await import('@fastgpt/service/common/profiling');
  callbacks = await import('@fastgpt/service/core/workflow/dispatch/constants');
});

describe('dispatchWorkFlow request profile result', () => {
  it.each(['success', 'failed', 'caught', 'summary-only', 'tool-error'] as const)(
    'classifies %s without depending on chat persistence',
    async (outcome) => {
      logger.info.mockClear();
      const callback = vi
        .spyOn(callbacks.callbackMap, FlowNodeTypeEnum.textEditor)
        .mockImplementation(async ({ nodeSummary }) => {
          if (outcome === 'summary-only') {
            nodeSummary?.mergeNodeSummary({ errorCount: 1 });
            return { data: {} };
          }
          if (outcome === 'tool-error') {
            return {
              nodeResponse: {
                childrenResponses: [
                  { id: 'tool-error', moduleType: FlowNodeTypeEnum.tool, errorText: 'tool failed' }
                ]
              }
            };
          }
          return outcome === 'success'
            ? { data: {} }
            : { rawError: new Error('node failed'), error: { system_error_text: 'node failed' } };
        });
      onTestFinished(() => callback.mockRestore());
      const node = {
        ...createNode('source', FlowNodeTypeEnum.textEditor),
        isEntry: true,
        catchError: outcome === 'caught'
      };
      const result = await profiling.withRequestProfile({ kind: 'home-chat' }, () =>
        dispatch.dispatchWorkFlow({
          apiVersion: 'v2',
          mode: 'chat',
          stream: false,
          chatId: 'NO_RECORD_HISTORIES',
          responseChatItemId: 'profile-response',
          runningAppInfo: {
            sourceType: ChatSourceTypeEnum.app,
            sourceId: '67e0d5535c02d1d5cdede721',
            name: 'Profile',
            teamId: '654a4107c32f3bf5f998452f',
            tmbId: '65ab7007462ada7dbb899948'
          },
          runningUserInfo: {
            teamId: '654a4107c32f3bf5f998452f',
            tmbId: '65ab7007462ada7dbb899948',
            username: 'profile-user',
            teamName: 'Profile team',
            memberName: 'Profile member',
            contact: 'profile@example.com',
            externalProvider: {}
          },
          uid: 'profile-user',
          lang: 'zh-CN',
          query: [],
          histories: [],
          variables: {},
          chatConfig: {},
          runtimeNodes: [node],
          runtimeEdges: [],
          resourceContext: { resourceMap: new Map(), isRoot: true },
          maxRunTimes: 10,
          maxFileAmount: 5,
          maxBytesPerFile: 1024,
          nodeResponseWriteConfig: { persistToDb: false, retainInMemory: false },
          usageId: 'profile-usage'
        })
      );
      expect(callback).toHaveBeenCalledOnce();
      const failed = outcome === 'failed' || outcome === 'summary-only';
      expect(!!result.workflowRuntimeSummary.errorCount).toBe(failed);
      const profiles = logger.info.mock.calls
        .filter(([message]) => String(message).startsWith('Request profile '))
        .map(([, payload]) => payload);
      expect(profiles).toEqual([expect.objectContaining({ ok: !failed })]);
      expect(profiles[0].error).toBe(
        outcome === 'failed'
          ? 'node failed'
          : outcome === 'summary-only'
            ? 'Workflow run failed'
            : undefined
      );
    }
  );
});
