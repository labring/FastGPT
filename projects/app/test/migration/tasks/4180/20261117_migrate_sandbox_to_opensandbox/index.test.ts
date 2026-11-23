import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buffer } from 'node:stream/consumers';
import zlib from 'node:zlib';
import { createTarZstStream } from '@fastgpt/service/common/file/tarZst';
import { SANDBOX_ARCHIVE_PREFIX } from '@fastgpt/service/common/s3/sources/sandbox';
import { readTarZstEntries } from '@test/utils/tarZst';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import {
  getLegacySandboxInstanceCollection,
  MongoSandboxInstance
} from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { SandboxInstanceZodSchema } from '@fastgpt/service/core/ai/sandbox/type';
import {
  createMigrationContext as createSharedMigrationContext,
  getMockS3SandboxSource,
  insertLegacySandboxRow,
  insertV3SandboxRow,
  seedMigrationApp
} from '../sandbox_opensandbox_shared/helpers';

const s3State = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  throwOnAccess: false
}));

const extraMocks = vi.hoisted(() => ({
  assertSessionVolumeExists: vi.fn(
    async (claimName: string, _options?: { allowLegacyUnlabeled?: boolean }) => claimName
  ),
  deleteSessionVolume: vi.fn(async () => undefined),
  openSandboxDelete: vi.fn<(options?: { signal?: AbortSignal }) => Promise<void>>(
    async () => undefined
  ),
  tempSandboxEnsureRunning: vi.fn<
    (options?: { signal?: AbortSignal; operationId?: string }) => Promise<void>
  >(async () => undefined),
  tempSandboxDelete: vi.fn<(options?: { signal?: AbortSignal }) => Promise<void>>(
    async () => undefined
  ),
  createRuntimeOpenSandboxClient: vi.fn(),
  packSandboxDirectory: vi.fn(),
  disconnectSandbox: vi.fn(async () => undefined)
}));

vi.mock('@fastgpt/service/common/s3/sources/sandbox', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/common/s3/sources/sandbox')>();
  return {
    ...actual,
    getS3SandboxSource: () => getMockS3SandboxSource(s3State)
  };
});

vi.mock(
  '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@fastgpt/service/core/ai/sandbox/infrastructure/volume/service')
      >();
    return {
      ...actual,
      assertSessionVolumeExists: extraMocks.assertSessionVolumeExists,
      deleteSessionVolume: extraMocks.deleteSessionVolume
    };
  }
);

vi.mock(
  '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox')
      >();
    return {
      ...actual,
      createOpenSandboxResourceClient: vi.fn(() => ({
        id: 'mock-osb-cleanup-client',
        delete: extraMocks.openSandboxDelete,
        close: vi.fn(async () => undefined)
      })),
      createRuntimeOpenSandboxClient: (params: unknown) => {
        extraMocks.createRuntimeOpenSandboxClient(params);
        return {
          id: 'mock-osb-temp-migrator',
          ensureRunning: extraMocks.tempSandboxEnsureRunning,
          delete: extraMocks.tempSandboxDelete,
          close: vi.fn(async () => undefined)
        };
      },
      disconnectSandbox: extraMocks.disconnectSandbox
    };
  }
);

vi.mock('@fastgpt/service/core/ai/sandbox/application/ideAgent', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/application/ideAgent')>();
  return {
    ...actual,
    packSandboxDirectory: extraMocks.packSandboxDirectory
  };
});

import { migrateSandboxToOpenSandbox } from '@/migration/tasks/4180/20261117_migrate_sandbox_to_opensandbox';
import { migrateSandboxDoc } from '@/migration/tasks/4180/sandbox_opensandbox_shared/migrator';
import {
  buildTarZstArchiveInfo,
  commitMigratedSandboxArchive,
  hasMigratedV3Record,
  isLegacyOpenSandboxArchiveAuthoritative,
  LEGACY_MIGRATABLE_SANDBOX_FILTER,
  type SandboxMigrationDoc
} from '@/migration/tasks/4180/sandbox_opensandbox_shared/utils';

const createMigrationContext = () =>
  createSharedMigrationContext('20261117_migrate_sandbox_to_opensandbox');

const seedActiveApp = () => seedMigrationApp(false);

const seedLegacyRow = (overrides: Record<string, unknown> = {}) =>
  insertLegacySandboxRow({
    provider: 'sealosdevbox',
    status: SandboxInstanceStatusEnum.stopped,
    ...overrides
  });

/** Devbox 端产出的是未压缩 tar，这里复用编码器后解压得到等价的原始 tar 字节。 */
const buildMinimalValidTar = async (filePath: string, payloadText: string): Promise<Buffer> =>
  zlib.zstdDecompressSync(
    await buffer(
      createTarZstStream([
        { path: filePath, type: 'file', mode: 0o644, content: Buffer.from(payloadText, 'utf8') }
      ])
    )
  );

