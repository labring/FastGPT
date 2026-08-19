import { randomUUID } from 'node:crypto';
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
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import {
  prepareSandboxToolRuntime,
  runSandboxTools,
  type SandboxToolCallResult
} from '@fastgpt/service/core/ai/sandbox/interface/toolCall';
import {
  getSandboxClient,
  type SandboxClient,
  type SandboxClientQuery
} from '@fastgpt/service/core/ai/sandbox/interface/runtime';
import {
  deleteSandboxResource,
  retryStaleStoppingSandboxes
} from '@fastgpt/service/core/ai/sandbox/application/resource';
import { prepareSandboxRuntimeMirrors } from '@fastgpt/service/core/ai/sandbox/application/runtime/mirrors';
import {
  getRuntimeStateValue,
  readSandboxRuntimeState
} from '@fastgpt/service/core/ai/sandbox/application/runtime/state';
import { resolveSandboxHome } from '@fastgpt/service/core/ai/sandbox/application/runtime/home';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { buildSandboxResourceAdapter } from '@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter';
import { buildRuntimeHash } from '@fastgpt/service/core/ai/sandbox/utils';
import {
  SandboxInstanceStatusEnum,
  SandboxOperationTypeEnum,
  type SandboxProviderType
} from '@fastgpt/service/core/ai/sandbox/type';
import { getRunningSandboxId } from '@fastgpt/service/core/ai/sandbox/utils/id';
import type { ResourceLimits } from '@fastgpt-sdk/sandbox-adapter';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getSandboxIntegrationProvider, getSandboxIntegrationTimingBudgets } from './config';

const { Types } = connectionMongo;
const integrationProvider = getSandboxIntegrationProvider();
const timingBudgets = getSandboxIntegrationTimingBudgets();
const originalSandboxBucket = global.sandboxBucket;
const deleteWorkspaceArchiveNow = vi.fn(async () => undefined);

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

