import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import JSZip from 'jszip';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Types, connectionMongo } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { buffer } from 'node:stream/consumers';
import zlib from 'node:zlib';
import { createTarZstStream, type TarEntry } from '@fastgpt/service/common/file/tarZst';
import {
  SANDBOX_ARCHIVE_PREFIX,
  S3SandboxSource
} from '@fastgpt/service/common/s3/sources/sandbox';
import { S3SkillSource } from '@fastgpt/service/common/s3/sources/skill';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import {
  sandboxMigrationId,
  systemMigrationStateCollectionName
} from '@fastgpt/global/migration/constants';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import { getSandboxStaticRuntimePaths } from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/runtimeProfile';
import { deleteSandboxResource } from '@fastgpt/service/core/ai/sandbox/application/resource';
import {
  getSkillEditRuntimeContext,
  initSkillEditRuntimeSandbox
} from '@fastgpt/service/core/ai/sandbox/application/skillEdit/runtime';
import {
  getLegacySandboxInstanceCollection,
  MongoSandboxInstance
} from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { joinSandboxPath } from '@fastgpt/service/core/ai/sandbox/utils';
import { getRunningSandboxId } from '@fastgpt/service/core/ai/sandbox/utils/id';
import { importSkill } from '@fastgpt/service/core/ai/skill/manage';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import {
  EDIT_DEBUG_SANDBOX_CHAT_ID,
  getEditDebugSandboxId
} from '@fastgpt/service/core/ai/skill/edit/config';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import type { SystemMigrationContext } from '@/migration/registry';
import { migrateSandboxToOpenSandbox } from '@/migration/tasks/4180/20261117_migrate_sandbox_to_opensandbox';
import { cleanupLegacySandboxResources } from '@/migration/tasks/4180/20261117_cleanup_legacy_sandbox_resources';
import * as sealosClientModule from '@/migration/tasks/4180/sandbox_opensandbox_shared/sealosClient';
import type {
  SealosDevboxInfo,
  SealosMigrationClient
} from '@/migration/tasks/4180/sandbox_opensandbox_shared/sealosClient';
import { getSandboxIntegrationProvider } from './config';

const integrationProvider = getSandboxIntegrationProvider();
// 仅在指向独立隔离库（而非本地研发复用的 fastgpt dev 库）时运行全库迁移集成测试，避免误操作开发库已有文档。
const mongoUri = process.env.SANDBOX_INTEGRATION_MONGODB_URI ?? '';
const isIsolatedMigrationDb =
  process.env.SANDBOX_MIGRATION_REAL_INTEGRATION === 'true' && !/\/fastgpt(\?|$)/.test(mongoUri);

type FakeDevboxState = {
  phase: 'Running' | 'Stopped' | 'Paused';
  archiveBuffer: Buffer;
  execCalls: string[][];
  pauseCount: number;
  resumeCount: number;
  deleteCount: number;
  deleted: boolean;
  failExec?: boolean;
};

/**
 * 构造真实集成测试用 SystemMigrationContext，完整实现 runner 提供的生命周期契约。
 */
const createRealMigrationContext = (
  migrationId: string,
  options?: {
    initialCheckpoint?: unknown;
    initialFailedRecords?: SystemMigrationFailedRecord[];
  }
): {
  context: SystemMigrationContext;
  checkpoints: unknown[];
  progressUpdates: unknown[];
  failedRecords: SystemMigrationFailedRecord[];
} => {
  let currentCheckpoint =
    options?.initialCheckpoint === undefined
      ? undefined
      : structuredClone(options.initialCheckpoint);
  const checkpoints: unknown[] = [];
  const progressUpdates: unknown[] = [];
  const failedRecords: SystemMigrationFailedRecord[] = structuredClone(
    options?.initialFailedRecords ?? []
  );
  const controller = new AbortController();

  const context: SystemMigrationContext = {
    migrationId,
    runId: `real-run-${randomUUID()}`,
    signal: controller.signal,
    getCheckpoint: async (schema) =>
      currentCheckpoint === undefined
        ? undefined
        : schema.parse(structuredClone(currentCheckpoint)),
    getFailedRecords: async () => structuredClone(failedRecords),
    reportFailedRecords: async (input) => {
      failedRecords.splice(0, failedRecords.length, ...structuredClone(input));
    },
    saveCheckpoint: async (next: unknown) => {
      currentCheckpoint = structuredClone(next);
      checkpoints.push(structuredClone(next));
    },
    reportProgress: async (progress) => {
      progressUpdates.push(progress);
    },
    assertActive: async () => undefined,
    fail: async (error) => {
      if (error.failedRecords) {
        failedRecords.splice(0, failedRecords.length, ...structuredClone(error.failedRecords));
      }
      const msg =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : String(error);
      throw new Error(
        `${msg} :: error=${JSON.stringify(error)} :: failedRecords=${JSON.stringify(failedRecords)}`
      );
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined
    }
  };

  return { context, checkpoints, progressUpdates, failedRecords };
};

