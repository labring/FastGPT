import { Readable } from 'node:stream';
import { vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import {
  LEGACY_SANDBOX_ARCHIVE_PREFIX,
  SANDBOX_ARCHIVE_PREFIX
} from '@fastgpt/service/common/s3/sources/sandbox';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import {
  getLegacySandboxInstanceCollection,
  MongoSandboxInstance
} from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import type { SystemMigrationContext } from '@/migration/registry';

export type SandboxS3MockState = {
  objects: Map<string, Buffer>;
  throwOnAccess: boolean;
  listError?: Error;
  deleteArchiveObjectSpy?: (key: string) => void;
  deleteSandboxArchivesSpy?: (params: { sandboxId: string }) => void;
};

export const createSandboxS3SourceMock = (state: SandboxS3MockState) => ({
  uploadArchiveStream: vi.fn(async ({ key, body }: { key: string; body: Readable }) => {
    if (state.throwOnAccess) {
      throw new Error('S3 not configured');
    }
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    state.objects.set(key, buffer);
    return { sizeBytes: buffer.byteLength };
  }),
  isObjectExists: vi.fn(async (key: string) => {
    if (state.throwOnAccess) {
      throw new Error('S3 not configured');
    }
    return state.objects.has(key);
  }),
  deleteArchiveObject: vi.fn(async ({ key }: { key: string }) => {
    state.deleteArchiveObjectSpy?.(key);
    state.objects.delete(key);
  }),
  deleteSandboxArchives: vi.fn(async (params: { sandboxId: string }) => {
    state.deleteSandboxArchivesSpy?.(params);
    const prefix = `${SANDBOX_ARCHIVE_PREFIX}/${encodeURIComponent(params.sandboxId)}/`;
    for (const key of [...state.objects.keys()]) {
      if (key.startsWith(prefix)) {
        state.objects.delete(key);
      }
    }
  }),
  client: {
    getObjectMetadata: vi.fn(async ({ key }: { key: string }) => {
      if (state.throwOnAccess) {
        throw new Error('S3 not configured');
      }
      const buf = state.objects.get(key);
      if (!buf) {
        const error = new Error(`NoSuchKey: ${key}`);
        (error as Error & { name?: string }).name = 'NoSuchKey';
        throw error;
      }
      return {
        bucket: 'test-bucket',
        key,
        metadata: {},
        contentLength: buf.byteLength
      };
    }),
    downloadObject: vi.fn(
      async ({ key, range }: { key: string; range?: { start: number; end: number } }) => {
        if (state.throwOnAccess) {
          throw new Error('S3 not configured');
        }
        const buf = state.objects.get(key);
        if (!buf) {
          const error = new Error(`NoSuchKey: ${key}`);
          (error as Error & { name?: string }).name = 'NoSuchKey';
          throw error;
        }
        const slice = range ? buf.subarray(range.start, range.end + 1) : buf;
        return { body: Readable.from(slice) };
      }
    ),
    listObjects: vi.fn(async ({ prefix = '' }: { prefix?: string }) => {
      if (state.listError) {
        throw state.listError;
      }
      if (state.throwOnAccess) {
        throw new Error('S3 not configured');
      }
      return {
        bucket: 'test-bucket',
        keys: [...state.objects.keys()].filter((key) => key.startsWith(prefix))
      };
    })
  }
});

export const getMockS3SandboxSource = (state: SandboxS3MockState) => {
  if (state.throwOnAccess) {
    throw new Error('S3 should not be accessed during empty preflight fast path');
  }
  return createSandboxS3SourceMock(state);
};

export const createMigrationContext = (migrationId: string) => {
  let checkpoint: Record<string, unknown> | undefined;
  let failures: SystemMigrationFailedRecord[] = [];

  const context = {
    migrationId,
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint ? schema.parse(structuredClone(checkpoint)) : undefined,
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
    }),
    getFailedRecords: async () => structuredClone(failures),
    reportFailedRecords: vi.fn(async (value: SystemMigrationFailedRecord[]) => {
      failures = structuredClone(value);
    }),
    assertActive: vi.fn(async () => undefined),
    reportProgress: vi.fn<SystemMigrationContext['reportProgress']>(async () => undefined),
    fail: vi.fn(async (input: SystemMigrationFailureInput): Promise<never> => {
      failures = structuredClone(input.failedRecords ?? failures);
      throw new Error(input.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;

  return {
    context,
    failures: () => failures
  };
};

export const seedMigrationApp = async (deleted = false) => {
  const _id = new Types.ObjectId();
  const teamId = new Types.ObjectId();
  const tmbId = new Types.ObjectId();
  await MongoApp.collection.insertOne({
    _id,
    teamId,
    tmbId,
    name: `App-${_id}`,
    deleteTime: deleted ? new Date() : null
  } as any);
  return { appId: String(_id), teamId: String(teamId), tmbId: String(tmbId) };
};

const buildMigrationSandboxDoc = (overrides: Record<string, unknown> = {}) => {
  const _id = new Types.ObjectId();
  return {
    _id,
    provider: 'opensandbox',
    sandboxId: `app-${_id.toString().slice(-12)}`,
    sourceType: ChatSourceTypeEnum.app,
    sourceId: String(new Types.ObjectId()),
    userId: String(new Types.ObjectId()),
    status: SandboxInstanceStatusEnum.archived,
    lastActiveAt: new Date(),
    createdAt: new Date(),
    ...overrides
  };
};

/** 向只读源集合 `agent_sandbox_instances_v2` 插入测试夹具文档。 */
export const insertLegacySandboxRow = async (overrides: Record<string, unknown> = {}) => {
  const doc = buildMigrationSandboxDoc(overrides);
  await getLegacySandboxInstanceCollection().insertOne(doc as any);
  return doc;
};

/** 向 4.18.0 新集合 `agent_sandbox_instances_v3` 插入测试夹具文档。 */
export const insertV3SandboxRow = async (overrides: Record<string, unknown> = {}) => {
  const doc = buildMigrationSandboxDoc(overrides);
  await MongoSandboxInstance.collection.insertOne(doc as any);
  return doc;
};