/** 删除前核对 Mongo 归属，并对可重放的 FastGPT delete lifecycle 最多重试三次。 */
const cleanupSandboxFixture = async (
  provider: SandboxProviderType,
  query: SandboxClientQuery,
  sandbox?: SandboxClient
) => {
  await sandbox?.provider.close().catch(() => undefined);

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
    memoryMiB: Number(process.env.AGENT_SANDBOX_MEMORY_MIB ?? 2048),
    storageSize: `${Number(process.env.AGENT_SANDBOX_STORAGE_SIZE_GI ?? 1)}Gi`
  };
  let toolFixture: SandboxFixture;

  beforeAll(async () => {
    global.sandboxBucket = {
      deleteWorkspaceArchiveNow
    } as unknown as typeof global.sandboxBucket;

    toolFixture = await createSandboxFixture(provider, 'tool-runtime', resourceLimits);
    await toolFixture.sandbox.provider.close();
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
          asRedisLogicalKey(`sandbox:preview:${toolFixture.query.sandboxId}:${sessionId}`)
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
      const pathSegments = new URL(file.fileUrl).pathname.split('/');
      const sandboxIndex = pathSegments.indexOf(toolFixture.query.sandboxId);
      previewSessionIds.add(pathSegments[sandboxIndex + 1]);
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
      await expectTimedToolError({
        operation: 'error.read-offset-beyond-end',
        toolName: SANDBOX_READ_FILE_TOOL_NAME,
        args: { path: 'docs/sample.txt', offset: 100 },
        sandbox: toolFixture.sandbox,
        message: /Offset 100 is beyond end of file/
      });
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

          await buildSandboxResourceAdapter(instance!).delete();
          await fixture.sandbox.provider.close();

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

    it.runIf(provider === 'opensandbox')(
      'replays a persisted failed provisioning operation',
      async () => {
        await withSandboxFixture(provider, 'failed-provision', async (fixture) => {
          const { query } = fixture;
          await fixture.sandbox.exec('printf persisted > failed-provision.txt');
          const instance = await MongoSandboxInstance.findOne({
            sandboxId: query.sandboxId
          }).lean();
          expect(instance).toBeTruthy();
          await buildSandboxResourceAdapter(instance!).delete();
          await fixture.sandbox.provider.close();

          const failedAt = new Date();
          await MongoSandboxInstance.updateOne(
            { sandboxId: query.sandboxId },
            {
              $set: {
                status: SandboxInstanceStatusEnum.provisioning,
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

          const retried = await measureOperation(
            'lifecycle.retry-failed-provisioning',
            timingBudgets.lifecycleMs,
            () => getSandboxClient(query)
          );
          fixture.sandbox = retried.value;
          expect(await fixture.sandbox.exec('cat failed-provision.txt')).toMatchObject({
            stdout: 'persisted',
            exitCode: 0
          });
          const retriedInstance = await MongoSandboxInstance.findOne({
            sandboxId: query.sandboxId
          }).lean();
          expect(retriedInstance?.status).toBe(SandboxInstanceStatusEnum.running);
          expect(retriedInstance?.operation).toBeUndefined();
        });
      }
    );

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

        await fixture.sandbox.provider.close();
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
            await Promise.all(clients.map((client) => client.provider.close()));
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

  it('backs up and restores the default apt sources around mirror configuration', async () => {
    await withSandboxFixture(provider, 'mirror-config-lifecycle', async ({ sandbox }) => {
      const homeDirectory = await resolveSandboxHome(sandbox.provider);
      if (!homeDirectory) throw new Error('Sandbox HOME is unavailable');

      const readTextFile = async (path: string): Promise<string> => {
        const [file] = await sandbox.provider.readFiles([path]);
        if (!file || file.error) {
          throw new Error(`Failed to read integration file ${path}`);
        }
        return Buffer.from(file.content).toString('utf-8');
      };
      const readOptionalTextFile = async (path: string): Promise<string | undefined> => {
        const [file] = await sandbox.provider.readFiles([path]);
        if (!file || file.error) return;
        return Buffer.from(file.content).toString('utf-8');
      };
      const readMirrorHash = async (key: string): Promise<string> => {
        const runtimeState = await readSandboxRuntimeState({
          sandbox: sandbox.provider,
          homeDirectory
        });
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
      const aptCopyPath = `${aptSourcePath}.copy`;
      const aptMirror = `https://apt-a.example.com/${osId === 'debian' ? 'debian' : 'ubuntu'}/`;

      await measureOperation('runtime.prepare-mirrors.initial', timingBudgets.lifecycleMs, () =>
        prepareSandboxRuntimeMirrors({ sandbox: sandbox.provider, config: {} })
      );
      const defaultAptSource = await readTextFile(aptSourcePath);

      expect(await readOptionalTextFile(aptCopyPath)).toBeUndefined();

      await measureOperation('runtime.prepare-mirrors.configured', timingBudgets.lifecycleMs, () =>
        prepareSandboxRuntimeMirrors({
          sandbox: sandbox.provider,
          config: { aptMirror }
        })
      );
      const configuredAptSource = await readTextFile(aptSourcePath);
      const aptCopy = await readTextFile(aptCopyPath);
      const configuredHash = await readMirrorHash('aptMirror');

      await measureOperation('runtime.prepare-mirrors.default', timingBudgets.lifecycleMs, () =>
        prepareSandboxRuntimeMirrors({
          sandbox: sandbox.provider,
          config: {}
        })
      );
      const restoredAptSource = await readTextFile(aptSourcePath);
      const restoredHash = await readMirrorHash('aptMirror');

      expect(aptCopy).toBe(defaultAptSource);
      expect(configuredAptSource).toContain(aptMirror);
      expect(configuredAptSource).not.toBe(defaultAptSource);
      expect(restoredAptSource).toBe(defaultAptSource);
      expect(configuredHash).toBe(buildRuntimeHash(aptMirror));
      expect(restoredHash).toBe(buildRuntimeHash(''));
    });
  });
});