describe('migrateSandboxToOpenSandbox', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    extraMocks.assertSessionVolumeExists.mockClear();
    extraMocks.deleteSessionVolume.mockClear();
    extraMocks.openSandboxDelete.mockClear();
    extraMocks.tempSandboxEnsureRunning.mockClear();
    extraMocks.tempSandboxDelete.mockClear();
    extraMocks.createRuntimeOpenSandboxClient.mockClear();
    extraMocks.packSandboxDirectory.mockReset();
    extraMocks.disconnectSandbox.mockClear();
    s3State.objects.clear();
    s3State.throwOnAccess = false;
    await getLegacySandboxInstanceCollection().deleteMany({});
    await MongoSandboxInstance.collection.deleteMany({});
  });

  it('fast-paths an empty v2 collection without Sealos or S3 configuration', async () => {
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');
    s3State.throwOnAccess = true;

    const { context } = createMigrationContext();
    await expect(migrateSandboxToOpenSandbox(context)).resolves.toEqual({
      runningDevbox: 0,
      stoppedDevbox: 0,
      legacyArchives: 0
    });

    expect(context.reportProgress).toHaveBeenCalledWith({
      key: 'preflight',
      status: 'succeeded'
    });
    expect(context.reportProgress).toHaveBeenCalledWith({
      key: 'validation',
      status: 'succeeded'
    });
  });

  it('transcodes legacy JSZip archives into v3 + sandbox/archive-v2/ while leaving v2 row and package.zip untouched', async () => {
    const app = await seedActiveApp();
    const row = await seedLegacyRow({
      provider: 'sealosdevbox',
      instanceId: 'legacy-devbox-id',
      sourceId: app.appId,
      teamId: app.teamId,
      limit: { cpuCount: 2, memoryMiB: 2048 },
      versionId: 'v-123',
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        volumes: [{ name: 'workspace', claimName: 'old-pvc', mountPath: '/workspace' }]
      }
    });

    const longDir = `deep-${'x'.repeat(105)}`;
    const zip = new JSZip();
    zip.file('dir/hello.txt', 'hello world', { unixPermissions: '644' });
    zip.file(`${longDir}/测试-utf8.txt`, 'pax-utf8-body', { unixPermissions: '644' });
    zip.file('bin/run.sh', '#!/bin/sh\necho ok\n', { unixPermissions: '755' });
    zip.file('lost+found/ignored.txt', 'skip');
    zip.file('.fastgpt-sandbox-archive.zip', 'skip');

    const legacyZipKey = `sandbox/archive/${row.sandboxId}/package.zip`;
    s3State.objects.set(
      legacyZipKey,
      await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' })
    );

    const { context } = createMigrationContext();
    await expect(migrateSandboxToOpenSandbox(context)).resolves.toEqual({
      runningDevbox: 0,
      stoppedDevbox: 0,
      legacyArchives: 1
    });

    const migrated = await MongoSandboxInstance.collection.findOne({ _id: row._id });
    expect(migrated).toMatchObject({
      _id: row._id,
      provider: 'opensandbox',
      sandboxId: row.sandboxId,
      sourceType: row.sourceType,
      sourceId: app.appId,
      userId: row.userId,
      teamId: app.teamId,
      limit: { cpuCount: 2, memoryMiB: 2048 },
      versionId: 'v-123',
      status: 'archived',
      storage: {
        archive: {
          format: 'tar.zst'
        }
      }
    });
    expect(migrated?.storage?.archive?.objectKey).toMatch(
      new RegExp(
        `^${SANDBOX_ARCHIVE_PREFIX}/${encodeURIComponent(row.sandboxId)}/[a-f0-9]+\\.tar\\.zst$`
      )
    );
    expect(migrated).not.toHaveProperty('instanceId');
    expect(migrated).not.toHaveProperty('operation');
    expect(migrated?.storage).not.toHaveProperty('volumes');
    expect(() =>
      SandboxInstanceZodSchema.parse({
        ...migrated,
        _id: String(migrated?._id)
      })
    ).not.toThrow();

    // 双写隔离：v2 源记录与旧 package.zip 在阶段 1 必须保持完全未修改。
    const untouchedV2 = await getLegacySandboxInstanceCollection().findOne({ _id: row._id });
    expect(untouchedV2).toMatchObject({
      provider: 'sealosdevbox',
      instanceId: 'legacy-devbox-id',
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        volumes: [{ name: 'workspace', claimName: 'old-pvc', mountPath: '/workspace' }]
      }
    });
    expect(s3State.objects.has(legacyZipKey)).toBe(true);

    const uploadedKey = migrated?.storage?.archive?.objectKey as string;
    const compressedBuf = s3State.objects.get(uploadedKey)!;
    expect(compressedBuf.byteLength).toBe(migrated?.storage?.archive?.sizeBytes);

    const entries = await readTarZstEntries(compressedBuf);
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));

    expect(byPath.get('workspace/dir/hello.txt')?.content.toString('utf8')).toBe('hello world');
    expect(byPath.get(`workspace/${longDir}/测试-utf8.txt`)?.content.toString('utf8')).toBe(
      'pax-utf8-body'
    );
    expect(byPath.get('workspace/bin/run.sh')?.mode).toBe(0o755);
    expect(byPath.has('workspace/lost+found/ignored.txt')).toBe(false);
    expect(byPath.has('workspace/.fastgpt-sandbox-archive.zip')).toBe(false);
  });

  it('commits sizeBytes 0 in v3 without uploading an object for empty legacy zips and omits null limit', async () => {
    const app = await seedActiveApp();
    const row = await seedLegacyRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      limit: null,
      status: SandboxInstanceStatusEnum.archived
    });

    const emptyZip = await new JSZip().generateAsync({ type: 'nodebuffer' });
    const legacyKey = `sandbox/archive/${row.sandboxId}/package.zip`;
    s3State.objects.set(legacyKey, emptyZip);

    const { context } = createMigrationContext();
    await expect(migrateSandboxToOpenSandbox(context)).resolves.toEqual({
      runningDevbox: 0,
      stoppedDevbox: 0,
      legacyArchives: 1
    });

    const migrated = await MongoSandboxInstance.collection.findOne({ _id: row._id });
    expect(migrated?.storage?.archive).toMatchObject({
      format: 'tar.zst',
      sizeBytes: 0
    });
    expect(migrated?.storage?.archive?.objectKey).toMatch(
      new RegExp(`^${SANDBOX_ARCHIVE_PREFIX}/`)
    );
    expect(migrated).not.toHaveProperty('limit');
    expect([...s3State.objects.keys()]).toEqual([legacyKey]);
  });

  it('rejects Zip-Slip traversal while preserving POSIX symlinks and cache dirs under workspace/', async () => {
    const app = await seedActiveApp();
    const slipRow = await seedLegacyRow({
      provider: 'sealosdevbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.archived
    });
    const symlinkRow = await seedLegacyRow({
      provider: 'sealosdevbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.archived
    });

    // 通过等长文件名替换构造携带 `..` 遍历路径的 Zip-Slip 压缩包。
    const placeholderName = 'safe_place_holder.txt';
    const traversalName = '../evil_place_hold.tx';
    const baseZipBuf = await new JSZip()
      .file(placeholderName, 'bad')
      .generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
    const slipBuf = Buffer.from(baseZipBuf);
    let offset = 0;
    while ((offset = slipBuf.indexOf(placeholderName, offset)) !== -1) {
      slipBuf.write(traversalName, offset, 'utf8');
      offset += traversalName.length;
    }

    const longSymlinkTarget = `/opt/target/${'a'.repeat(110)}`;
    const symlinkZipBuf = await new JSZip()
      .file('src/app.py', 'print("ok")\n', { unixPermissions: 0o644 })
      .file('links/rel', '../src/app.py', { unixPermissions: 0o120777 })
      .file('sym', '/etc/passwd', { unixPermissions: 0o120777 })
      .file('links/long', longSymlinkTarget, { unixPermissions: 0o120777 })
      .file('node_modules/pkg/index.js', 'module.exports = 1;\n', { unixPermissions: 0o644 })
      .file('.venv/pyvenv.cfg', 'home = /usr/bin\n', { unixPermissions: 0o644 })
      .generateAsync({ type: 'nodebuffer', platform: 'UNIX' });

    s3State.objects.set(`sandbox/archive/${slipRow.sandboxId}/package.zip`, slipBuf);
    s3State.objects.set(`sandbox/archive/${symlinkRow.sandboxId}/package.zip`, symlinkZipBuf);

    const state = createMigrationContext();
    await expect(migrateSandboxToOpenSandbox(state.context)).rejects.toThrow('failed to migrate');

    const failures = state.failures();
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      stageKey: 'legacyArchives',
      data: { sandboxId: slipRow.sandboxId }
    });

    const lastReportOrder = state.context.reportFailedRecords.mock.invocationCallOrder.at(-1)!;
    const lastCheckpointOrder = state.context.saveCheckpoint.mock.invocationCallOrder.at(-1)!;
    expect(lastReportOrder).toBeLessThan(lastCheckpointOrder);

    expect(await MongoSandboxInstance.collection.findOne({ _id: slipRow._id })).toBeNull();
    const migratedSymlinkRow = await MongoSandboxInstance.collection.findOne({
      _id: symlinkRow._id
    });
    expect(migratedSymlinkRow).toMatchObject({
      provider: 'opensandbox',
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          format: 'tar.zst'
        }
      }
    });
    expect(Object.keys(migratedSymlinkRow?.storage ?? {})).toEqual(['archive']);

    const uploadedKey = migratedSymlinkRow?.storage?.archive?.objectKey as string;
    const entries = await readTarZstEntries(s3State.objects.get(uploadedKey)!);
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));

    expect(byPath.get('workspace/src/app.py')?.type).toBe('file');
    expect(byPath.get('workspace/src/app.py')?.content.toString('utf8')).toBe('print("ok")\n');
    expect(byPath.get('workspace/links/rel')).toMatchObject({
      type: 'symlink',
      linkname: '../src/app.py'
    });
    expect(byPath.get('workspace/links/rel')?.content.byteLength).toBe(0);
    expect(byPath.get('workspace/sym')).toMatchObject({
      type: 'symlink',
      linkname: '/etc/passwd'
    });
    expect(byPath.get('workspace/sym')?.content.byteLength).toBe(0);
    expect(byPath.get('workspace/links/long')).toMatchObject({
      type: 'symlink',
      linkname: longSymlinkTarget
    });
    expect(byPath.get('workspace/links/long')?.content.byteLength).toBe(0);
    expect(byPath.get('workspace/node_modules/pkg/index.js')?.content.toString('utf8')).toBe(
      'module.exports = 1;\n'
    );
    expect(byPath.get('workspace/.venv/pyvenv.cfg')?.content.toString('utf8')).toBe(
      'home = /usr/bin\n'
    );
  });

  it('executes 5-step quiesce migration for running Devbox into v3 while keeping v2 read-only and pausing Devbox', async () => {
    const app = await seedActiveApp();
    const secretToken = 'sealos-super-secret-token-xyz';
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', secretToken);

    const row = await seedLegacyRow({
      provider: 'sealosdevbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.running,
      operation: {
        id: 'op-legacy',
        type: 'activate',
        phase: 'providerEnsured',
        startedAt: new Date(),
        heartbeatAt: new Date()
      }
    });

    const tarBytes = await buildMinimalValidTar('app/main.py', 'print("quiesced")\n');
    let phase = 'Running';
    let truncateDownload = true;
    const events: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const pathname = new URL(url).pathname;

      if (init?.method === 'GET' && pathname === `/api/v1/devbox/${row.sandboxId}`) {
        events.push(`get:${phase}`);
        return new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            data: { name: row.sandboxId, state: { phase } }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (init?.method === 'POST' && pathname.endsWith('/pause')) {
        events.push('pause');
        phase = 'Paused';
        return new Response(
          JSON.stringify({ code: 200, message: 'ok', data: { name: row.sandboxId } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (init?.method === 'POST' && pathname.endsWith('/resume')) {
        events.push('resume');
        phase = 'Running';
        return new Response(
          JSON.stringify({ code: 200, message: 'ok', data: { name: row.sandboxId } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (init?.method === 'POST' && pathname.endsWith('/exec')) {
        const body = JSON.parse(String(init.body));
        const cmd = body.command as string[];
        if (cmd[0] === 'true') {
          events.push('exec:true');
          return new Response(
            JSON.stringify({
              code: 200,
              message: 'ok',
              data: { exitCode: 0, stdout: '', stderr: '' }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (cmd[0] === 'rm') {
          events.push('exec:rm');
          return new Response(
            JSON.stringify({
              code: 200,
              message: 'ok',
              data: { exitCode: 0, stdout: '', stderr: '' }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        events.push('exec:tar');
        expect(cmd[2]).toContain("--transform='s,^\\./,workspace/,S'");
        expect(cmd[2]).not.toContain('node_modules');
        expect(cmd[2]).not.toContain('.venv');
        return new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            data: { exitCode: 0, stdout: `TAR_BYTES:${tarBytes.length}\n`, stderr: '' }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (pathname.endsWith('/files/download')) {
        events.push(truncateDownload ? 'download:truncated' : 'download:full');
        const payload = truncateDownload ? tarBytes.subarray(0, 512) : tarBytes;
        return new Response(new Uint8Array(payload), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    // 首轮下载截断：严禁提交半包归档或写入 v3，且 v2 原文档须完整不动，finally 仍需清理并暂停 Devbox。
    const truncatedState = createMigrationContext();
    await expect(migrateSandboxToOpenSandbox(truncatedState.context)).rejects.toThrow(
      'failed to migrate'
    );
    expect(s3State.objects.size).toBe(0);
    expect(await MongoSandboxInstance.collection.findOne({ _id: row._id })).toBeNull();
    expect((await getLegacySandboxInstanceCollection().findOne({ _id: row._id }))?.provider).toBe(
      'sealosdevbox'
    );
    expect(JSON.stringify(truncatedState.failures())).not.toContain(secretToken);
    expect(events).toEqual([
      'get:Running',
      'get:Running',
      'pause',
      'get:Paused',
      'get:Paused',
      'resume',
      'get:Running',
      'exec:true',
      'exec:tar',
      'download:truncated',
      'exec:rm',
      'get:Running',
      'pause',
      'get:Paused'
    ]);

    // 恢复完整下载：按序重试失败记录并写入 v3，同时保持 v2 行不变。
    events.length = 0;
    truncateDownload = false;
    await expect(migrateSandboxToOpenSandbox(truncatedState.context)).resolves.toEqual({
      runningDevbox: 1,
      stoppedDevbox: 0,
      legacyArchives: 0
    });

    expect(truncatedState.failures()).toEqual([]);
    const migrated = await MongoSandboxInstance.collection.findOne({ _id: row._id });
    expect(migrated).toMatchObject({
      provider: 'opensandbox',
      status: 'archived',
      storage: { archive: { format: 'tar.zst' } }
    });
    expect(migrated?.storage?.archive?.objectKey).toMatch(
      new RegExp(`^${SANDBOX_ARCHIVE_PREFIX}/`)
    );
    expect(migrated).not.toHaveProperty('operation');

    const stillInV2 = await getLegacySandboxInstanceCollection().findOne({ _id: row._id });
    expect(stillInV2).toMatchObject({
      provider: 'sealosdevbox',
      status: SandboxInstanceStatusEnum.running
    });

    const decompressed = await readTarZstEntries(
      s3State.objects.get(migrated?.storage?.archive?.objectKey as string)!
    );
    expect(decompressed[0]?.content.toString('utf8')).toBe('print("quiesced")\n');
  });

  it('skips soft-deleted sources and strictly executes running -> stopped -> legacyArchives', async () => {
    const activeApp = await seedActiveApp();
    const deletedAppId = new Types.ObjectId();
    await MongoApp.collection.insertOne({
      _id: deletedAppId,
      teamId: new Types.ObjectId(activeApp.teamId),
      tmbId: new Types.ObjectId(activeApp.tmbId),
      name: 'Deleted App',
      deleteTime: new Date()
    } as any);

    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'token-order-test');

    const runningRow = await seedLegacyRow({
      provider: 'sealosdevbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.running
    });
    const stoppedRow = await seedLegacyRow({
      provider: 'sealosdevbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.stopped,
      storage: null
    });
    const zipRow = await seedLegacyRow({
      provider: 'sealosdevbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived
    });
    const orphanRow = await seedLegacyRow({
      provider: 'sealosdevbox',
      sourceId: String(deletedAppId),
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.running
    });

    const stageSequence: string[] = [];
    const phases = new Map<string, string>([
      [runningRow.sandboxId, 'Running'],
      [stoppedRow.sandboxId, 'Paused']
    ]);
    const tarBytes = await buildMinimalValidTar('ok.txt', 'ok');

    s3State.objects.set(
      `sandbox/archive/${zipRow.sandboxId}/package.zip`,
      await new JSZip().file('legacy.txt', 'zip-data').generateAsync({ type: 'nodebuffer' })
    );

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const pathname = new URL(url).pathname;
      const nameMatch = /^\/api\/v1\/devbox\/([^/]+)/.exec(pathname);
      const name = nameMatch ? decodeURIComponent(nameMatch[1]) : '';

      expect(name).not.toBe(orphanRow.sandboxId);

      if (init?.method === 'GET' && !pathname.endsWith('/files/download')) {
        return new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            data: { name, state: { phase: phases.get(name) ?? 'Paused' } }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (pathname.endsWith('/pause')) {
        phases.set(name, 'Paused');
        return new Response(JSON.stringify({ code: 200, message: 'ok', data: { name } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (pathname.endsWith('/resume')) {
        phases.set(name, 'Running');
        return new Response(JSON.stringify({ code: 200, message: 'ok', data: { name } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (pathname.endsWith('/exec')) {
        const body = JSON.parse(String(init?.body));
        const cmd = body.command as string[];
        if (cmd[0] === 'sh') {
          stageSequence.push(name);
          return new Response(
            JSON.stringify({
              code: 200,
              message: 'ok',
              data: { exitCode: 0, stdout: `TAR_BYTES:${tarBytes.length}\n`, stderr: '' }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            data: { exitCode: 0, stdout: '', stderr: '' }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (pathname.endsWith('/files/download')) {
        return new Response(new Uint8Array(tarBytes), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    const { context } = createMigrationContext();
    const originalUpload = s3State.objects.set.bind(s3State.objects);
    vi.spyOn(s3State.objects, 'set').mockImplementation((key, value) => {
      if (key.includes(zipRow.sandboxId) && key.endsWith('.tar.zst')) {
        stageSequence.push(zipRow.sandboxId);
      }
      return originalUpload(key, value);
    });

    await expect(migrateSandboxToOpenSandbox(context)).resolves.toEqual({
      runningDevbox: 1,
      stoppedDevbox: 1,
      legacyArchives: 1
    });
    expect(stageSequence).toEqual([runningRow.sandboxId, stoppedRow.sandboxId, zipRow.sandboxId]);
    // 已软删除来源的记录不得在迁移任务中被迁入 v3 或改写 v2，保留给清理任务统一销毁。
    expect(await MongoSandboxInstance.collection.findOne({ _id: orphanRow._id })).toBeNull();
    expect(
      (await getLegacySandboxInstanceCollection().findOne({ _id: orphanRow._id }))?.provider
    ).toBe('sealosdevbox');
  });

  it('clears stale preflight failures and retries validation stage failures on resume', async () => {
    const app = await seedActiveApp();
    const row = await seedLegacyRow({
      provider: 'sealosdevbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.archived
    });

    s3State.objects.set(
      `sandbox/archive/${row.sandboxId}/package.zip`,
      await new JSZip().file('main.py', 'print(1)\n').generateAsync({ type: 'nodebuffer' })
    );

    const state = createMigrationContext();
    await state.context.saveCheckpoint({
      runningDevbox: { lastId: null, migrated: 0, done: true },
      stoppedDevbox: { lastId: null, migrated: 0, done: true },
      legacyArchives: { lastId: null, migrated: 0, done: true }
    });
    await state.context.reportFailedRecords([
      {
        stageKey: 'preflight',
        data: { id: 'stale-preflight-id', sandboxId: 'stale-preflight-sb' },
        reason: { message: 'Missing previous env' }
      },
      {
        stageKey: 'validation',
        data: { id: String(row._id), sandboxId: row.sandboxId },
        reason: { message: 'Active sandbox record remains unmigrated' }
      }
    ]);

    await expect(migrateSandboxToOpenSandbox(state.context)).resolves.toEqual({
      runningDevbox: 0,
      stoppedDevbox: 0,
      legacyArchives: 1
    });

    expect(state.failures()).toEqual([]);
    const migrated = await MongoSandboxInstance.collection.findOne({ _id: row._id });
    expect(migrated).toMatchObject({
      provider: 'opensandbox',
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          format: 'tar.zst'
        }
      }
    });
    expect(Object.keys(migrated?.storage ?? {})).toEqual(['archive']);
  });

  it('skips v2 deleting rows (both sealosdevbox and opensandbox) without calling Sealos API or inserting into v3', async () => {
    const app = await seedActiveApp();
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'migrate-secret');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const deletingDevboxRow = await seedLegacyRow({
      provider: 'sealosdevbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.deleting
    });
    const deletingOpenSandboxRow = await seedLegacyRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.deleting,
      storage: {
        volumes: [{ name: 'workspace', claimName: 'pvc-deleting-v2', mountPath: '/workspace' }]
      }
    });

    const { context } = createMigrationContext();
    await expect(migrateSandboxToOpenSandbox(context)).resolves.toEqual({
      runningDevbox: 0,
      stoppedDevbox: 0,
      legacyArchives: 0
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(extraMocks.openSandboxDelete).not.toHaveBeenCalled();
    expect(extraMocks.deleteSessionVolume).not.toHaveBeenCalled();
    expect(
      await MongoSandboxInstance.collection.findOne({ _id: deletingDevboxRow._id })
    ).toBeNull();
    expect(
      await MongoSandboxInstance.collection.findOne({ _id: deletingOpenSandboxRow._id })
    ).toBeNull();
    expect(
      (await getLegacySandboxInstanceCollection().findOne({ _id: deletingDevboxRow._id }))?.status
    ).toBe(SandboxInstanceStatusEnum.deleting);
    expect(
      (await getLegacySandboxInstanceCollection().findOne({ _id: deletingOpenSandboxRow._id }))
        ?.status
    ).toBe(SandboxInstanceStatusEnum.deleting);
  });

  it('migrates pre-4.18.0 transitional opensandbox restoring and archiving rows into v3 in legacyArchives', async () => {
    const app = await seedActiveApp();
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    const restoringRow = await seedLegacyRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.restoring,
      storage: {
        archive: {
          objectKey: 'sandbox/archive/restoring-row/package.zip',
          generation: 'legacy',
          format: 'zip',
          sizeBytes: 12,
          archivedAt: new Date()
        }
      }
    });
    s3State.objects.set(
      `sandbox/archive/${restoringRow.sandboxId}/package.zip`,
      await new JSZip().file('app.txt', 'hello\n').generateAsync({ type: 'nodebuffer' })
    );

    const archivingRow = await seedLegacyRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.archiving,
      storage: {}
    });
    s3State.objects.set(
      `sandbox/archive/${archivingRow.sandboxId}/package.zip`,
      await new JSZip().generateAsync({ type: 'nodebuffer' })
    );

    const { context } = createMigrationContext();
    await expect(migrateSandboxToOpenSandbox(context)).resolves.toEqual({
      runningDevbox: 0,
      stoppedDevbox: 0,
      legacyArchives: 2
    });

    const updatedRestoring = await MongoSandboxInstance.collection.findOne({
      _id: restoringRow._id
    });
    expect(updatedRestoring?.status).toBe(SandboxInstanceStatusEnum.archived);
    expect(updatedRestoring?.storage?.archive?.format).toBe('tar.zst');
    expect(updatedRestoring?.storage?.archive?.sizeBytes).toBeGreaterThan(0);
    expect(updatedRestoring?.storage?.archive?.objectKey).toMatch(
      new RegExp(`^${SANDBOX_ARCHIVE_PREFIX}/`)
    );

    const updatedArchiving = await MongoSandboxInstance.collection.findOne({
      _id: archivingRow._id
    });
    expect(updatedArchiving?.status).toBe(SandboxInstanceStatusEnum.archived);
    expect(updatedArchiving?.storage?.archive?.format).toBe('tar.zst');
    expect(updatedArchiving?.storage?.archive?.sizeBytes).toBe(0);

    // v2 源记录必须原样保留。
    expect(
      (await getLegacySandboxInstanceCollection().findOne({ _id: restoringRow._id }))?.status
    ).toBe(SandboxInstanceStatusEnum.restoring);
    expect(
      (await getLegacySandboxInstanceCollection().findOne({ _id: archivingRow._id }))?.status
    ).toBe(SandboxInstanceStatusEnum.archiving);
  });

  it('rolls back uploaded .tar.zst object when commitMigratedSandboxArchive hits existing v3 source key or duplicate sandboxId (11000)', async () => {
    const app = await seedActiveApp();
    const existingV3 = await insertV3SandboxRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.running,
      storage: {
        volumes: [{ name: 'workspace', claimName: 'pvc-existing-v3', mountPath: '/home/sandbox' }]
      }
    });

    // 1) 同 (sourceType, sourceId, userId) 冲突：upsertedCount === 0。
    const sourceKeyUpload = buildTarZstArchiveInfo({
      sandboxId: existingV3.sandboxId,
      generation: 'racedgen1',
      sizeBytes: 42
    });
    s3State.objects.set(sourceKeyUpload.objectKey, Buffer.from('raced-zst-1'));

    const committedSameSource = await commitMigratedSandboxArchive({
      current: existingV3 as unknown as SandboxMigrationDoc,
      archive: sourceKeyUpload
    });
    expect(committedSameSource).toBe(false);
    expect(s3State.objects.has(sourceKeyUpload.objectKey)).toBe(false);

    // 2) 不同 source/userId 但同 (provider, sandboxId) 冲突：Mongo 11000 重复键。
    const dupSandboxDoc = {
      ...existingV3,
      _id: new Types.ObjectId(),
      userId: String(new Types.ObjectId())
    };
    const dupSandboxUpload = buildTarZstArchiveInfo({
      sandboxId: existingV3.sandboxId,
      generation: 'racedgen2',
      sizeBytes: 42
    });
    s3State.objects.set(dupSandboxUpload.objectKey, Buffer.from('raced-zst-2'));

    const committedDupSandboxId = await commitMigratedSandboxArchive({
      current: dupSandboxDoc as unknown as SandboxMigrationDoc,
      archive: dupSandboxUpload
    });
    expect(committedDupSandboxId).toBe(false);
    expect(s3State.objects.has(dupSandboxUpload.objectKey)).toBe(false);
  });

  it('distinguishes archive-authoritative vs active-volume archiving records, v3 existence, and v2 filter', async () => {
    const app = await seedActiveApp();

    const blockedWithoutOp = await seedLegacyRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.archiving,
      storage: {
        volumes: [{ name: 'workspace', claimName: 'sb-blocked-no-op' }]
      }
    });
    const blockedWrongOp = await seedLegacyRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.archiving,
      storage: {
        volumes: [{ name: 'workspace', claimName: 'sb-blocked-wrong-op' }]
      },
      operation: {
        id: 'op-del',
        type: 'delete',
        phase: 'claimed',
        previousStatus: SandboxInstanceStatusEnum.stopped,
        startedAt: new Date(),
        heartbeatAt: new Date()
      }
    });
    const activeArchiveRow = await seedLegacyRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.archiving,
      storage: {
        mountPath: '/workspace',
        volumes: [{ name: 'workspace', claimName: 'sb-active-archiving', mountPath: '/workspace' }]
      },
      operation: {
        id: 'op-arch',
        type: 'archive',
        phase: 'claimed',
        previousStatus: SandboxInstanceStatusEnum.stopped,
        startedAt: new Date(),
        heartbeatAt: new Date()
      }
    });
    const deletingRow = await seedLegacyRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.deleting
    });

    expect(
      isLegacyOpenSandboxArchiveAuthoritative(blockedWithoutOp as unknown as SandboxMigrationDoc)
    ).toBe(true);
    expect(
      isLegacyOpenSandboxArchiveAuthoritative(blockedWrongOp as unknown as SandboxMigrationDoc)
    ).toBe(true);
    expect(
      isLegacyOpenSandboxArchiveAuthoritative(activeArchiveRow as unknown as SandboxMigrationDoc)
    ).toBe(false);

    expect(await hasMigratedV3Record(activeArchiveRow as unknown as SandboxMigrationDoc)).toBe(
      false
    );
    await insertV3SandboxRow({
      provider: 'opensandbox',
      sandboxId: activeArchiveRow.sandboxId,
      sourceType: activeArchiveRow.sourceType,
      sourceId: activeArchiveRow.sourceId,
      userId: activeArchiveRow.userId,
      status: SandboxInstanceStatusEnum.archived
    });
    expect(await hasMigratedV3Record(activeArchiveRow as unknown as SandboxMigrationDoc)).toBe(
      true
    );

    const matchedIds = (
      await getLegacySandboxInstanceCollection()
        .find(LEGACY_MIGRATABLE_SANDBOX_FILTER)
        .project({ _id: 1 })
        .toArray()
    ).map((doc) => String(doc._id));
    expect(matchedIds).toContain(String(blockedWithoutOp._id));
    expect(matchedIds).toContain(String(blockedWrongOp._id));
    expect(matchedIds).toContain(String(activeArchiveRow._id));
    expect(matchedIds).not.toContain(String(deletingRow._id));
  });

  it('preserves legacy PVC, package.zip, and v2 row while cleaning only old container during zip transcode', async () => {
    const app = await seedActiveApp();
    const deletedApp = await seedMigrationApp(true);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    // 软删除源的 sealosdevbox 应在无 Sealos 环境变量时不触发 getSealosClient()。
    await seedLegacyRow({
      provider: 'sealosdevbox',
      sourceId: deletedApp.appId,
      teamId: deletedApp.teamId,
      status: SandboxInstanceStatusEnum.stopped
    });

    const row = await seedLegacyRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      instanceId: 'stale-osb-container-1',
      status: SandboxInstanceStatusEnum.restoring,
      storage: {
        volumes: [{ name: 'workspace', claimName: 'sb-legacy-pvc-cleanup' }]
      }
    });

    const zip = new JSZip();
    zip.file('app.py', 'print("ok")\n');
    zip.file('venv', 'regular-file-kept\n');
    zip.file('.next/build-manifest.json', '{}');
    zip.file('.nuxt/app.mjs', 'export {}');
    zip.file('.turbo/cache.json', '{}');
    zip.file('.parcel-cache/meta', 'x');
    zip.file('.cache/pip/wheel', 'x');
    zip.file('node_modules/pkg/index.js', 'module.exports = {}');
    zip.file('__pycache__/app.cpython-312.pyc', 'pyc');
    zip.file('.hidden.fastgpt-tmp-1234', 'atomic-tmp');
    const legacyZipKey = `sandbox/archive/${row.sandboxId}/package.zip`;
    s3State.objects.set(legacyZipKey, await zip.generateAsync({ type: 'nodebuffer' }));

    const statusDuringDelete: string[] = [];
    extraMocks.openSandboxDelete.mockImplementationOnce(async () => {
      const currentDoc = await getLegacySandboxInstanceCollection().findOne({ _id: row._id });
      statusDuringDelete.push(String(currentDoc?.status));
    });

    const { context } = createMigrationContext();
    await expect(migrateSandboxToOpenSandbox(context)).resolves.toEqual({
      runningDevbox: 0,
      stoppedDevbox: 0,
      legacyArchives: 1
    });

    expect(statusDuringDelete).toEqual([SandboxInstanceStatusEnum.restoring]);
    expect(extraMocks.openSandboxDelete).toHaveBeenCalledTimes(1);
    expect(extraMocks.openSandboxDelete).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
      allowLegacyUnlabeled: true
    });
    expect(extraMocks.disconnectSandbox).toHaveBeenCalledTimes(1);
    // 阶段 1 严禁删除旧 PVC，须完整保留供回滚。
    expect(extraMocks.deleteSessionVolume).not.toHaveBeenCalled();
    expect(s3State.objects.has(legacyZipKey)).toBe(true);

    const unchangedV2 = await getLegacySandboxInstanceCollection().findOne({ _id: row._id });
    expect(unchangedV2?.status).toBe(SandboxInstanceStatusEnum.restoring);

    const insertedV3 = await MongoSandboxInstance.collection.findOne({ _id: row._id });
    expect(insertedV3?.status).toBe(SandboxInstanceStatusEnum.archived);
    const zstKey = insertedV3?.storage?.archive?.objectKey as string;
    expect(zstKey).toMatch(new RegExp(`^${SANDBOX_ARCHIVE_PREFIX}/`));
    const tarEntries = (await readTarZstEntries(s3State.objects.get(zstKey)!)).map(
      (entry) => entry.path
    );
    expect(tarEntries).not.toContain('workspace/.hidden.fastgpt-tmp-1234');
    expect(tarEntries.filter((entry) => !entry.endsWith('/')).sort()).toEqual([
      'workspace/.cache/pip/wheel',
      'workspace/.next/build-manifest.json',
      'workspace/.nuxt/app.mjs',
      'workspace/.parcel-cache/meta',
      'workspace/.turbo/cache.json',
      'workspace/__pycache__/app.cpython-312.pyc',
      'workspace/app.py',
      'workspace/node_modules/pkg/index.js',
      'workspace/venv'
    ]);
  });

  it('aborts pre-commit cleanup and deletes uncommitted tar.zst when signal aborts during container cleanup', async () => {
    const app = await seedActiveApp();
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    const row = await seedLegacyRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      instanceId: 'stale-osb-container-abort',
      status: SandboxInstanceStatusEnum.restoring,
      storage: {
        volumes: [{ name: 'workspace', claimName: 'sb-legacy-pvc-abort' }]
      }
    });

    const zip = new JSZip();
    zip.file('main.py', 'print("hello")\n');
    const zipKey = `sandbox/archive/${row.sandboxId}/package.zip`;
    s3State.objects.set(zipKey, await zip.generateAsync({ type: 'nodebuffer' }));

    const controller = new AbortController();
    extraMocks.openSandboxDelete.mockImplementationOnce(async () => {
      controller.abort(new Error('lease lost during container delete'));
      throw new Error('lease lost during container delete');
    });

    await expect(
      migrateSandboxDoc({
        docId: row._id,
        sandboxId: row.sandboxId,
        workDirectory: '/home/devbox/workspace',
        signal: controller.signal
      })
    ).rejects.toThrow('lease lost during container delete');

    expect(extraMocks.deleteSessionVolume).not.toHaveBeenCalled();
    expect(extraMocks.disconnectSandbox).toHaveBeenCalledTimes(1);

    const unchanged = await getLegacySandboxInstanceCollection().findOne({ _id: row._id });
    expect(unchanged?.status).toBe(SandboxInstanceStatusEnum.restoring);
    expect(await MongoSandboxInstance.collection.findOne({ _id: row._id })).toBeNull();
    expect(s3State.objects.has(zipKey)).toBe(true);
    const zstKeys = [...s3State.objects.keys()].filter((key) => key.endsWith('.tar.zst'));
    expect(zstKeys).toEqual([]);
  });

  it('preserves legacy volumes, runtime, and recovery metadata as retryable failure when package.zip is missing during archiving migration', async () => {
    const app = await seedActiveApp();
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    const uploadedPhaseRow = await seedLegacyRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      instanceId: 'legacy-archiving-container-1',
      status: SandboxInstanceStatusEnum.archiving,
      storage: {
        volumes: [{ name: 'workspace', claimName: 'sb-legacy-nonempty-pvc-1' }],
        mountPath: '/workspace'
      },
      operation: {
        id: 'op-arch-uploaded',
        type: 'archive',
        phase: 'archiveUploaded',
        previousStatus: SandboxInstanceStatusEnum.stopped,
        startedAt: new Date(),
        heartbeatAt: new Date()
      }
    });

    const v415InterruptedRow = await seedLegacyRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      instanceId: 'legacy-archiving-container-2',
      status: SandboxInstanceStatusEnum.archiving,
      storage: {
        volumes: [{ name: 'workspace', claimName: 'sb-legacy-nonempty-pvc-2' }],
        mountPath: '/workspace'
      }
    });

    // 首轮：源 package.zip 缺失时严禁删除旧容器/旧卷或提交空归档，须完整保留旧状态与可重试失败记录。
    const state = createMigrationContext();
    await expect(migrateSandboxToOpenSandbox(state.context)).rejects.toThrow(
      'Some sandbox instances failed to migrate'
    );

    expect(extraMocks.openSandboxDelete).not.toHaveBeenCalled();
    expect(extraMocks.deleteSessionVolume).not.toHaveBeenCalled();
    expect(s3State.objects.size).toBe(0);
    expect(await MongoSandboxInstance.collection.countDocuments({})).toBe(0);

    expect(state.failures()).toHaveLength(2);
    expect(state.failures()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stageKey: 'legacyArchives',
          data: { id: String(uploadedPhaseRow._id), sandboxId: uploadedPhaseRow.sandboxId }
        }),
        expect.objectContaining({
          stageKey: 'legacyArchives',
          data: { id: String(v415InterruptedRow._id), sandboxId: v415InterruptedRow.sandboxId }
        })
      ])
    );

    const preservedUploaded = await getLegacySandboxInstanceCollection().findOne({
      _id: uploadedPhaseRow._id
    });
    expect(preservedUploaded).toMatchObject({
      status: SandboxInstanceStatusEnum.archiving,
      instanceId: 'legacy-archiving-container-1',
      storage: {
        volumes: [{ name: 'workspace', claimName: 'sb-legacy-nonempty-pvc-1' }],
        mountPath: '/workspace'
      },
      operation: {
        type: 'archive',
        phase: 'archiveUploaded'
      }
    });

    const preservedV415 = await getLegacySandboxInstanceCollection().findOne({
      _id: v415InterruptedRow._id
    });
    expect(preservedV415).toMatchObject({
      status: SandboxInstanceStatusEnum.archiving,
      instanceId: 'legacy-archiving-container-2',
      storage: {
        volumes: [{ name: 'workspace', claimName: 'sb-legacy-nonempty-pvc-2' }],
        mountPath: '/workspace'
      }
    });

    // 补齐真实 package.zip 后重跑：写入 v3 并保持旧 PVC 与 v2 记录不变。
    const nonEmptyZip = await new JSZip()
      .file('src/index.ts', 'export const ok = 1;\n')
      .generateAsync({ type: 'nodebuffer' });
    const emptyZip = await new JSZip().generateAsync({ type: 'nodebuffer' });
    s3State.objects.set(`sandbox/archive/${uploadedPhaseRow.sandboxId}/package.zip`, nonEmptyZip);
    s3State.objects.set(`sandbox/archive/${v415InterruptedRow.sandboxId}/package.zip`, emptyZip);

    await expect(migrateSandboxToOpenSandbox(state.context)).resolves.toEqual({
      runningDevbox: 0,
      stoppedDevbox: 0,
      legacyArchives: 2
    });

    expect(state.failures()).toEqual([]);
    expect(extraMocks.openSandboxDelete).toHaveBeenCalledTimes(2);
    expect(extraMocks.deleteSessionVolume).not.toHaveBeenCalled();

    const migratedUploaded = await MongoSandboxInstance.collection.findOne({
      _id: uploadedPhaseRow._id
    });
    expect(migratedUploaded?.status).toBe(SandboxInstanceStatusEnum.archived);
    expect(migratedUploaded?.storage?.archive?.format).toBe('tar.zst');
    expect(migratedUploaded?.storage?.archive?.sizeBytes).toBeGreaterThan(0);
    expect(migratedUploaded?.storage).not.toHaveProperty('volumes');
    expect(migratedUploaded).not.toHaveProperty('instanceId');
    expect(migratedUploaded).not.toHaveProperty('operation');

    const zstKey = migratedUploaded?.storage?.archive?.objectKey as string;
    const tarEntries = (await readTarZstEntries(s3State.objects.get(zstKey)!)).map(
      (entry) => entry.path
    );
    expect(tarEntries).toEqual(['workspace/src/', 'workspace/src/index.ts']);

    const migratedV415 = await MongoSandboxInstance.collection.findOne({
      _id: v415InterruptedRow._id
    });
    expect(migratedV415?.status).toBe(SandboxInstanceStatusEnum.archived);
    expect(migratedV415?.storage?.archive?.format).toBe('tar.zst');
    expect(migratedV415?.storage?.archive?.sizeBytes).toBe(0);
    expect(migratedV415?.storage).not.toHaveProperty('volumes');
    expect(migratedV415).not.toHaveProperty('instanceId');
  });

  it('migrates legacy /workspace OpenSandbox PVC into v3 tar.zst archive without deleting the old PVC or v2 row', async () => {
    const app = await seedActiveApp();
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    const row = await seedLegacyRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      instanceId: 'old-workspace-container-1',
      status: SandboxInstanceStatusEnum.running,
      storage: {
        mountPath: '/workspace',
        volumes: [
          { name: 'workspace', claimName: 'sb-legacy-workspace-pvc-1', mountPath: '/workspace' }
        ]
      }
    });

    const events: string[] = [];
    extraMocks.assertSessionVolumeExists.mockImplementationOnce(async (claimName) => {
      events.push('assert-volume-exists');
      return claimName;
    });
    extraMocks.openSandboxDelete.mockImplementationOnce(async () => {
      events.push('delete-old-container');
    });
    extraMocks.tempSandboxEnsureRunning.mockImplementationOnce(async () => {
      events.push('start-temp-container');
    });
    extraMocks.packSandboxDirectory.mockImplementationOnce(async () => {
      events.push('pack-home-scope');
      return createTarZstStream([
        {
          path: 'workspace/notes.txt',
          type: 'file',
          mode: 0o644,
          content: Buffer.from('legacy-pvc-data\n', 'utf8')
        }
      ]);
    });
    extraMocks.tempSandboxDelete.mockImplementationOnce(async () => {
      events.push('delete-temp-container');
    });

    const { context } = createMigrationContext();
    await expect(migrateSandboxToOpenSandbox(context)).resolves.toEqual({
      runningDevbox: 0,
      stoppedDevbox: 0,
      legacyArchives: 1
    });

    expect(events).toEqual([
      'assert-volume-exists',
      'delete-old-container',
      'start-temp-container',
      'pack-home-scope',
      'delete-temp-container'
    ]);
    expect(extraMocks.assertSessionVolumeExists).toHaveBeenCalledWith('sb-legacy-workspace-pvc-1', {
      allowLegacyUnlabeled: true,
      signal: expect.any(AbortSignal)
    });
    expect(extraMocks.createRuntimeOpenSandboxClient).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: row.sandboxId,
        volumes: [
          expect.objectContaining({
            name: 'workspace',
            mountPath: '/home/sandbox/workspace',
            pvc: expect.objectContaining({
              claimName: 'sb-legacy-workspace-pvc-1',
              createIfNotExists: false
            })
          })
        ]
      })
    );
    expect(extraMocks.tempSandboxEnsureRunning).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
      operationId: expect.stringMatching(/^migrate-volume-[a-f0-9]{12}$/)
    });
    expect(extraMocks.packSandboxDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        excludePatterns: [
          '/*',
          '!/workspace',
          '/workspace/lost+found/',
          '/workspace/.fastgpt-sandbox-*'
        ]
      })
    );
    expect(extraMocks.deleteSessionVolume).not.toHaveBeenCalled();

    const migrated = await MongoSandboxInstance.collection.findOne({ _id: row._id });
    expect(migrated).toMatchObject({
      provider: 'opensandbox',
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          format: 'tar.zst'
        }
      }
    });
    expect(migrated).not.toHaveProperty('instanceId');
    expect(migrated?.storage).not.toHaveProperty('volumes');
    expect(migrated?.storage).not.toHaveProperty('mountPath');
    expect(() =>
      SandboxInstanceZodSchema.parse({
        ...migrated,
        _id: String(migrated?._id)
      })
    ).not.toThrow();

    // v2 源记录及旧 PVC 挂载描述保持不变。
    const untouchedV2 = await getLegacySandboxInstanceCollection().findOne({ _id: row._id });
    expect(untouchedV2).toMatchObject({
      status: SandboxInstanceStatusEnum.running,
      instanceId: 'old-workspace-container-1',
      storage: {
        mountPath: '/workspace',
        volumes: [
          { name: 'workspace', claimName: 'sb-legacy-workspace-pvc-1', mountPath: '/workspace' }
        ]
      }
    });

    const zstKey = migrated?.storage?.archive?.objectKey as string;
    expect(zstKey).toMatch(new RegExp(`^${SANDBOX_ARCHIVE_PREFIX}/`));
    const entries = await readTarZstEntries(s3State.objects.get(zstKey)!);
    expect(entries.map((entry) => [entry.path, entry.content.toString('utf8')])).toEqual([
      ['workspace/notes.txt', 'legacy-pvc-data\n']
    ]);
  });

  it('fails without stopping old container or committing empty archive when legacy /workspace volume or claimName is missing', async () => {
    const app = await seedActiveApp();
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    const missingVolumeRow = await seedLegacyRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      instanceId: 'running-old-container-missing-vol',
      status: SandboxInstanceStatusEnum.running,
      storage: {
        mountPath: '/workspace',
        volumes: [
          { name: 'workspace', claimName: 'sb-missing-legacy-pvc', mountPath: '/workspace' }
        ]
      }
    });
    const missingClaimRow = await seedLegacyRow({
      provider: 'opensandbox',
      sourceId: app.appId,
      teamId: app.teamId,
      instanceId: 'running-old-container-missing-claim',
      status: SandboxInstanceStatusEnum.running,
      storage: {
        mountPath: '/workspace',
        volumes: [{ name: 'workspace', mountPath: '/workspace' }]
      }
    });

    extraMocks.assertSessionVolumeExists.mockRejectedValueOnce(
      new Error('volume-manager inspect error: 404 {"error":"Volume not found"}')
    );

    const state = createMigrationContext();
    await expect(migrateSandboxToOpenSandbox(state.context)).rejects.toThrow(
      'Some sandbox instances failed to migrate'
    );

    expect(extraMocks.assertSessionVolumeExists).toHaveBeenCalledTimes(1);
    expect(extraMocks.assertSessionVolumeExists).toHaveBeenCalledWith('sb-missing-legacy-pvc', {
      allowLegacyUnlabeled: true,
      signal: expect.any(AbortSignal)
    });
    expect(extraMocks.openSandboxDelete).not.toHaveBeenCalled();
    expect(extraMocks.createRuntimeOpenSandboxClient).not.toHaveBeenCalled();
    expect(extraMocks.deleteSessionVolume).not.toHaveBeenCalled();
    expect(s3State.objects.size).toBe(0);
    expect(await MongoSandboxInstance.collection.countDocuments({})).toBe(0);

    expect(state.failures()).toHaveLength(2);
    expect(state.failures()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stageKey: 'legacyArchives',
          data: { id: String(missingVolumeRow._id), sandboxId: missingVolumeRow.sandboxId }
        }),
        expect.objectContaining({
          stageKey: 'legacyArchives',
          data: { id: String(missingClaimRow._id), sandboxId: missingClaimRow.sandboxId }
        })
      ])
    );

    const preservedMissingVolume = await getLegacySandboxInstanceCollection().findOne({
      _id: missingVolumeRow._id
    });
    expect(preservedMissingVolume).toMatchObject({
      status: SandboxInstanceStatusEnum.running,
      instanceId: 'running-old-container-missing-vol',
      storage: {
        mountPath: '/workspace',
        volumes: [
          { name: 'workspace', claimName: 'sb-missing-legacy-pvc', mountPath: '/workspace' }
        ]
      }
    });

    const preservedMissingClaim = await getLegacySandboxInstanceCollection().findOne({
      _id: missingClaimRow._id
    });
    expect(preservedMissingClaim).toMatchObject({
      status: SandboxInstanceStatusEnum.running,
      instanceId: 'running-old-container-missing-claim',
      storage: {
        mountPath: '/workspace',
        volumes: [{ name: 'workspace', mountPath: '/workspace' }]
      }
    });
  });

  it('transcodes package.zip directly for sealosdevbox restoring rows and refuses missing remote Devbox fallback for stopped rows', async () => {
    const app = await seedActiveApp();
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'migrate-secret');

    const restoringDevboxRow = await seedLegacyRow({
      provider: 'sealosdevbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.restoring
    });
    s3State.objects.set(
      `sandbox/archive/${restoringDevboxRow.sandboxId}/package.zip`,
      await new JSZip().file('restored.txt', 'from-zip\n').generateAsync({ type: 'nodebuffer' })
    );

    const stoppedMissingRemoteRow = await seedLegacyRow({
      provider: 'sealosdevbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.stopped
    });
    // 即使 S3 上存在过期 package.zip，stopped 态 Devbox 缺失远端时也不得静默回退旧 ZIP。
    s3State.objects.set(
      `sandbox/archive/${stoppedMissingRemoteRow.sandboxId}/package.zip`,
      await new JSZip().file('stale.txt', 'stale\n').generateAsync({ type: 'nodebuffer' })
    );

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ code: 404, message: 'not found', data: null }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const state = createMigrationContext();
    await expect(migrateSandboxToOpenSandbox(state.context)).rejects.toThrow(
      'Some sandbox instances failed to migrate'
    );

    // restoringDevboxRow 直接转码 package.zip，不触发远端 Devbox REST 请求。
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(calledUrl).toContain(stoppedMissingRemoteRow.sandboxId);

    const migratedRestoring = await MongoSandboxInstance.collection.findOne({
      _id: restoringDevboxRow._id
    });
    expect(migratedRestoring).toMatchObject({
      provider: 'opensandbox',
      status: SandboxInstanceStatusEnum.archived,
      storage: { archive: { format: 'tar.zst' } }
    });
    expect(
      await MongoSandboxInstance.collection.findOne({ _id: stoppedMissingRemoteRow._id })
    ).toBeNull();
    expect(state.failures()).toEqual([
      expect.objectContaining({
        stageKey: 'stoppedDevbox',
        data: {
          id: String(stoppedMissingRemoteRow._id),
          sandboxId: stoppedMissingRemoteRow.sandboxId
        }
      })
    ]);
  });

  it('skips v2 rows already present in v3 without calling Sealos, OpenSandbox, or overwriting live v3 state', async () => {
    const app = await seedActiveApp();
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const v2Row = await seedLegacyRow({
      provider: 'sealosdevbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.running
    });
    const v3LiveRow = await insertV3SandboxRow({
      provider: 'opensandbox',
      sandboxId: v2Row.sandboxId,
      sourceType: v2Row.sourceType,
      sourceId: v2Row.sourceId,
      userId: v2Row.userId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.running,
      instanceId: 'live-v3-container',
      storage: {
        mountPath: '/home/sandbox',
        volumes: [{ name: 'workspace', claimName: 'pvc-live-v3', mountPath: '/home/sandbox' }]
      }
    });

    const { context } = createMigrationContext();
    await expect(migrateSandboxToOpenSandbox(context)).resolves.toEqual({
      runningDevbox: 0,
      stoppedDevbox: 0,
      legacyArchives: 0
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(extraMocks.openSandboxDelete).not.toHaveBeenCalled();
    const preservedV3 = await MongoSandboxInstance.collection.findOne({ _id: v3LiveRow._id });
    expect(preservedV3).toMatchObject({
      status: SandboxInstanceStatusEnum.running,
      instanceId: 'live-v3-container'
    });
  });

  it('treats 4.17.x Devbox providerDeleted archiving rows as archive-authoritative without requiring Sealos', async () => {
    const app = await seedActiveApp();
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const row = await seedLegacyRow({
      provider: 'sealosdevbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.archiving,
      operation: {
        id: 'op-devbox-provider-deleted',
        type: 'archive',
        phase: 'providerDeleted',
        previousStatus: SandboxInstanceStatusEnum.stopped
      }
    });
    const zipBuffer = await new JSZip()
      .file('devbox.txt', 'from-provider-deleted-zip\n')
      .generateAsync({ type: 'nodebuffer' });
    s3State.objects.set(`sandbox/archive/${row.sandboxId}/package.zip`, zipBuffer);

    const { context } = createMigrationContext();
    await expect(migrateSandboxToOpenSandbox(context)).resolves.toEqual({
      runningDevbox: 0,
      stoppedDevbox: 1,
      legacyArchives: 0
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    const migrated = await MongoSandboxInstance.collection.findOne({ _id: row._id });
    expect(migrated?.status).toBe(SandboxInstanceStatusEnum.archived);
    const entries = await readTarZstEntries(
      s3State.objects.get(migrated?.storage?.archive?.objectKey as string)!
    );
    expect(entries.map((entry) => [entry.path, entry.content.toString('utf8')])).toEqual([
      ['workspace/devbox.txt', 'from-provider-deleted-zip\n']
    ]);
  });

  it('wraps TimeoutError from Sealos poll requests as transient SealosRequestError so polling retries succeed', async () => {
    const app = await seedActiveApp();
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'timeout-retry-token');

    const row = await seedLegacyRow({
      provider: 'sealosdevbox',
      sourceId: app.appId,
      teamId: app.teamId,
      status: SandboxInstanceStatusEnum.stopped
    });
    const tarBytes = await buildMinimalValidTar('recovered.txt', 'after-timeout\n');
    let currentPhase = 'Paused';
    let probeExecCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const pathname = new URL(url).pathname;

      if (init?.method === 'GET' && pathname === `/api/v1/devbox/${row.sandboxId}`) {
        return new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            data: { name: row.sandboxId, state: { phase: currentPhase } }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (pathname.endsWith('/resume')) {
        currentPhase = 'Running';
        return new Response(
          JSON.stringify({ code: 200, message: 'ok', data: { name: row.sandboxId } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (pathname.endsWith('/pause')) {
        currentPhase = 'Paused';
        return new Response(
          JSON.stringify({ code: 200, message: 'ok', data: { name: row.sandboxId } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (pathname.endsWith('/exec')) {
        const body = JSON.parse(String(init?.body));
        const cmd = body.command as string[];
        if (cmd[0] === 'true') {
          probeExecCount += 1;
          if (probeExecCount === 1) {
            throw new DOMException('The operation timed out', 'TimeoutError');
          }
        }
        return new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            data: {
              exitCode: 0,
              stdout: cmd[0] === 'sh' ? `TAR_BYTES:${tarBytes.length}\n` : '',
              stderr: ''
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (pathname.endsWith('/files/download')) {
        return new Response(new Uint8Array(tarBytes), {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' }
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const { context } = createMigrationContext();
    await expect(migrateSandboxToOpenSandbox(context)).resolves.toEqual({
      runningDevbox: 0,
      stoppedDevbox: 1,
      legacyArchives: 0
    });
    expect(probeExecCount).toBe(2);
  });
});