/**
 * 将内存条目列表编码为未压缩 POSIX/PAX tar 字节流，模拟 Sealos Devbox 本地打包产物。
 */
const encodeEntriesToTarBuffer = async (entries: TarEntry[]): Promise<Buffer> =>
  zlib.zstdDecompressSync(await buffer(createTarZstStream(entries)));

/**
 * 构造可追踪生命周期、命令调用和流式下载的 Sealos Devbox 内存替身（仅替换外部 Sealos REST API）。
 */
const createFakeSealosClient = (devboxes: Map<string, FakeDevboxState>): SealosMigrationClient => ({
  getDevbox: async (name: string): Promise<SealosDevboxInfo | null> => {
    const state = devboxes.get(name);
    if (!state || state.deleted) return null;
    return {
      name,
      state: { phase: state.phase }
    };
  },
  pauseAndWaitStopped: async (name: string) => {
    const state = devboxes.get(name);
    if (!state || state.deleted) throw new Error(`Devbox ${name} not found`);
    state.pauseCount += 1;
    state.phase = 'Stopped';
  },
  resumeAndWaitReady: async (name: string) => {
    const state = devboxes.get(name);
    if (!state || state.deleted) throw new Error(`Devbox ${name} not found`);
    state.resumeCount += 1;
    state.phase = 'Running';
  },
  exec: async (name: string, options) => {
    const state = devboxes.get(name);
    if (!state || state.deleted) throw new Error(`Devbox ${name} not found`);
    state.execCalls.push(options.command);
    if (state.failExec) {
      return { exitCode: 1, stdout: '', stderr: 'injected devbox exec failure' };
    }
    const joined = options.command.join(' ');
    if (joined.includes('TAR_BYTES')) {
      return {
        exitCode: 0,
        stdout: `TAR_BYTES:${state.archiveBuffer.length}\n`,
        stderr: ''
      };
    }
    if (joined.includes('stat') || joined.includes('test ') || joined.includes('[ -')) {
      return { exitCode: 0, stdout: 'EXISTS\n', stderr: '' };
    }
    return { exitCode: 0, stdout: 'ok\n', stderr: '' };
  },
  downloadFileStream: async (name: string) => {
    const state = devboxes.get(name);
    if (!state || state.deleted) throw new Error(`Devbox ${name} not found`);
    return Readable.from([state.archiveBuffer]);
  },
  deleteDevbox: async (name: string) => {
    const state = devboxes.get(name);
    if (!state || state.deleted) return false;
    state.deleteCount += 1;
    state.deleted = true;
    return true;
  }
});

