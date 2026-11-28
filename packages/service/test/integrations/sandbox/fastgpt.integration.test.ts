import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  SANDBOX_EDIT_FILE_TOOL_NAME,
  SANDBOX_FIND_TOOL_NAME,
  SANDBOX_GET_FILE_URL_TOOL_NAME,
  SANDBOX_GREP_TOOL_NAME,
  SANDBOX_LS_TOOL_NAME,
  SANDBOX_READ_FILE_TOOL_NAME,
  SANDBOX_SHELL_TOOL_NAME,
  SANDBOX_WRITE_FILE_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/tools';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { asRedisLogicalKey } from '@fastgpt/dal/redis/runtime';
import { redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { LeaseCache } from '@fastgpt/dal/redis/caches';
import { RedisLeaseWaitTimeoutError } from '@fastgpt/dal/redis/caches/lease';
import { OPEN_SANDBOX_CONTAINER_RUNTIME_DIR } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import {
  prepareSandboxToolRuntime,
  runSandboxTools,
  type SandboxToolCallResult
} from '@fastgpt/service/core/ai/sandbox/application/toolCall';
import {
  getSandboxClient,
  type SandboxClient
} from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import { type SandboxClientQuery } from '@fastgpt/service/core/ai/sandbox/application/runtime/type';
import {
  deleteSandboxResource,
  retryStaleStoppingSandboxes
} from '@fastgpt/service/core/ai/sandbox/application/resource';
import { prepareSandboxRuntimeMirrors } from '@fastgpt/service/core/ai/sandbox/application/runtime/mirrors';
import {
  getRuntimeStateValue,
  readSandboxRuntimeState
} from '@fastgpt/service/core/ai/sandbox/application/runtime/state';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { countActiveSandboxInstances } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository';
import {
  recoverSandboxActivation,
  retryStaleSandboxActivations
} from '@fastgpt/service/core/ai/sandbox/application/lifecycle/service';
import {
  createOpenSandboxResourceClient,
  disconnectSandbox
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox';
import { ConnectionError } from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/errors';
import { buildRuntimeHash, joinSandboxPath } from '@fastgpt/service/core/ai/sandbox/utils';
import { type SandboxProviderType } from '@fastgpt/service/core/ai/sandbox/type';
import {
  SandboxInstanceStatusEnum,
  SandboxOperationTypeEnum
} from '@fastgpt/service/core/ai/sandbox/constants';
import { getRunningSandboxId } from '@fastgpt/service/core/ai/sandbox/utils/id';
import type { ResourceLimits } from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/type';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getSandboxIntegrationProvider, getSandboxIntegrationTimingBudgets } from './config';

import { keepaliveSandboxSession } from '@fastgpt/service/core/ai/sandbox/interface/session';

import { archiveSandboxResource } from '@fastgpt/service/core/ai/sandbox/application/archive';
import { SANDBOX_ARCHIVE_PREFIX } from '@fastgpt/service/common/s3/sources/sandbox';
const { Types } = connectionMongo;
const integrationProvider = getSandboxIntegrationProvider();
const timingBudgets = getSandboxIntegrationTimingBudgets();
const originalSandboxBucket = global.sandboxBucket;
const workspaceArchives = new Map<string, Buffer>();
const deleteWorkspaceArchiveNow = vi.fn(
  async ({ sandboxId, currentObjectKey }: { sandboxId: string; currentObjectKey?: string }) => {
    if (currentObjectKey) {
      workspaceArchives.delete(currentObjectKey);
    }
    for (const key of Array.from(workspaceArchives.keys())) {
      if (
        key.startsWith(`${SANDBOX_ARCHIVE_PREFIX}/${encodeURIComponent(sandboxId)}/`) ||
        key.startsWith(`${SANDBOX_ARCHIVE_PREFIX}/${sandboxId}/`)
      ) {
        workspaceArchives.delete(key);
      }
    }
  }
);
const downloadWorkspaceArchive = vi.fn(async ({ key }: { key: string; sandboxId: string }) => {
  const body = workspaceArchives.get(key);
  if (!body) throw new Error('Integration archive missing');
  return Readable.from([Buffer.from(body)]);
});

type TimingRecord = {
  operation: string;
  durationMs: number;
  budgetMs: number;
  reportedMs?: number;
  outcome: 'success' | 'expected-error' | 'error';
};

type SandboxFixture = {
  query: SandboxClientQuery;
  sandbox: SandboxClient;
};

const timingRecords: TimingRecord[] = [];
const previewSessionIds = new Set<string>();

/** 执行并记录 wall-clock 耗时，所有成功和预期失败路径都必须满足显式预算。 */
const measureOperation = async <T>(
  operation: string,
  budgetMs: number,
  run: () => Promise<T>,
  expectedError = false
): Promise<{ value: T; durationMs: number }> => {
  const startTime = performance.now();
  try {
    const value = await run();
    const durationMs = Math.round(performance.now() - startTime);
    timingRecords.push({ operation, durationMs, budgetMs, outcome: 'success' });
    expect(durationMs, `${operation} exceeded ${budgetMs}ms`).toBeLessThanOrEqual(budgetMs);
    return { value, durationMs };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    timingRecords.push({
      operation,
      durationMs,
      budgetMs,
      outcome: expectedError ? 'expected-error' : 'error'
    });
    expect(durationMs, `${operation} exceeded ${budgetMs}ms`).toBeLessThanOrEqual(budgetMs);
    throw error;
  }
};

/** 从 FastGPT 工具调度入口执行指令，同时比对业务上报耗时和真实 wall-clock。 */
const runTimedTool = async ({
  operation,
  toolName,
  input,
  sandbox,
  budgetMs = timingBudgets.toolMs,
  outcome = 'success'
}: {
  operation: string;
  toolName: string;
  input: Record<string, unknown>;
  sandbox: SandboxClient;
  budgetMs?: number;
  outcome?: TimingRecord['outcome'];
}) => {
  const { value, durationMs } = await measureOperation(operation, budgetMs, () =>
    runSandboxTools({
      toolName,
      args: JSON.stringify(input),
      sandboxClient: sandbox
    })
  );
  const reportedMs = Math.round(value.durationSeconds * 1000);
  const record = timingRecords.at(-1);
  if (record?.operation === operation) {
    record.reportedMs = reportedMs;
    record.outcome = outcome;
  }
  expect(reportedMs).toBeLessThanOrEqual(durationMs + 250);
  return value;
};

/** 执行预期由工具业务逻辑抛出的错误，并确保错误也满足普通指令耗时预算。 */
const expectTimedToolError = async ({
  operation,
  toolName,
  args,
  sandbox,
  message
}: {
  operation: string;
  toolName: string;
  args: string | Record<string, unknown>;
  sandbox: SandboxClient;
  message: string | RegExp;
}) => {
  await expect(
    measureOperation(
      operation,
      timingBudgets.toolMs,
      () =>
        runSandboxTools({
          toolName,
          args: typeof args === 'string' ? args : JSON.stringify(args),
          sandboxClient: sandbox
        }),
      true
    )
  ).rejects.toThrow(message);
};

const createAppSandboxQuery = async (label: string): Promise<SandboxClientQuery> => {
  const app = await MongoApp.create({
    name: `Sandbox integration ${label}`,
    type: AppTypeEnum.simple,
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId(),
    modules: []
  });
  const sourceId = String(app._id);
  const userId = `integration-user-${randomUUID()}`;

  return {
    sandboxId: getRunningSandboxId({
      sourceType: ChatSourceTypeEnum.app,
      sourceId,
      userId
    }),
    sourceType: ChatSourceTypeEnum.app,
    sourceId,
    userId,
    chatId: `integration-chat-${randomUUID()}`
  };
};

/** 读取真实生命周期快照；记录缺失立即失败，避免可选链掩盖前置步骤未成功。 */
const readSandboxInstance = async (query: SandboxClientQuery) => {
  const instance = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
  if (!instance) throw new Error('Integration sandbox record missing');
  return instance;
};

/** 用独立只读连接探测真实远端，不能通过运行入口隐式重新创建资源。 */
const readSandboxProviderInfo = async (params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  instanceId?: string;
}) => {
  const client = await createOpenSandboxResourceClient({
    sandboxId: params.sandboxId,
    instanceId: params.instanceId
  });
  try {
    return await client.getInfo();
  } finally {
    await disconnectSandbox(client);
  }
};

/** 删除前核对 Mongo 归属，并对可重放的 FastGPT delete lifecycle 最多重试三次。 */
const cleanupSandboxFixture = async (
  provider: SandboxProviderType,
  query: SandboxClientQuery,
  sandbox?: SandboxClient
) => {
  await sandbox?.opensandbox.close().catch(() => undefined);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const instance = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
    if (!instance) return;
    if (
      instance.provider !== provider ||
      instance.sourceType !== query.sourceType ||
      instance.sourceId !== query.sourceId ||
      instance.userId !== query.userId
    ) {
      throw new Error(`Refusing to clean mismatched Sandbox resource: ${query.sandboxId}`);
    }

    // 测试请求均已 await 结束；仅对核对过归属的 fixture 解除故障隔离，避免失败用例泄漏资源。
    if (instance.operation) {
      await MongoSandboxInstance.updateOne(
        { _id: instance._id, 'operation.id': instance.operation.id },
        { $set: { 'operation.retryAfter': new Date(0) } }
      );
    }

    try {
      await deleteSandboxResource(instance);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
};

const createSandboxFixture = async (
  provider: SandboxProviderType,
  label: string,
  resourceLimits?: ResourceLimits
): Promise<SandboxFixture> => {
  const query = await createAppSandboxQuery(label);
  const { value: sandbox } = await measureOperation(
    `lifecycle.create.${label}`,
    timingBudgets.lifecycleMs,
    () => getSandboxClient(query, { resourceLimits })
  );
  return { query, sandbox };
};

/** 为单个用例创建独立 App/Sandbox，失败时仍清理 provider、volume 和 Mongo 记录。 */
const withSandboxFixture = async (
  provider: SandboxProviderType,
  label: string,
  run: (fixture: SandboxFixture) => Promise<void>
) => {
  const query = await createAppSandboxQuery(label);
  let fixture: SandboxFixture | undefined;

  try {
    const created = await measureOperation(
      `lifecycle.create.${label}`,
      timingBudgets.lifecycleMs,
      () => getSandboxClient(query)
    );
    fixture = { query, sandbox: created.value };
    await run(fixture);
  } finally {
    await measureOperation(`lifecycle.cleanup.${label}`, timingBudgets.cleanupMs, () =>
      cleanupSandboxFixture(provider, query, fixture?.sandbox)
    );
  }
};

const assertToolSuccess = (result: SandboxToolCallResult) => {
  expect(result.success).toBe(true);
  return result;
};

describe.skipIf(!integrationProvider).sequential('FastGPT Sandbox Integration', () => {
  const provider = integrationProvider!;
  const resourceLimits = {
    cpuCount: Number(process.env.AGENT_SANDBOX_CPU_COUNT ?? 1),
    memoryMiB: Number(process.env.AGENT_SANDBOX_MEMORY_MIB ?? 2048)
  };
  let toolFixture: SandboxFixture;

  beforeAll(async () => {
    global.sandboxBucket = {
      deleteSandboxArchives: deleteWorkspaceArchiveNow,
      deleteArchiveObject: async ({ key }: { key: string }) => {
        workspaceArchives.delete(key);
      },
      deleteSupersededSandboxArchives: async ({
        sandboxId,
        keepObjectKey
      }: {
        sandboxId: string;
        keepObjectKey?: string;
      }) => {
        const prefix = `${SANDBOX_ARCHIVE_PREFIX}/${sandboxId}/`;
        for (const key of Array.from(workspaceArchives.keys())) {
          if (key.startsWith(prefix) && key !== keepObjectKey) {
            workspaceArchives.delete(key);
          }
        }
      },
      // 对象存储使用内存替身；Mongo、Redis、Provider、PVC 和 tar.zst 均执行真实链路。
      uploadArchiveStream: async ({ key, body }: { key: string; body: Buffer | Readable }) => {
        const chunks: Buffer[] = [];
        for await (const chunk of Readable.from(body)) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const archivedBuffer = Buffer.concat(chunks);
        workspaceArchives.set(key, archivedBuffer);
        return { sizeBytes: archivedBuffer.length };
      },
      downloadArchiveStream: downloadWorkspaceArchive
    } as unknown as typeof global.sandboxBucket;

    toolFixture = await createSandboxFixture(provider, 'tool-runtime', resourceLimits);
    await toolFixture.sandbox.opensandbox.close();
    const prepared = await measureOperation(
      'lifecycle.prepare-agent-tool-runtime',
      timingBudgets.lifecycleMs,
      () =>
        prepareSandboxToolRuntime({
          sourceType: toolFixture.query.sourceType,
          sourceId: toolFixture.query.sourceId,
          userId: toolFixture.query.userId,
          chatId: toolFixture.query.chatId!,
          files: [{ path: 'user_files/input.txt', url: 'memory://input.txt' }],
          readInputFile: async () => Buffer.from('input-line-1\ninput-line-2')
        })
    );
    toolFixture.sandbox = prepared.value;
  });

  afterAll(async () => {
    if (toolFixture) {
      await measureOperation('lifecycle.cleanup.tool-runtime', timingBudgets.cleanupMs, () =>
        cleanupSandboxFixture(provider, toolFixture.query, toolFixture.sandbox)
      );
    }
    if (previewSessionIds.size > 0 && toolFixture) {
      await redisCacheAdapter.deleteMany([
        asRedisLogicalKey(`sandbox:preview:${toolFixture.query.sandboxId}:active`),
        ...Array.from(previewSessionIds, (sessionId) =>
          asRedisLogicalKey(`sandbox:preview:session:${sessionId}`)
        )
      ]);
    }
    global.sandboxBucket = originalSandboxBucket;
    console.info('[FastGPT Sandbox Integration Timings]', JSON.stringify(timingRecords, null, 2));
  });

  describe.sequential('Agent tool command timings', () => {
    it('times sandbox_write_file through FastGPT tool dispatch', async () => {
      const result = await runTimedTool({
        operation: SANDBOX_WRITE_FILE_TOOL_NAME,
        toolName: SANDBOX_WRITE_FILE_TOOL_NAME,
        input: { path: 'docs/sample.txt', content: 'alpha\nbeta\nneedle\nomega' },
        sandbox: toolFixture.sandbox
      });
      expect(assertToolSuccess(result).response).toContain('File written successfully');
    });

    it('times sandbox_read_file through FastGPT tool dispatch', async () => {
      const result = await runTimedTool({
        operation: SANDBOX_READ_FILE_TOOL_NAME,
        toolName: SANDBOX_READ_FILE_TOOL_NAME,
        input: { path: 'user_files/input.txt', offset: 1, limit: 2 },
        sandbox: toolFixture.sandbox
      });
      expect(assertToolSuccess(result).response).toContain('input-line-2');
    });

    it('times sandbox_edit_file through FastGPT tool dispatch', async () => {
      const result = await runTimedTool({
        operation: SANDBOX_EDIT_FILE_TOOL_NAME,
        toolName: SANDBOX_EDIT_FILE_TOOL_NAME,
        input: {
          entries: [{ path: 'docs/sample.txt', oldContent: 'beta', newContent: 'beta-edited' }]
        },
        sandbox: toolFixture.sandbox
      });
      expect(assertToolSuccess(result).response).toContain('Files edited successfully');
    });

    it('times sandbox_grep through FastGPT tool dispatch', async () => {
      const result = await runTimedTool({
        operation: SANDBOX_GREP_TOOL_NAME,
        toolName: SANDBOX_GREP_TOOL_NAME,
        input: { pattern: 'needle', path: 'docs', literal: true },
        sandbox: toolFixture.sandbox
      });
      expect(assertToolSuccess(result).response).toContain('needle');
    });

    it('times sandbox_find through FastGPT tool dispatch', async () => {
      const result = await runTimedTool({
        operation: SANDBOX_FIND_TOOL_NAME,
        toolName: SANDBOX_FIND_TOOL_NAME,
        input: { pattern: '*.txt', path: '.' },
        sandbox: toolFixture.sandbox
      });
      expect(assertToolSuccess(result).response).toContain('docs/sample.txt');
    });

    it('times sandbox_ls through FastGPT tool dispatch', async () => {
      const result = await runTimedTool({
        operation: SANDBOX_LS_TOOL_NAME,
        toolName: SANDBOX_LS_TOOL_NAME,
        input: { path: 'docs' },
        sandbox: toolFixture.sandbox
      });
      expect(assertToolSuccess(result).response).toContain('sample.txt');
    });

    it('times sandbox_shell through FastGPT tool dispatch', async () => {
      const result = await runTimedTool({
        operation: SANDBOX_SHELL_TOOL_NAME,
        toolName: SANDBOX_SHELL_TOOL_NAME,
        input: { command: 'printf shell-ok' },
        sandbox: toolFixture.sandbox
      });
      expect(assertToolSuccess(result).response).toContain('shell-ok');
    });

    it.runIf(provider === 'opensandbox')(
      'blocks access to dev private services through the FastGPT egress policy',
      async () => {
        const result = await runTimedTool({
          operation: 'security.egress-private-network-denied',
          toolName: SANDBOX_SHELL_TOOL_NAME,
          input: {
            command:
              "node -e \"fetch('http://host.docker.internal:3005/health',{signal:AbortSignal.timeout(2000)}).then(()=>{console.log('private-egress-open');process.exit(42)}).catch(()=>console.log('private-egress-blocked'))\""
          },
          sandbox: toolFixture.sandbox,
          budgetMs: timingBudgets.timeoutMs
        });
        expect(assertToolSuccess(result).response).toContain('private-egress-blocked');
        expect(result.response).not.toContain('private-egress-open');
      }
    );

    it('times sandbox_get_file_url through FastGPT tool dispatch and real Redis', async () => {
      const result = await runTimedTool({
        operation: SANDBOX_GET_FILE_URL_TOOL_NAME,
        toolName: SANDBOX_GET_FILE_URL_TOOL_NAME,
        input: { paths: ['docs/sample.txt'] },
        sandbox: toolFixture.sandbox
      });
      const [file] = JSON.parse(assertToolSuccess(result).response) as {
        fileUrl: string;
        filename: string;
      }[];
      expect(file.filename).toBe('sample.txt');
      const match = new URL(file.fileUrl).pathname.match(/\/preview\/([a-z][a-zA-Z0-9]{23})\//);
      expect(match).not.toBeNull();
      previewSessionIds.add(match![1]);
    });
  });

  describe.sequential('Error recovery timings', () => {
    it('rejects unknown tools, malformed JSON and schema violations without poisoning runtime', async () => {
      const unknownTool = await runTimedTool({
        operation: 'error.unknown-tool',
        toolName: 'sandbox_unknown',
        input: {},
        sandbox: toolFixture.sandbox,
        outcome: 'expected-error'
      });
      expect(unknownTool).toMatchObject({
        success: false,
        response: 'Unknown sandbox tool: sandbox_unknown'
      });

      const malformedJson = await measureOperation(
        'error.malformed-json',
        timingBudgets.toolMs,
        () =>
          runSandboxTools({
            toolName: SANDBOX_READ_FILE_TOOL_NAME,
            args: '{invalid-json',
            sandboxClient: toolFixture.sandbox
          })
      );
      timingRecords.at(-1)!.outcome = 'expected-error';
      expect(malformedJson.value.success).toBe(false);

      const invalidSchema = await runTimedTool({
        operation: 'error.invalid-tool-input',
        toolName: SANDBOX_READ_FILE_TOOL_NAME,
        input: { path: 'docs/sample.txt', offset: 0 },
        sandbox: toolFixture.sandbox,
        outcome: 'expected-error'
      });
      expect(invalidSchema.success).toBe(false);

      const recovered = await runTimedTool({
        operation: 'recovery.after-dispatch-errors',
        toolName: SANDBOX_SHELL_TOOL_NAME,
        input: { command: 'printf recovered-after-dispatch-errors' },
        sandbox: toolFixture.sandbox
      });
      expect(assertToolSuccess(recovered).response).toContain('recovered-after-dispatch-errors');
    });

    it('rejects file and path boundary errors without poisoning runtime', async () => {
      await expectTimedToolError({
        operation: 'error.read-missing-file',
        toolName: SANDBOX_READ_FILE_TOOL_NAME,
        args: { path: 'docs/missing.txt' },
        sandbox: toolFixture.sandbox,
        message: 'Failed to read file'
      });
      const offsetBeyondEnd = await runTimedTool({
        operation: 'notice.read-offset-beyond-end',
        toolName: SANDBOX_READ_FILE_TOOL_NAME,
        input: { path: 'docs/sample.txt', offset: 100 },
        sandbox: toolFixture.sandbox
      });
      expect(assertToolSuccess(offsetBeyondEnd).response).toMatch(
        /File exists but has no content at or after offset 100/
      );
      await expectTimedToolError({
        operation: 'error.path-traversal',
        toolName: SANDBOX_WRITE_FILE_TOOL_NAME,
        args: { path: '../outside.txt', content: 'must-not-write' },
        sandbox: toolFixture.sandbox,
        message: 'Path traversal detected'
      });
      await expectTimedToolError({
        operation: 'error.preview-missing-file',
        toolName: SANDBOX_GET_FILE_URL_TOOL_NAME,
        args: { paths: ['docs/missing.txt'] },
        sandbox: toolFixture.sandbox,
        message: /file not found/i
      });

      const recovered = await runTimedTool({
        operation: 'recovery.after-file-errors',
        toolName: SANDBOX_READ_FILE_TOOL_NAME,
        input: { path: 'docs/sample.txt' },
        sandbox: toolFixture.sandbox
      });
      expect(assertToolSuccess(recovered).response).toContain('needle');
    });

    it('keeps the tool runtime reusable after validation and command errors', async () => {
      const failedCommand = await runTimedTool({
        operation: 'error.non-zero-shell',
        toolName: SANDBOX_SHELL_TOOL_NAME,
        input: { command: 'nonexistent-command-fastgpt-integration' },
        sandbox: toolFixture.sandbox,
        outcome: 'expected-error'
      });
      expect(assertToolSuccess(failedCommand).response).toContain('Command exited with code');

      const recovered = await runTimedTool({
        operation: 'recovery.after-command-error',
        toolName: SANDBOX_SHELL_TOOL_NAME,
        input: { command: 'printf recovered-after-error' },
        sandbox: toolFixture.sandbox
      });
      expect(assertToolSuccess(recovered).response).toContain('recovered-after-error');
    });

    it('rejects command execution after the App source is soft-deleted', async () => {
      await withSandboxFixture(provider, 'deleted-source', async ({ query, sandbox }) => {
        await MongoApp.updateOne({ _id: query.sourceId }, { $set: { deleteTime: new Date() } });

        const blocked = await runTimedTool({
          operation: 'error.deleted-source-command',
          toolName: SANDBOX_SHELL_TOOL_NAME,
          input: { command: 'printf must-not-run' },
          sandbox,
          outcome: 'expected-error'
        });
        expect(assertToolSuccess(blocked).response).toContain(
          'Sandbox service is not available: Sandbox source is missing or deleted'
        );
        expect(blocked.response).not.toContain('must-not-run');
      });
    });

    it.runIf(provider === 'opensandbox')(
      'interrupts a timed-out shell and remains reusable',
      async () => {
        const timedOut = await runTimedTool({
          operation: 'error.shell-timeout',
          toolName: SANDBOX_SHELL_TOOL_NAME,
          input: { command: 'sleep 10', timeout: 1 },
          sandbox: toolFixture.sandbox,
          budgetMs: timingBudgets.timeoutMs,
          outcome: 'expected-error'
        });
        expect(assertToolSuccess(timedOut).response).toContain('Command exited with code');

        const recovered = await runTimedTool({
          operation: 'recovery.after-shell-timeout',
          toolName: SANDBOX_SHELL_TOOL_NAME,
          input: { command: 'printf recovered-after-timeout' },
          sandbox: toolFixture.sandbox
        });
        expect(assertToolSuccess(recovered).response).toContain('recovered-after-timeout');
      }
    );

    it.runIf(provider === 'opensandbox')(
      'repairs a provider resource missing behind a running Mongo record',
      async () => {
        await withSandboxFixture(provider, 'missing-provider', async (fixture) => {
          const { query } = fixture;
          await fixture.sandbox.exec('printf persisted > recovery.txt');
          const instance = await MongoSandboxInstance.findOne({
            sandboxId: query.sandboxId
          }).lean();
          expect(instance).toBeTruthy();

          const client = await createOpenSandboxResourceClient({
            sandboxId: instance!.sandboxId,
            instanceId: instance!.instanceId
          });
          try {
            await client.delete();
          } finally {
            await disconnectSandbox(client);
          }
          await fixture.sandbox.opensandbox.close();

          const repaired = await runTimedTool({
            operation: 'recovery.command-repairs-missing-provider',
            toolName: SANDBOX_SHELL_TOOL_NAME,
            input: { command: 'cat recovery.txt' },
            sandbox: fixture.sandbox,
            budgetMs: timingBudgets.lifecycleMs
          });
          expect(assertToolSuccess(repaired).response).toContain('persisted');
          const persisted = await fixture.sandbox.exec('cat recovery.txt');
          expect(persisted).toMatchObject({ stdout: 'persisted', exitCode: 0 });
          const repairedInstance = await MongoSandboxInstance.findOne({
            sandboxId: query.sandboxId
          }).lean();
          expect(repairedInstance?.status).toBe(SandboxInstanceStatusEnum.running);
          expect(repairedInstance?.operation).toBeUndefined();
        });
      }
    );

    it('rolls back failed provisioning through cron without losing workspace or ownership', async () => {
      await withSandboxFixture(provider, 'failed-provision', async (fixture) => {
        const { query } = fixture;
        expect(await fixture.sandbox.exec('printf persisted > failed-provision.txt')).toMatchObject(
          {
            exitCode: 0
          }
        );
        const before = await readSandboxInstance(query);
        await fixture.sandbox.opensandbox.close();

        // 模拟远端创建成功后进程退出：远端仍活着，Mongo 只有旧版 claimed checkpoint。
        const failedAt = new Date(0);
        await MongoSandboxInstance.updateOne(
          { _id: before._id },
          {
            $set: {
              status: SandboxInstanceStatusEnum.provisioning,
              versionId: 'integration-preserved-version',
              operation: {
                id: randomUUID(),
                type: SandboxOperationTypeEnum.provision,
                phase: 'claimed',
                previousStatus: SandboxInstanceStatusEnum.running,
                startedAt: failedAt,
                heartbeatAt: failedAt,
                failedAt,
                error: 'injected provider timeout'
              }
            }
          }
        );
        expect(await countActiveSandboxInstances({ teamId: before.teamId })).toBe(1);

        await measureOperation(
          'lifecycle.rollback-failed-provisioning',
          timingBudgets.lifecycleMs,
          () => retryStaleSandboxActivations()
        );
        const stopped = await readSandboxInstance(query);
        expect(stopped).toMatchObject({
          status: 'stopped',
          teamId: before.teamId,
          versionId: 'integration-preserved-version'
        });
        expect(stopped.operation).toBeUndefined();
        expect(stopped.storage).toEqual(before.storage);
        expect(stopped.image).toEqual(before.image);
        expect(await countActiveSandboxInstances({ teamId: before.teamId })).toBe(0);
        const remote = await readSandboxProviderInfo({ provider, sandboxId: query.sandboxId });
        expect(remote?.status.state ?? 'UnExist').toBe(
          provider === 'opensandbox' ? 'UnExist' : 'Stopped'
        );

        fixture.sandbox = (
          await measureOperation(
            'lifecycle.resume-after-provisioning-rollback',
            timingBudgets.lifecycleMs,
            () => getSandboxClient(query)
          )
        ).value;
        expect(await fixture.sandbox.exec('cat failed-provision.txt')).toMatchObject({
          stdout: 'persisted',
          exitCode: 0
        });
        expect(await countActiveSandboxInstances({ teamId: before.teamId })).toBe(1);
        expect((await readSandboxInstance(query)).storage).toEqual(before.storage);
      });
    });

    it.each([
      ['provisioning', 'provision', 'providerEnsured'],
      ['restoring', 'restore', 'archiveInstalled']
    ] as const)(
      'completes a persisted %s checkpoint only after the real lifecycle lease is released',
      async (status, type, phase) => {
        await withSandboxFixture(provider, `completion-${status}`, async (fixture) => {
          const { query } = fixture;
          expect(await fixture.sandbox.exec('printf completed > completion.txt')).toMatchObject({
            exitCode: 0
          });
          const created = await readSandboxInstance(query);
          if (status === 'restoring') {
            const archived = await measureOperation(
              'lifecycle.archive',
              timingBudgets.lifecycleMs,
              () => archiveSandboxResource(created)
            );
            expect(archived.value.status).toBe('success');
            expect((await readSandboxInstance(query)).status).toBe('archived');
            await fixture.sandbox.opensandbox.close();
            await keepaliveSandboxSession(query);
            expect((await readSandboxInstance(query)).status).toBe('archived');
            expect(
              await readSandboxProviderInfo({ provider, sandboxId: query.sandboxId })
            ).toBeNull();
            fixture.sandbox = (
              await measureOperation('lifecycle.restore', timingBudgets.lifecycleMs, () =>
                getSandboxClient(query)
              )
            ).value;
          }
          const before = await readSandboxInstance(query);
          expect(before.status).toBe('running');
          expect(before.operation).toBeUndefined();
          if (status === 'restoring' && provider === 'opensandbox') {
            expect(before.storage?.volumes?.[0].claimName).not.toBe(
              created.storage?.volumes?.[0].claimName
            );
          }
          const remoteBefore = await readSandboxProviderInfo({
            provider,
            sandboxId: query.sandboxId
          });
          expect(remoteBefore?.status.state).toBe('Running');
          await fixture.sandbox.opensandbox.close();

          const operationId = randomUUID();
          await MongoSandboxInstance.updateOne(
            { _id: before._id },
            {
              $set: {
                status,
                operation: {
                  id: operationId,
                  type,
                  phase,
                  startedAt: new Date(0),
                  heartbeatAt: new Date(0)
                }
              }
            }
          );
          // 直接占用底层物理 Redis 键以模拟跨请求/跨节点竞争者持锁（避免命中同一调用链的可重入复用）。
          await new LeaseCache().withLease({
            key: `agent-sandbox:lease:${query.sandboxId}`,
            label: 'integration-existing-lease-owner',
            ttlMs: 30_000,
            renewIntervalMs: 5_000,
            fn: async () => {
              await expect(
                recoverSandboxActivation({ sandboxId: query.sandboxId, waitTimeoutMs: 50 })
              ).rejects.toBeInstanceOf(RedisLeaseWaitTimeoutError);
              expect((await readSandboxInstance(query)).operation?.id).toBe(operationId);
            }
          });

          await recoverSandboxActivation({ sandboxId: query.sandboxId });
          const after = await readSandboxInstance(query);
          expect(after.status).toBe('running');
          expect(after.storage).toEqual(before.storage);
          expect(after.image).toEqual(before.image);
          expect(after.operation).toBeUndefined();
          // 物理 ID 与存储 generation 都不变，不能靠重新创建一台机器伪装成补交成功。
          const remoteAfter = await readSandboxProviderInfo({
            provider,
            sandboxId: query.sandboxId
          });
          expect(remoteAfter?.id).toBe(remoteBefore?.id);
          fixture.sandbox = await getSandboxClient(query);
          expect(await fixture.sandbox.exec('cat completion.txt')).toMatchObject({
            stdout: 'completed',
            exitCode: 0
          });
        });
      }
    );

    it('retains restore quota until rollback and preserves the archive for a fresh generation', async () => {
      await withSandboxFixture(provider, 'failed-restore', async (fixture) => {
        const { query } = fixture;
        const originalSystemConfig = global.systemInstanceConfig;
        // 同一 App 的另一用户具有独立 sandboxId，但必须竞争同一团队配额。
        const userId = `integration-contender-${randomUUID()}`;
        const contender = {
          ...query,
          userId,
          sandboxId: getRunningSandboxId({ ...query, userId })
        };
        let competingSandbox: SandboxClient | undefined;
        try {
          const snapshot = getTestInstanceConfig();
          global.systemInstanceConfig = {
            ...snapshot,
            subservice: {
              ...snapshot.subservice,
              agentSandbox: {
                ...snapshot.subservice.agentSandbox,
                common: { ...snapshot.subservice.agentSandbox.common, maxPerTeam: 1 }
              }
            }
          };
          expect(
            await fixture.sandbox.exec('printf archive-original > failed-restore.txt')
          ).toMatchObject({ exitCode: 0 });
          const before = await readSandboxInstance(query);
          expect(await archiveSandboxResource(before)).toMatchObject({ status: 'success' });
          await fixture.sandbox.opensandbox.close();
          const archivedDoc = await readSandboxInstance(query);
          const archiveKey = archivedDoc.storage?.archive?.objectKey;
          if (!archiveKey) throw new Error('Archive objectKey missing after archiving');
          const originalArchive = workspaceArchives.get(archiveKey);
          expect(originalArchive).toBeInstanceOf(Buffer);

          // 故障发生在真实计算资源/PVC 创建后、解压前；注入未决传输 ConnectionError 以验证 60s 冷却期与配额保留语义（确定性数据面报错立即回滚见下方用例）。
          downloadWorkspaceArchive.mockRejectedValueOnce(
            new ConnectionError('injected archive download timeout', {
              cause: new TypeError('fetch failed')
            })
          );
          await expect(getSandboxClient(query)).rejects.toThrow(
            'injected archive download timeout'
          );
          const failed = await readSandboxInstance(query);
          expect(failed).toMatchObject({
            status: 'restoring',
            operation: { phase: 'volumeAssigned', error: 'injected archive download timeout' }
          });
          const retryAfter = failed.operation?.retryAfter;
          if (!retryAfter) throw new Error('Restore failure did not persist retryAfter');
          expect(
            (await readSandboxProviderInfo({ provider, sandboxId: query.sandboxId }))?.status.state
          ).toBe('Running');
          expect(await countActiveSandboxInstances({ teamId: before.teamId })).toBe(1);
          await expect(getSandboxClient(contender)).rejects.toMatchObject({
            message: SandboxErrEnum.agentSandboxTeamLimitReached
          });
          expect(await MongoSandboxInstance.exists({ sandboxId: contender.sandboxId })).toBeNull();
          expect(
            await readSandboxProviderInfo({ provider, sandboxId: contender.sandboxId })
          ).toBeNull();

          // 用明确的 now 驱动生产恢复入口，验证边界而不等待二十分钟或替换全局时钟。
          await retryStaleSandboxActivations(new Date(retryAfter.getTime() - 1));
          expect((await readSandboxInstance(query)).operation?.id).toBe(failed.operation?.id);
          await measureOperation(
            'lifecycle.rollback-failed-restore',
            timingBudgets.lifecycleMs,
            () => retryStaleSandboxActivations(retryAfter)
          );
          const rolledBack = await readSandboxInstance(query);
          expect(rolledBack.status).toBe('archived');
          expect(rolledBack.operation).toBeUndefined();
          expect(
            await readSandboxProviderInfo({ provider, sandboxId: query.sandboxId })
          ).toBeNull();
          expect(await countActiveSandboxInstances({ teamId: before.teamId })).toBe(0);
          expect(workspaceArchives.get(archiveKey)).toEqual(originalArchive);

          competingSandbox = await getSandboxClient(contender);
          // 回滚释放的额度可被其他用户占用，原实例再次恢复也必须重新准入。
          await expect(getSandboxClient(query)).rejects.toMatchObject({
            message: SandboxErrEnum.agentSandboxTeamLimitReached
          });
          expect((await readSandboxInstance(query)).status).toBe('archived');
          await competingSandbox.stop();
          fixture.sandbox = (
            await measureOperation(
              'lifecycle.restore-after-rollback',
              timingBudgets.lifecycleMs,
              () => getSandboxClient(query)
            )
          ).value;
          expect(await fixture.sandbox.exec('cat failed-restore.txt')).toMatchObject({
            stdout: 'archive-original',
            exitCode: 0
          });
          const restored = await readSandboxInstance(query);
          expect(restored.status).toBe('running');
          expect(restored.operation).toBeUndefined();
          expect(await countActiveSandboxInstances({ teamId: before.teamId })).toBe(1);
          if (provider === 'opensandbox') {
            expect(restored.storage?.volumes?.[0].claimName).not.toBe(
              failed.storage?.volumes?.[0].claimName
            );
            expect(restored.storage?.volumes?.[0].claimName).not.toBe(
              before.storage?.volumes?.[0].claimName
            );
          }
        } finally {
          global.systemInstanceConfig = originalSystemConfig;
          await cleanupSandboxFixture(provider, contender, competingSandbox);
        }
      });
    });

    it('immediately rolls back container and volume on settled /archive/extract errors without waiting for isolation', async () => {
      await withSandboxFixture(provider, 'settled-restore', async (fixture) => {
        const { query } = fixture;
        const originalSystemConfig = global.systemInstanceConfig;
        const userId = `integration-contender-${randomUUID()}`;
        const contender = {
          ...query,
          userId,
          sandboxId: getRunningSandboxId({ ...query, userId })
        };
        let competingSandbox: SandboxClient | undefined;
        try {
          const snapshot = getTestInstanceConfig();
          global.systemInstanceConfig = {
            ...snapshot,
            subservice: {
              ...snapshot.subservice,
              agentSandbox: {
                ...snapshot.subservice.agentSandbox,
                common: { ...snapshot.subservice.agentSandbox.common, maxPerTeam: 1 }
              }
            }
          };
          expect(
            await fixture.sandbox.exec('printf settled-original > settled-restore.txt')
          ).toMatchObject({ exitCode: 0 });
          const before = await readSandboxInstance(query);
          expect(await archiveSandboxResource(before)).toMatchObject({ status: 'success' });
          await fixture.sandbox.opensandbox.close();
          const archivedDoc = await readSandboxInstance(query);
          const archiveKey = archivedDoc.storage?.archive?.objectKey;
          if (!archiveKey) throw new Error('Archive objectKey missing after archiving');
          const originalArchive = workspaceArchives.get(archiveKey);
          expect(originalArchive).toBeInstanceOf(Buffer);

          // 写入损坏的非 zstd 载荷，由真实 fastgpt-ide-agent /archive/extract 确定性拒绝（非瞬时故障）。
          workspaceArchives.set(archiveKey, Buffer.from('corrupted-not-zstd-payload'));
          await expect(
            measureOperation(
              'lifecycle.settled-restore-error',
              timingBudgets.lifecycleMs,
              () => getSandboxClient(query),
              true
            )
          ).rejects.toThrow();

          // 同步 /archive/extract 确定性失败后应在同一个 lease 内立即回滚，不进入 20 分钟隔离窗口。
          const rolledBack = await readSandboxInstance(query);
          expect(rolledBack.status).toBe('archived');
          expect(rolledBack.operation).toBeUndefined();
          expect(
            await readSandboxProviderInfo({ provider, sandboxId: query.sandboxId })
          ).toBeNull();
          expect(await countActiveSandboxInstances({ teamId: before.teamId })).toBe(0);

          // 配额应已立即释放，其他会话无需等待即可准入。
          competingSandbox = await getSandboxClient(contender);
          await competingSandbox.stop();

          // 恢复合法归档后，原实例仍可基于新代次卷正常恢复工作区内容。
          workspaceArchives.set(archiveKey, originalArchive!);
          fixture.sandbox = (
            await measureOperation(
              'lifecycle.restore-after-settled-rollback',
              timingBudgets.lifecycleMs,
              () => getSandboxClient(query)
            )
          ).value;
          expect(await fixture.sandbox.exec('cat settled-restore.txt')).toMatchObject({
            stdout: 'settled-original',
            exitCode: 0
          });
          const restored = await readSandboxInstance(query);
          expect(restored.status).toBe('running');
          expect(restored.operation).toBeUndefined();
          if (provider === 'opensandbox') {
            expect(restored.storage?.volumes?.[0].claimName).not.toBe(
              before.storage?.volumes?.[0].claimName
            );
          }
        } finally {
          global.systemInstanceConfig = originalSystemConfig;
          await cleanupSandboxFixture(provider, contender, competingSandbox);
        }
      });
    });

    it('keeps stopped resources inactive during keepalive', async () => {
      await withSandboxFixture(provider, 'connect-only-stop', async (fixture) => {
        await fixture.sandbox.stop();
        await keepaliveSandboxSession(fixture.query);
        const record = await MongoSandboxInstance.findOne({
          sandboxId: fixture.query.sandboxId
        }).lean();
        expect(record?.status).toBe('stopped');
        const client = await createOpenSandboxResourceClient({
          sandboxId: fixture.query.sandboxId,
          instanceId: record?.instanceId
        });
        try {
          const info = await client.getInfo();
          expect(info?.status.state ?? 'UnExist').toBe('UnExist');
        } finally {
          await disconnectSandbox(client);
        }
        const resumed = await getSandboxClient(fixture.query);
        fixture.sandbox = resumed;
        expect(
          (await MongoSandboxInstance.findOne({ sandboxId: fixture.query.sandboxId }).lean())
            ?.status
        ).toBe('running');
      });
    });

    it('retries a stale failed stopping operation and resumes the runtime', async () => {
      await withSandboxFixture(provider, 'failed-stop', async (fixture) => {
        const { query } = fixture;
        await fixture.sandbox.exec('printf persisted > failed-stop.txt');
        const now = new Date();
        const staleAt = new Date(now.getTime() - 20 * 60 * 1000);
        await MongoSandboxInstance.updateOne(
          { sandboxId: query.sandboxId },
          {
            $set: {
              status: SandboxInstanceStatusEnum.stopping,
              operation: {
                id: randomUUID(),
                type: SandboxOperationTypeEnum.stop,
                phase: 'claimed',
                previousStatus: SandboxInstanceStatusEnum.running,
                startedAt: staleAt,
                heartbeatAt: staleAt,
                failedAt: staleAt,
                error: 'injected provider stop timeout'
              }
            }
          }
        );

        await measureOperation('lifecycle.retry-stale-stop', timingBudgets.lifecycleMs, () =>
          retryStaleStoppingSandboxes(now)
        );
        const stoppedInstance = await MongoSandboxInstance.findOne({
          sandboxId: query.sandboxId
        }).lean();
        expect(stoppedInstance?.status).toBe(SandboxInstanceStatusEnum.stopped);
        expect(stoppedInstance?.operation).toBeUndefined();

        await fixture.sandbox.opensandbox.close();
        const resumed = await measureOperation(
          'lifecycle.resume-after-stop-retry',
          timingBudgets.lifecycleMs,
          () => getSandboxClient(query)
        );
        fixture.sandbox = resumed.value;
        expect(await fixture.sandbox.exec('cat failed-stop.txt')).toMatchObject({
          stdout: 'persisted',
          exitCode: 0
        });
      });
    });

    it('resumes deletion from its persisted phase after archive cleanup fails', async () => {
      const query = await createAppSandboxQuery('failed-delete');
      let sandbox: SandboxClient | undefined;
      try {
        sandbox = (
          await measureOperation('lifecycle.create.failed-delete', timingBudgets.lifecycleMs, () =>
            getSandboxClient(query)
          )
        ).value;
        deleteWorkspaceArchiveNow.mockRejectedValueOnce(
          new Error('injected archive cleanup error')
        );

        await expect(
          measureOperation(
            'lifecycle.delete.expected-error',
            timingBudgets.cleanupMs,
            () => deleteSandboxResource({ provider, sandboxId: query.sandboxId }),
            true
          )
        ).rejects.toThrow('injected archive cleanup error');
        expect(
          await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean()
        ).toMatchObject({
          status: SandboxInstanceStatusEnum.deleting,
          operation: { phase: 'volumeDeleted', error: 'injected archive cleanup error' }
        });

        await measureOperation('lifecycle.delete.retry', timingBudgets.cleanupMs, () =>
          deleteSandboxResource({ provider, sandboxId: query.sandboxId })
        );
        expect(await MongoSandboxInstance.exists({ sandboxId: query.sandboxId })).toBeNull();
      } finally {
        await cleanupSandboxFixture(provider, query, sandbox);
      }
    });
  });

  it('reuses one FastGPT source record across concurrent Chats and commands', async () => {
    await withSandboxFixture(provider, 'concurrency', async ({ query, sandbox }) => {
      const concurrent = await measureOperation(
        'runtime.concurrent-chat-clients-and-commands',
        timingBudgets.lifecycleMs,
        async () => {
          const clients = await Promise.all([
            getSandboxClient({ ...query, chatId: `integration-chat-${randomUUID()}` }),
            getSandboxClient({ ...query, chatId: `integration-chat-${randomUUID()}` })
          ]);
          try {
            return await Promise.all([
              sandbox.exec('printf first'),
              clients[0].exec('printf second'),
              clients[1].exec('printf third')
            ]);
          } finally {
            await Promise.all(clients.map((client) => client.opensandbox.close()));
          }
        }
      );
      expect(concurrent.value.map(({ exitCode }) => exitCode)).toEqual([0, 0, 0]);
      expect(
        await MongoSandboxInstance.countDocuments({
          sourceType: query.sourceType,
          sourceId: query.sourceId,
          userId: query.userId
        })
      ).toBe(1);
    });
  });

  it('preserves read-only apt sources or backs up and restores writable sources', async () => {
    await withSandboxFixture(provider, 'mirror-config-lifecycle', async ({ sandbox }) => {
      const readTextFile = async (path: string): Promise<string> => {
        const [file] = await sandbox.opensandbox.readFiles([path]);
        if (!file || file.error) {
          throw new Error(`Failed to read integration file ${path}`);
        }
        return Buffer.from(file.content).toString('utf-8');
      };
      const readOptionalTextFile = async (path: string): Promise<string | undefined> => {
        const [file] = await sandbox.opensandbox.readFiles([path]);
        if (!file || file.error) return;
        return Buffer.from(file.content).toString('utf-8');
      };
      const readMirrorHash = async (key: string): Promise<string> => {
        const runtimeState = await readSandboxRuntimeState({ sandbox: sandbox.opensandbox });
        const mirrorHash = getRuntimeStateValue(runtimeState.state, key);
        if (typeof mirrorHash !== 'string') {
          throw new Error('Sandbox mirror hash is unavailable');
        }
        return mirrorHash;
      };
      const osRelease = await readTextFile('/etc/os-release');
      const osId = osRelease.match(/^ID=(.*)$/m)?.[1].replace(/^['"]|['"]$/g, '');
      const supportsAptMirror = osId === 'ubuntu' || osId === 'debian';
      if (!supportsAptMirror) return;

      const aptSourcePath =
        osId === 'debian'
          ? '/etc/apt/sources.list.d/debian.sources'
          : '/etc/apt/sources.list.d/ubuntu.sources';
      const aptBackupPath = joinSandboxPath(
        OPEN_SANDBOX_CONTAINER_RUNTIME_DIR,
        'mirrors',
        `${buildRuntimeHash(aptSourcePath).slice(7)}.backup`
      );
      const aptMirror = `https://apt-a.example.com/${osId === 'debian' ? 'debian' : 'ubuntu'}/`;

      await measureOperation('runtime.prepare-mirrors.initial', timingBudgets.lifecycleMs, () =>
        prepareSandboxRuntimeMirrors({ sandbox: sandbox.opensandbox, config: {} })
      );
      const defaultAptSource = await readTextFile(aptSourcePath);

      await measureOperation('runtime.prepare-mirrors.configured', timingBudgets.lifecycleMs, () =>
        prepareSandboxRuntimeMirrors({
          sandbox: sandbox.opensandbox,
          config: { aptMirror }
        })
      );
      const writable = await sandbox.opensandbox.execute(
        `test -w ${aptSourcePath} && test -w /etc/apt/sources.list.d`
      );
      if (writable.exitCode !== 0) {
        // 非 root 镜像不能改写系统源：保持原内容且保留 pending 备份，不能把失败记为已同步。
        expect(await readTextFile(aptSourcePath)).toBe(defaultAptSource);
        expect(await readOptionalTextFile(aptBackupPath)).toBe(defaultAptSource);
        expect(await readMirrorHash('aptMirror')).toBe('');
        return;
      }
      const configuredAptSource = await readTextFile(aptSourcePath);
      const aptBackup = await readTextFile(aptBackupPath);
      const configuredHash = await readMirrorHash('aptMirror');

      await measureOperation('runtime.prepare-mirrors.default', timingBudgets.lifecycleMs, () =>
        prepareSandboxRuntimeMirrors({
          sandbox: sandbox.opensandbox,
          config: {}
        })
      );
      const restoredAptSource = await readTextFile(aptSourcePath);
      const restoredHash = await readMirrorHash('aptMirror');

      expect(aptBackup).toBe(defaultAptSource);
      expect(configuredAptSource).toContain(aptMirror);
      expect(configuredAptSource).not.toBe(defaultAptSource);
      expect(restoredAptSource).toBe(defaultAptSource);
      expect(await readOptionalTextFile(aptBackupPath)).toBeUndefined();
      expect(configuredHash).toBe(buildRuntimeHash(aptMirror));
      expect(restoredHash).toBe('');
    });
  });
});