describe
  .skipIf(!integrationProvider || !isIsolatedMigrationDb)
  .sequential('4.18.0 Sandbox -> OpenSandbox Real Infrastructure Migration', () => {
    const originalSandboxBucket = global.sandboxBucket;
    const originalSkillBucket = global.skillBucket;
    const originalFeConfigs = global.feConfigs;
    const originalSealosBase = process.env.AGENT_SANDBOX_SEALOS_BASEURL;
    const originalSealosToken = process.env.AGENT_SANDBOX_SEALOS_TOKEN;

    let s3Sandbox: S3SandboxSource;
    let s3Skill: S3SkillSource;
    const createdSandboxIds: string[] = [];
    const createdS3SandboxKeys: string[] = [];
    const createdS3SkillKeys: string[] = [];
    const createdContainerRecords: string[] = [];

    beforeAll(async () => {
      const { mongoSessionRun: actualMongoSessionRun } = await vi.importActual<
        typeof import('@fastgpt/service/common/mongo/sessionRun')
      >('@fastgpt/service/common/mongo/sessionRun');
      vi.mocked(mongoSessionRun).mockImplementation(actualMongoSessionRun);

      s3Sandbox = new S3SandboxSource();
      s3Skill = new S3SkillSource();
      await s3Sandbox.client.ensureBucket();
      global.sandboxBucket = s3Sandbox;
      global.skillBucket = s3Skill;
      global.feConfigs = {
        ...(originalFeConfigs ?? {}),
        show_agent_sandbox: true
      } as typeof global.feConfigs;

      process.env.AGENT_SANDBOX_SEALOS_BASEURL = 'http://fake-sealos.local';
      process.env.AGENT_SANDBOX_SEALOS_TOKEN = 'fake-sealos-token-for-migration-test';
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      for (const sandboxId of createdContainerRecords.splice(0)) {
        const doc = await MongoSandboxInstance.findOne({ sandboxId }).lean();
        if (doc && doc.provider === 'opensandbox') {
          await deleteSandboxResource({ ...doc, provider: 'opensandbox' }).catch(() => undefined);
        }
      }
      for (const sandboxId of createdSandboxIds.splice(0)) {
        await s3Sandbox.deleteSandboxArchives({ sandboxId }).catch(() => undefined);
      }
      for (const key of createdS3SandboxKeys.splice(0)) {
        await s3Sandbox.removeObject(key).catch(() => undefined);
      }
      for (const key of createdS3SkillKeys.splice(0)) {
        await s3Skill.removeObject(key).catch(() => undefined);
      }
      await MongoSandboxInstance.deleteMany({});
      await getLegacySandboxInstanceCollection().deleteMany({});
      await MongoSandboxInstance.db
        .collection(systemMigrationStateCollectionName)
        .deleteMany({ _id: sandboxMigrationId as never });
      await MongoAgentSkills.deleteMany({});
      await MongoAgentSkillsVersion.deleteMany({});
      await MongoApp.deleteMany({});
    });

    afterAll(async () => {
      if (isIsolatedMigrationDb && connectionMongo.connection.db) {
        await connectionMongo.connection.db.dropDatabase().catch(() => undefined);
      }
      global.sandboxBucket = originalSandboxBucket;
      global.skillBucket = originalSkillBucket;
      global.feConfigs = originalFeConfigs;
      if (originalSealosBase === undefined) delete process.env.AGENT_SANDBOX_SEALOS_BASEURL;
      else process.env.AGENT_SANDBOX_SEALOS_BASEURL = originalSealosBase;
      if (originalSealosToken === undefined) delete process.env.AGENT_SANDBOX_SEALOS_TOKEN;
      else process.env.AGENT_SANDBOX_SEALOS_TOKEN = originalSealosToken;
    });

    it('migrates running/stopped devboxes, legacy S3 zip archives (incl. empty/PAX/UTF-8/prune) & skill packages on real Mongo rs0 + RustFS, then cold-restores in Docker OpenSandbox and cleans up after completion gate', async () => {
      // 1. 构造各类存量测试夹具（全部写入真实 MongoDB rs0 与真实 RustFS）
      const teamId = String(new Types.ObjectId());
      const tmbId = String(new Types.ObjectId());
      const userId = `mig-user-${randomUUID()}`;

      // 1a. running sealosdevbox（含 UTF-8 文件、0755 可执行脚本、软链与需剪枝的 node_modules/.cache + .git）
      const runningApp = await MongoApp.create({
        name: 'Mig Running Devbox App',
        type: AppTypeEnum.simple,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        modules: []
      });
      const runningSandboxId = getRunningSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(runningApp._id),
        userId
      });
      createdSandboxIds.push(runningSandboxId);
      createdContainerRecords.push(runningSandboxId);

      const runningScript = Buffer.from('#!/bin/sh\necho migrated-running\n', 'utf8');
      const runningUtf8 = Buffer.from('迁移运行态中文内容\n', 'utf8');
      const runningTarZst = await encodeEntriesToTarBuffer([
        {
          path: 'workspace/bin/hello.sh',
          type: 'file',
          mode: 0o755,
          content: runningScript
        },
        {
          path: 'workspace/目录/说明.txt',
          type: 'file',
          mode: 0o644,
          content: runningUtf8
        },
        {
          path: 'workspace/links/hello-link.sh',
          type: 'symlink',
          mode: 0o777,
          linkname: '../bin/hello.sh'
        }
      ]);
      const runningDevboxName = `fastgpt-mig-run-${randomUUID().slice(0, 8)}`;

      await getLegacySandboxInstanceCollection().insertOne({
        provider: 'sealosdevbox',
        sandboxId: runningSandboxId,
        instanceId: runningDevboxName,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(runningApp._id),
        userId,
        teamId,
        status: SandboxInstanceStatusEnum.running,
        metadata: {
          devboxName: runningDevboxName,
          runtimeImage: 'legacy-devbox:v1'
        },
        createdAt: new Date(),
        lastActiveAt: new Date()
      });

      // 1b. stopped sealosdevbox（未归档的冻结 Devbox，需要 resume -> 抽包 -> archive -> opensandbox）
      const stoppedDevboxApp = await MongoApp.create({
        name: 'Mig Stopped Devbox App',
        type: AppTypeEnum.simple,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        modules: []
      });
      const stoppedDevboxSandboxId = getRunningSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(stoppedDevboxApp._id),
        userId
      });
      createdSandboxIds.push(stoppedDevboxSandboxId);
      createdContainerRecords.push(stoppedDevboxSandboxId);
      const stoppedDevboxTarZst = await encodeEntriesToTarBuffer([
        {
          path: 'workspace/stopped-devbox/state.txt',
          type: 'file',
          mode: 0o644,
          content: Buffer.from('from-stopped-sealos-devbox\n')
        }
      ]);
      await getLegacySandboxInstanceCollection().insertOne({
        provider: 'sealosdevbox',
        sandboxId: stoppedDevboxSandboxId,
        instanceId: stoppedDevboxSandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(stoppedDevboxApp._id),
        userId,
        teamId,
        status: SandboxInstanceStatusEnum.stopped,
        createdAt: new Date(),
        lastActiveAt: new Date(Date.now() - 30_000)
      });

      // 1c. archived sealosdevbox（含 legacy S3 package.zip：超长 PAX 路径 + UTF-8 + 0755 脚本 + 需剪枝目录）
      const stoppedZipApp = await MongoApp.create({
        name: 'Mig Archived Zip App',
        type: AppTypeEnum.simple,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        modules: []
      });
      const stoppedZipSandboxId = getRunningSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(stoppedZipApp._id),
        userId
      });
      createdSandboxIds.push(stoppedZipSandboxId);
      createdContainerRecords.push(stoppedZipSandboxId);

      const legacyStoppedZipKey = `sandbox/archive/${stoppedZipSandboxId}/package.zip`;
      createdS3SandboxKeys.push(legacyStoppedZipKey);

      const longSegment = `pax-${'z'.repeat(105)}`;
      const stoppedZip = new JSZip();
      stoppedZip.file('sessions/chat-mig/报告/摘要.txt', '冷存储 ZIP 迁移验证', {
        unixPermissions: 0o644
      });
      stoppedZip.file(`sessions/chat-mig/${longSegment}/deep.txt`, 'pax-payload', {
        unixPermissions: 0o644
      });
      stoppedZip.file('sessions/chat-mig/run.sh', '#!/bin/sh\necho zip-exec\n', {
        unixPermissions: 0o755
      });
      stoppedZip.file('node_modules/.cache/stale.bin', 'prune-me');
      const stoppedZipBuf = await stoppedZip.generateAsync({
        type: 'nodebuffer',
        platform: 'UNIX'
      });
      await s3Sandbox.client.uploadObject({
        key: legacyStoppedZipKey,
        body: stoppedZipBuf
      });

      await getLegacySandboxInstanceCollection().insertOne({
        provider: 'sealosdevbox',
        sandboxId: stoppedZipSandboxId,
        instanceId: stoppedZipSandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(stoppedZipApp._id),
        userId,
        teamId,
        status: SandboxInstanceStatusEnum.archived,
        storage: {
          archive: {
            objectKey: legacyStoppedZipKey,
            sizeBytes: stoppedZipBuf.length,
            format: 'zip',
            uploadedAt: new Date()
          }
        },
        createdAt: new Date(),
        lastActiveAt: new Date(Date.now() - 60_000)
      });

      // 1d. 空 package.zip 存量 archived sealosdevbox（0 entries ZIP 应安全转换/跳过不崩溃）
      const emptyZipApp = await MongoApp.create({
        name: 'Mig Empty Zip App',
        type: AppTypeEnum.simple,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        modules: []
      });
      const emptyZipSandboxId = getRunningSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(emptyZipApp._id),
        userId
      });
      createdSandboxIds.push(emptyZipSandboxId);
      const emptyZipKey = `sandbox/archive/${emptyZipSandboxId}/package.zip`;
      createdS3SandboxKeys.push(emptyZipKey);
      const emptyZipBuf = await new JSZip().generateAsync({ type: 'nodebuffer' });
      await s3Sandbox.client.uploadObject({
        key: emptyZipKey,
        body: emptyZipBuf
      });

      await getLegacySandboxInstanceCollection().insertOne({
        provider: 'sealosdevbox',
        sandboxId: emptyZipSandboxId,
        instanceId: emptyZipSandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(emptyZipApp._id),
        userId,
        teamId,
        status: SandboxInstanceStatusEnum.archived,
        storage: {
          archive: {
            objectKey: emptyZipKey,
            sizeBytes: emptyZipBuf.length,
            format: 'zip',
            uploadedAt: new Date()
          }
        },
        createdAt: new Date(),
        lastActiveAt: new Date(Date.now() - 120_000)
      });

      // 1d. 已经在 v3 中且自带 sandbox/archive-v2/ .tar.zst 存档的记录 -> 迁移不能破坏它
      const nativeApp = await MongoApp.create({
        name: 'Native OpenSandbox App',
        type: AppTypeEnum.simple,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        modules: []
      });
      const nativeSandboxId = getRunningSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(nativeApp._id),
        userId
      });
      createdSandboxIds.push(nativeSandboxId);
      const nativeTarKey = `${SANDBOX_ARCHIVE_PREFIX}/${nativeSandboxId}/1.tar.zst`;
      createdS3SandboxKeys.push(nativeTarKey);
      const nativeTarBuf = await buffer(
        createTarZstStream([
          {
            path: 'workspace/native.txt',
            type: 'file',
            mode: 0o644,
            content: Buffer.from('untouched')
          }
        ])
      );
      await s3Sandbox.client.uploadObject({
        key: nativeTarKey,
        body: nativeTarBuf
      });
      await MongoSandboxInstance.create({
        provider: 'opensandbox',
        sandboxId: nativeSandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(nativeApp._id),
        userId,
        status: SandboxInstanceStatusEnum.stopped,
        storage: {
          archive: {
            objectKey: nativeTarKey,
            sizeBytes: nativeTarBuf.length,
            format: 'tar.zst',
            uploadedAt: new Date()
          }
        },
        lastActiveAt: new Date(Date.now() - 30_000)
      });

      // 1e. 通过真实 importSkill 写入存量 .zip Skill 版本包到 RustFS，并创建编辑态 sealosdevbox
      const skillZip = new JSZip();
      skillZip.file(
        'skills/legacy-skill/SKILL.md',
        '---\nname: legacy-skill\ndescription: migrated from zip\n---\n\n# Legacy\n'
      );
      skillZip.file('skills/legacy-skill/scripts/run.sh', '#!/bin/sh\necho skill-ok\n', {
        unixPermissions: 0o755
      });
      const skillZipBuf = await skillZip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
      const skillId = await importSkill({
        skill: {
          name: `Mig Skill ${randomUUID().slice(0, 6)}`,
          description: 'Real RustFS Skill migration test',
          category: []
        },
        teamId,
        tmbId,
        packageStream: Readable.from(skillZipBuf),
        contentLength: skillZipBuf.length
      });
      const v1 = await MongoAgentSkillsVersion.findOne({ skillId }).lean();
      expect(v1?.storageKey).toMatch(/\.zip$/);
      const skillZipKey = v1!.storageKey;
      createdS3SkillKeys.push(skillZipKey);

      const skillEditSandboxId = getEditDebugSandboxId(skillId);
      createdSandboxIds.push(skillEditSandboxId);
      createdContainerRecords.push(skillEditSandboxId);
      const skillDevboxName = `skilledit-mig-${randomUUID().slice(0, 6)}`;
      await getLegacySandboxInstanceCollection().insertOne({
        provider: 'sealosdevbox',
        sandboxId: skillEditSandboxId,
        instanceId: skillDevboxName,
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        userId: ChatSourceTypeEnum.skillEdit,
        teamId,
        status: SandboxInstanceStatusEnum.stopped,
        metadata: {
          devboxName: skillDevboxName
        },
        createdAt: new Date(),
        lastActiveAt: new Date(Date.now() - 10_000)
      });

      // 2. 验证迁移前 legacy skillEdit 会被明确拦截返回 409/agentSandboxMigrationInProgress，且清理前置门禁必须阻断未迁移状态
      await expect(
        getSkillEditRuntimeContext({
          skillId,
          teamId
        })
      ).rejects.toThrow(SandboxErrEnum.agentSandboxMigrationInProgress);

      const preCleanup = createRealMigrationContext('20261117_cleanup_legacy_sandbox_resources');
      await expect(cleanupLegacySandboxResources(preCleanup.context)).rejects.toThrow();
      expect(await s3Sandbox.isObjectExists(legacyStoppedZipKey)).toBe(true);
      expect(await s3Skill.isObjectExists(skillZipKey)).toBe(true);

      const skillEditTarZst = await encodeEntriesToTarBuffer([
        {
          path: 'workspace/skills/legacy-skill/SKILL.md',
          type: 'file',
          mode: 0o644,
          content: Buffer.from(
            '---\nname: legacy-skill\ndescription: migrated from zip\n---\n\n# Legacy\n'
          )
        }
      ]);

      // 3. 注入 Fake Sealos Client 并执行 20261117_migrate_sandbox_to_opensandbox
      const devboxes = new Map<string, FakeDevboxState>([
        [
          runningSandboxId,
          {
            phase: 'Running',
            archiveBuffer: runningTarZst,
            execCalls: [],
            pauseCount: 0,
            resumeCount: 0,
            deleteCount: 0,
            deleted: false
          }
        ],
        [
          stoppedDevboxSandboxId,
          {
            phase: 'Stopped',
            archiveBuffer: stoppedDevboxTarZst,
            execCalls: [],
            pauseCount: 0,
            resumeCount: 0,
            deleteCount: 0,
            deleted: false
          }
        ],
        [
          skillEditSandboxId,
          {
            phase: 'Stopped',
            archiveBuffer: skillEditTarZst,
            execCalls: [],
            pauseCount: 0,
            resumeCount: 0,
            deleteCount: 0,
            deleted: false
          }
        ]
      ]);

      vi.spyOn(sealosClientModule, 'createSealosMigrationClient').mockImplementation(() =>
        createFakeSealosClient(devboxes)
      );

      const migCtx = createRealMigrationContext('20261117_migrate_sandbox_to_opensandbox');
      const migResult = await migrateSandboxToOpenSandbox(migCtx.context);
      console.info(
        '[migration-4180] migrateSandboxToOpenSandbox result:',
        JSON.stringify(migResult)
      );

      // 校验 runningDevbox 静默冻结/打包流程与数据库转换结果
      const runState = devboxes.get(runningSandboxId)!;
      expect(runState.pauseCount).toBeGreaterThanOrEqual(1);
      expect(runState.resumeCount).toBeGreaterThanOrEqual(1);
      const stopState = devboxes.get(stoppedDevboxSandboxId)!;
      expect(stopState.resumeCount).toBeGreaterThanOrEqual(1);

      const migratedRunningDoc = await MongoSandboxInstance.findOne({
        sandboxId: runningSandboxId
      }).lean();
      expect(migratedRunningDoc?.provider).toBe('opensandbox');

      // Route 1 双重隔离：迁移完成后 v2 记录、旧 package.zip 与暂停态 Devbox 均应原封不动保留以便零恢复回滚
      expect(runState.deleted).toBe(false);
      expect(stopState.deleted).toBe(false);
      expect(devboxes.get(skillEditSandboxId)?.deleted).toBe(false);
      expect(
        await getLegacySandboxInstanceCollection().countDocuments({
          sandboxId: {
            $in: [
              runningSandboxId,
              stoppedDevboxSandboxId,
              stoppedZipSandboxId,
              emptyZipSandboxId,
              skillEditSandboxId
            ]
          }
        })
      ).toBe(5);
      expect(await s3Sandbox.isObjectExists(legacyStoppedZipKey)).toBe(true);
      expect(await s3Sandbox.isObjectExists(emptyZipKey)).toBe(true);

      // 校验 runningDevbox & stoppedDevbox 转出的 .tar.zst 均可在真实 Docker OpenSandbox 冷恢复
      const restoredRunClient = await getSandboxClient({
        sandboxId: runningSandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(runningApp._id),
        userId,
        chatId: 'chat-mig-run'
      });
      const [runUtf8File] = await restoredRunClient.opensandbox.readFiles(['目录/说明.txt']);
      expect(Buffer.from(runUtf8File!.content).toString('utf8')).toContain('迁移运行态中文内容');
      const runModeOut = await restoredRunClient.exec('stat -c %a /workspace/bin/hello.sh');
      expect(runModeOut.stdout.trim()).toBe('755');
      await restoredRunClient.opensandbox.close();

      const migratedStoppedDevboxDoc = await MongoSandboxInstance.findOne({
        sandboxId: stoppedDevboxSandboxId
      }).lean();
      expect(migratedStoppedDevboxDoc?.provider).toBe('opensandbox');
      const restoredStopDevboxClient = await getSandboxClient({
        sandboxId: stoppedDevboxSandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(stoppedDevboxApp._id),
        userId,
        chatId: 'chat-mig-stop'
      });
      const [stopStateFile] = await restoredStopDevboxClient.opensandbox.readFiles([
        'stopped-devbox/state.txt'
      ]);
      expect(Buffer.from(stopStateFile!.content).toString('utf8')).toContain(
        'from-stopped-sealos-devbox'
      );
      await restoredStopDevboxClient.opensandbox.close();

      // 校验 stoppedZipDevbox 已从 .zip 转码到真实 RustFS .tar.zst
      const migratedStoppedDoc = await MongoSandboxInstance.findOne({
        sandboxId: stoppedZipSandboxId
      }).lean();
      expect(migratedStoppedDoc?.provider).toBe('opensandbox');
      const migratedStoppedArchiveKey = migratedStoppedDoc?.storage?.archive?.objectKey as string;
      expect(migratedStoppedArchiveKey.startsWith(`${SANDBOX_ARCHIVE_PREFIX}/`)).toBe(true);
      expect(migratedStoppedArchiveKey).toMatch(/\.tar\.zst$/);
      expect(await s3Sandbox.isObjectExists(migratedStoppedArchiveKey)).toBe(true);

      // 校验转码后的 .tar.zst 在真实 Docker OpenSandbox 中冷恢复可读且不含剪枝目录
      const restoredStoppedClient = await getSandboxClient({
        sandboxId: stoppedZipSandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(stoppedZipApp._id),
        userId,
        chatId: 'chat-mig'
      });
      const [restoredSummary, restoredPax] = await restoredStoppedClient.opensandbox.readFiles([
        'sessions/chat-mig/报告/摘要.txt',
        `sessions/chat-mig/${longSegment}/deep.txt`
      ]);
      expect(Buffer.from(restoredSummary!.content).toString('utf8')).toBe('冷存储 ZIP 迁移验证');
      expect(Buffer.from(restoredPax!.content).toString('utf8')).toBe('pax-payload');
      const statExec = await restoredStoppedClient.exec(
        'stat -c %a /home/sandbox/workspace/sessions/chat-mig/run.sh'
      );
      expect(statExec.stdout.trim()).toBe('755');
      const preservedCacheCheck = await restoredStoppedClient.exec(
        'cat /home/sandbox/workspace/node_modules/.cache/stale.bin'
      );
      expect(preservedCacheCheck.stdout).toBe('prune-me');
      await restoredStoppedClient.opensandbox.close();

      // 校验 emptyZip 与 native opensandbox 记录安全无损
      const emptyDoc = await MongoSandboxInstance.findOne({ sandboxId: emptyZipSandboxId }).lean();
      expect(emptyDoc?.provider).toBe('opensandbox');
      const nativeDoc = await MongoSandboxInstance.findOne({ sandboxId: nativeSandboxId }).lean();
      expect(nativeDoc?.storage?.archive?.objectKey).toBe(nativeTarKey);

      // 校验 Skill 版本包 (.zip) 仍完好保留，迁移后的 Skill Edit 解除 409 门禁并可在真实 OpenSandbox 启动还原
      const updatedVersion = await MongoAgentSkillsVersion.findById(v1!._id).lean();
      expect(updatedVersion?.storageKey).toBe(skillZipKey);
      expect(await s3Skill.isObjectExists(skillZipKey)).toBe(true);

      const editCtx = await getSkillEditRuntimeContext({
        skillId,
        teamId
      });
      await initSkillEditRuntimeSandbox({ context: editCtx });
      const editClient = await getSandboxClient({
        sandboxId: skillEditSandboxId,
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        userId: ChatSourceTypeEnum.skillEdit,
        chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
      });
      const [skillMdFile] = await editClient.opensandbox.readFiles([
        joinSandboxPath(
          getSandboxStaticRuntimePaths().workDirectory,
          'skills/legacy-skill/SKILL.md'
        )
      ]);
      expect(Buffer.from(skillMdFile!.content).toString('utf8')).toContain('migrated from zip');
      await editClient.opensandbox.close();

      // 4. 执行 cleanupLegacySandboxResources
      const cleanupCtx = createRealMigrationContext('20261117_cleanup_legacy_sandbox_resources');
      const cleanupResult = await cleanupLegacySandboxResources(cleanupCtx.context);
      expect(cleanupResult.deletedDevboxes).toBeGreaterThanOrEqual(3);
      expect(cleanupResult.deletedZips).toBeGreaterThanOrEqual(2);

      // 幂等二次执行 cleanup 应为全 0
      const cleanupAgainCtx = createRealMigrationContext(
        '20261117_cleanup_legacy_sandbox_resources'
      );
      const cleanupAgainResult = await cleanupLegacySandboxResources(cleanupAgainCtx.context);
      expect(cleanupAgainResult).toEqual({
        deletedDevboxes: 0,
        deletedVolumes: 0,
        deletedZips: 0
      });

      // 验证 legacy .zip 与远端 Devbox 已清理，而 v2 旧集合记录、v3 .tar.zst 存档与 Skill 版本包均完好保留
      expect(await getLegacySandboxInstanceCollection().countDocuments({})).toBe(5);
      expect(await s3Sandbox.isObjectExists(legacyStoppedZipKey)).toBe(false);
      expect(await s3Sandbox.isObjectExists(emptyZipKey)).toBe(false);
      expect(await s3Sandbox.isObjectExists(migratedStoppedArchiveKey)).toBe(true);
      expect(await s3Skill.isObjectExists(skillZipKey)).toBe(true);
      expect(runState.deleted).toBe(true);
      expect(devboxes.get(stoppedDevboxSandboxId)?.deleted).toBe(true);
      expect(devboxes.get(skillEditSandboxId)?.deleted).toBe(true);
    }, 120_000);

    it('records partial devbox migration failure into failedRecords, preserves completed items, and resumes from saved checkpoint & failedRecords to recover content', async () => {
      const teamId = String(new Types.ObjectId());
      const tmbId = String(new Types.ObjectId());
      const userId = `mig-retry-user-${randomUUID()}`;

      const okApp = await MongoApp.create({
        name: 'Mig Retry OK App',
        type: AppTypeEnum.simple,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        modules: []
      });
      const failApp = await MongoApp.create({
        name: 'Mig Retry Fail App',
        type: AppTypeEnum.simple,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        modules: []
      });

      const okSandboxId = getRunningSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(okApp._id),
        userId
      });
      const failSandboxId = getRunningSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(failApp._id),
        userId
      });
      createdSandboxIds.push(okSandboxId, failSandboxId);
      createdContainerRecords.push(okSandboxId, failSandboxId);

      const okTar = await encodeEntriesToTarBuffer([
        { path: 'workspace/ok.txt', type: 'file', mode: 0o644, content: Buffer.from('ok-data') }
      ]);
      const failTar = await encodeEntriesToTarBuffer([
        {
          path: 'workspace/recovered.txt',
          type: 'file',
          mode: 0o644,
          content: Buffer.from('recovered-data')
        }
      ]);

      await getLegacySandboxInstanceCollection().insertMany([
        {
          provider: 'sealosdevbox',
          sandboxId: okSandboxId,
          instanceId: okSandboxId,
          sourceType: ChatSourceTypeEnum.app,
          sourceId: String(okApp._id),
          userId,
          teamId,
          status: SandboxInstanceStatusEnum.stopped,
          createdAt: new Date(),
          lastActiveAt: new Date()
        },
        {
          provider: 'sealosdevbox',
          sandboxId: failSandboxId,
          instanceId: failSandboxId,
          sourceType: ChatSourceTypeEnum.app,
          sourceId: String(failApp._id),
          userId,
          teamId,
          status: SandboxInstanceStatusEnum.running,
          createdAt: new Date(),
          lastActiveAt: new Date()
        }
      ]);

      const devboxes = new Map<string, FakeDevboxState>([
        [
          okSandboxId,
          {
            phase: 'Stopped',
            archiveBuffer: okTar,
            execCalls: [],
            pauseCount: 0,
            resumeCount: 0,
            deleteCount: 0,
            deleted: false
          }
        ],
        [
          failSandboxId,
          {
            phase: 'Running',
            archiveBuffer: failTar,
            execCalls: [],
            pauseCount: 0,
            resumeCount: 0,
            deleteCount: 0,
            deleted: false,
            failExec: true
          }
        ]
      ]);

      vi.spyOn(sealosClientModule, 'createSealosMigrationClient').mockImplementation(() =>
        createFakeSealosClient(devboxes)
      );

      // 首轮执行：runningDevbox (failSandboxId) 失败、stoppedDevbox (okSandboxId) 成功；保存游标与 failedRecords 后抛错退出
      const firstRun = createRealMigrationContext('20261117_migrate_sandbox_to_opensandbox');
      await expect(migrateSandboxToOpenSandbox(firstRun.context)).rejects.toThrow();
      expect(firstRun.failedRecords).toHaveLength(1);
      expect(firstRun.failedRecords[0]).toMatchObject({
        stageKey: 'runningDevbox',
        data: expect.objectContaining({ sandboxId: failSandboxId })
      });
      const savedCheckpoint = firstRun.checkpoints.at(-1);
      expect(savedCheckpoint).toMatchObject({
        runningDevbox: { migrated: 0, done: true },
        stoppedDevbox: { migrated: 1, done: true },
        legacyArchives: { migrated: 0, done: true }
      });

      const okDocAfterFirst = await MongoSandboxInstance.findOne({ sandboxId: okSandboxId }).lean();
      expect(okDocAfterFirst?.provider).toBe('opensandbox');
      expect(okDocAfterFirst?.status).toBe(SandboxInstanceStatusEnum.archived);
      const okArchiveKey = okDocAfterFirst?.storage?.archive?.objectKey as string;
      expect(await s3Sandbox.isObjectExists(okArchiveKey)).toBe(true);
      const okExecCount = devboxes.get(okSandboxId)!.execCalls.length;

      const failDocAfterFirst = await MongoSandboxInstance.findOne({
        sandboxId: failSandboxId
      }).lean();
      expect(failDocAfterFirst).toBeNull();
      const legacyFailDocAfterFirst = await getLegacySandboxInstanceCollection().findOne({
        sandboxId: failSandboxId
      });
      expect(legacyFailDocAfterFirst?.provider).toBe('sealosdevbox');

      // 恢复 fault 并显式继承首轮保存的 checkpoint 与 failedRecords 续跑：只重放失败项，已成功项不被重复处理
      devboxes.get(failSandboxId)!.failExec = false;
      const retryRun = createRealMigrationContext('20261117_migrate_sandbox_to_opensandbox', {
        initialCheckpoint: savedCheckpoint,
        initialFailedRecords: firstRun.failedRecords
      });
      const retryResult = await migrateSandboxToOpenSandbox(retryRun.context);
      expect(retryResult).toEqual({
        runningDevbox: 1,
        stoppedDevbox: 1,
        legacyArchives: 0
      });
      expect(retryRun.failedRecords).toEqual([]);

      expect(devboxes.get(okSandboxId)!.execCalls.length).toBe(okExecCount);
      const okDocAfterRetry = await MongoSandboxInstance.findOne({ sandboxId: okSandboxId }).lean();
      expect(okDocAfterRetry?.storage?.archive?.objectKey).toBe(okArchiveKey);
      expect(await s3Sandbox.isObjectExists(okArchiveKey)).toBe(true);

      const failDocAfterRetry = await MongoSandboxInstance.findOne({
        sandboxId: failSandboxId
      }).lean();
      expect(failDocAfterRetry?.provider).toBe('opensandbox');
      expect(failDocAfterRetry?.status).toBe(SandboxInstanceStatusEnum.archived);

      const recoveredClient = await getSandboxClient({
        sandboxId: failSandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(failApp._id),
        userId,
        chatId: 'chat-mig-retry'
      });
      const [recoveredFile] = await recoveredClient.opensandbox.readFiles(['recovered.txt']);
      expect(Buffer.from(recoveredFile!.content).toString('utf8')).toBe('recovered-data');
      await recoveredClient.opensandbox.close();
    }, 120_000);
  });
