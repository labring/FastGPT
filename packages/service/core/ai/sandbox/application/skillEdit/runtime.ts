/**
 * 沙盒业务层：编排 Skill Edit runtime 的上下文解析、初始化、就绪保证与工作区打包。
 *
 * 统一依赖 OpenSandbox + 持久化 PVC 与单行迁移门禁：运行中或已停止实例升级镜像时，
 * 直接在 `getSandboxClient` 内完成同 PVC 静默重建，不再需要独立升级状态/弹窗流程。
 */
import { PassThrough, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { OpenSandboxClient } from '../../infrastructure/opensandbox/opensandbox';
import type { SandboxCreateSpec } from '../../infrastructure/opensandbox/type';
import { MongoAgentSkills } from '../../../skill/model/schema';
import { MongoAgentSkillsVersion } from '../../../skill/version/schema';
import { joinSandboxPath } from '../../utils';
import { DEFAULT_GITIGNORE_CONTENT } from '../../../skill/package/constants';
import {
  extractRuntimeSkillsFromSkillMdFiles,
  MAX_SKILL_MD_ENTRY_BYTES,
  type SkillMdFileInput
} from '../../../skill/package/runtimeMetadata';
import {
  deleteSkillPackage,
  type SkillStorageInfo,
  uploadSkillPackageStream
} from '../../../skill/package/storage';
import { findSkillMdEntries } from '../../../skill/utils';
import type { RuntimeSkillMetadataType } from '@fastgpt/global/core/ai/skill/type';
import {
  ArchiveTooLargeError,
  InvalidArchiveEntryPathError,
  parseTarZstStream
} from '../../../../../common/file/tarZst';
import { packSandboxDirectory } from '../ideAgent';
import { EDIT_DEBUG_SANDBOX_CHAT_ID, getEditDebugSandboxId } from '../../../skill/edit/config';
import { getOpenSandboxRuntimeConfig } from '../../infrastructure/opensandbox/config';
import { getSandboxStaticRuntimePaths } from '../../infrastructure/opensandbox/runtimeProfile';
import type { AgentSkillsVersionSchemaType } from '@fastgpt/global/core/ai/skill/type';
import type { SandboxImageConfigType } from '@fastgpt/global/core/ai/sandbox/type';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import {
  connectToOpenSandbox,
  disconnectSandbox
} from '../../infrastructure/opensandbox/opensandbox';
import type { SandboxClient } from '../runtime/client';
import { getSandboxClient } from '../runtime/client';
import {
  findSandboxInstanceBySandboxIdAndSource,
  findSandboxInstanceBySource,
  hasPendingLegacySandboxInstance,
  updateSandboxInstanceRecordBySandboxId,
  type SandboxResourceDoc
} from '../../infrastructure/instance/repository';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { getAgentSandboxDiskBytes } from '../../config';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';
import { assertSandboxAvailable } from '../availability';
import {
  emptyWorkDirectory,
  preparePackageMirrors,
  prepareWorkDirectory,
  prepareSandbox,
  type SandboxPrepareContext
} from '../runtime/prepare';
import { deploySkillPackage } from '../runtime/skill/prepare';
import { withAgentSandboxLease } from '../runtime/entrypoint';
import { isRedisLeaseError, type RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import { UserError } from '@fastgpt/global/common/error/utils';
import { normalizeSandboxImage } from '../runtime/image';
import { createAgentSandboxMigrationInProgressError } from '../../error';

const addLog = getLogger(LogCategories.MODULE.AI.AGENT);
const EDIT_DEBUG_SANDBOX_SCENARIO = 'edit-debug';

export type SkillEditRuntimeContext = {
  skillId: string;
  teamId: string;
  createConfig: SandboxCreateSpec;
  runtimeImage?: SandboxImageConfigType;
  currentVersion: AgentSkillsVersionSchemaType;
  sessionId: string;
  targetVersionId: string;
  existingInstance: SandboxResourceDoc | null;
};

export type InitSkillEditRuntimeSandboxParams = {
  context: SkillEditRuntimeContext;
  onProgress?: (status: SandboxStatusItemType) => void;
};

/**
 * 构建 Skill Edit runtime 的后端上下文并执行存量迁移门禁检查。
 *
 * 目标镜像只从后端 runtime profile / createConfig 派生，不从客户端入参透传；
 * 若 `v3` 无记录且 `v2` 仍有未迁移完成的关联实例，抛出 409 阻断，防止割裂建新卷。
 */
export async function getSkillEditRuntimeContext(params: {
  skillId: string;
  teamId: string;
}): Promise<SkillEditRuntimeContext> {
  const { skillId, teamId } = params;

  await assertSandboxAvailable(teamId);

  const skill = await MongoAgentSkills.findOne({
    _id: skillId,
    teamId,
    deleteTime: null
  });

  if (!skill) {
    throw new Error('Skill not found or access denied');
  }

  if (!skill.currentVersionId) {
    throw new Error('Skill package not found - no current version available');
  }

  const currentVersion = await MongoAgentSkillsVersion.findOne({
    _id: skill.currentVersionId,
    skillId
  });

  if (!currentVersion) {
    throw new Error('No current version found for skill');
  }

  const sessionId = getEditDebugSandboxId(skillId);
  const runtimeMetadata = {
    skillId,
    teamId,
    sessionId,
    scenario: EDIT_DEBUG_SANDBOX_SCENARIO
  };

  const { image: resolvedImage, createConfig } = getOpenSandboxRuntimeConfig({
    createConfig: {
      metadata: runtimeMetadata
    }
  });

  const runtimeImage = normalizeSandboxImage(resolvedImage);
  const existingInstance = await findSandboxInstanceBySource({
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: skillId,
    userId: ChatSourceTypeEnum.skillEdit
  });

  if (
    !existingInstance &&
    (await hasPendingLegacySandboxInstance({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId
    }))
  ) {
    throw createAgentSandboxMigrationInProgressError();
  }

  return {
    skillId,
    teamId,
    createConfig,
    runtimeImage,
    currentVersion: currentVersion as AgentSkillsVersionSchemaType,
    sessionId,
    targetVersionId: currentVersion._id.toString(),
    existingInstance
  };
}

/**
 * 初始化 Skill Edit runtime sandbox。
 *
 * 通过 `getSandboxClient` 自动完成冷恢复、同 PVC 静默换镜像与运行激活；
 * 仅在首次创建或已部署 `versionId` 变更时清理非系统工作区内容并从 S3 解压写入目标版本包。
 */
export async function initSkillEditRuntimeSandbox({
  context,
  onProgress
}: InitSkillEditRuntimeSandboxParams): Promise<void> {
  const {
    skillId,
    teamId,
    createConfig,
    runtimeImage,
    currentVersion,
    sessionId,
    targetVersionId,
    existingInstance
  } = context;
  const { workDirectory, skillsRootPath } = getSandboxStaticRuntimePaths();

  addLog.info('[Sandbox] Initializing skill edit runtime sandbox', {
    skillId,
    teamId
  });

  const prepareContext = (
    activeClient: SandboxClient,
    lease?: RedisLeaseContext
  ): SandboxPrepareContext => ({
    sandbox: activeClient.opensandbox,
    sandboxClient: activeClient,
    lease,
    workDirectory
  });

  const reportProgress = (sandboxId: string) => (phase: SandboxStatusItemType['phase']) =>
    onProgress?.({ sandboxId, phase });

  if (existingInstance) {
    addLog.info('[Sandbox] Existing edit-debug sandbox will be activated by runtime client', {
      sandboxId: existingInstance.sandboxId,
      lifecycleStatus: existingInstance.status
    });
  }

  const runtimeState: {
    client: SandboxClient | null;
    shouldCleanupOnFailure: boolean;
  } = {
    client: null,
    shouldCleanupOnFailure: !existingInstance
  };

  let reportedCreating = false;
  const reportCreating = () => {
    if (reportedCreating) return;
    reportedCreating = true;
    onProgress?.({ sandboxId: sessionId, phase: 'creatingContainer' });
  };

  try {
    reportCreating();
    await withAgentSandboxLease({
      sandboxId: sessionId,
      label: `skill-edit:init:${sessionId}`,
      fn: async (lease) => {
        try {
          const client = await getSandboxClient(
            {
              sandboxId: sessionId,
              sourceType: ChatSourceTypeEnum.skillEdit,
              sourceId: skillId,
              userId: ChatSourceTypeEnum.skillEdit,
              chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
            },
            {
              createConfig,
              onUpgrade: reportCreating
            }
          );
          runtimeState.client = client;
          lease.assertValid();

          const latestInstance = await findSandboxInstanceBySandboxIdAndSource({
            sandboxId: sessionId,
            sourceType: ChatSourceTypeEnum.skillEdit,
            sourceId: skillId
          });
          if (latestInstance?.versionId) {
            runtimeState.shouldCleanupOnFailure = false;
          }
          const effectiveInstance = latestInstance ?? existingInstance;
          const shouldUnzipFromS3 =
            !effectiveInstance || effectiveInstance.versionId !== targetVersionId;
          const shouldCleanWorkspaceBeforeDeploy = Boolean(
            existingInstance || latestInstance?.versionId
          );

          if (shouldUnzipFromS3) {
            if (shouldCleanWorkspaceBeforeDeploy && effectiveInstance?.versionId) {
              // 清空工作区前先置空已部署版本标记，防止清空后解压失败导致回切旧版本跳过重解压。
              await updateSandboxInstanceRecordBySandboxId({
                sandboxId: sessionId,
                sourceType: ChatSourceTypeEnum.skillEdit,
                sourceId: skillId,
                userId: ChatSourceTypeEnum.skillEdit,
                teamId,
                versionId: ''
              });
            }
            const prepareSteps = [
              preparePackageMirrors(),
              prepareWorkDirectory(),
              ...(shouldCleanWorkspaceBeforeDeploy ? [emptyWorkDirectory()] : []),
              deploySkillPackage({
                storageKey: currentVersion.storageKey,
                skillsRootPath,
                onProgress: reportProgress(sessionId)
              })
            ];

            await prepareSandbox(prepareContext(client, lease), ...prepareSteps);
          } else {
            addLog.info(
              '[Sandbox] Skill sandbox resumed with existing volume, skip initial S3 download/unzip',
              {
                sandboxId: sessionId
              }
            );
            await prepareSandbox(
              prepareContext(client, lease),
              preparePackageMirrors(),
              prepareWorkDirectory()
            );
          }

          lease.assertValid();
          const newSandboxDoc = await updateSandboxInstanceRecordBySandboxId({
            sandboxId: sessionId,
            sourceType: ChatSourceTypeEnum.skillEdit,
            sourceId: skillId,
            userId: ChatSourceTypeEnum.skillEdit,
            touchActive: true,
            teamId,
            ...(runtimeImage ? { image: runtimeImage } : {}),
            versionId: targetVersionId
          });

          if (!newSandboxDoc) throw new Error('Failed to find sandbox document after creation');
        } catch (innerError) {
          // 首次创建失败清理必须在仍持有有效租约的临界区内完成，避免锁释放后与并发请求竞争或租约丢失后越权删除。
          if (
            runtimeState.client !== null &&
            runtimeState.shouldCleanupOnFailure &&
            !lease.signal.aborted &&
            !isRedisLeaseError(innerError)
          ) {
            await runtimeState.client.delete().catch((cleanupError) => {
              addLog.error('[Sandbox] Failed to cleanup sandbox after error', { cleanupError });
            });
            runtimeState.client = null;
          }
          throw innerError;
        }
      }
    });

    onProgress?.({
      sandboxId: sessionId,
      phase: 'ready'
    });
  } catch (error) {
    const getProviderRawBody = (value: unknown): unknown => {
      if (!value || typeof value !== 'object') return undefined;
      if ('rawBody' in value) return value.rawBody;
      return 'cause' in value ? getProviderRawBody(value.cause) : undefined;
    };
    addLog.error('[Sandbox] Failed to create sandbox', {
      error,
      rawBody: getProviderRawBody(error)
    });

    throw error;
  } finally {
    if (runtimeState.client !== null) {
      await disconnectSandbox(runtimeState.client.opensandbox);
    }
  }
}

/** 发布默认应用系统+工作区 `.gitignore` 规则，导出完整工作区时不应用，但均跳过 `package.zip` 与 `.fastgpt/`。 */
const buildSkillExcludePatterns = (applyIgnoreRules: boolean, rootGitignore?: string): string[] => [
  'package.zip',
  '.fastgpt/',
  ...(applyIgnoreRules
    ? [DEFAULT_GITIGNORE_CONTENT, rootGitignore ?? ''].flatMap((content) => content.split(/\r?\n/))
    : [])
];

export type SkillExportZipArchive = NodeJS.ReadableStream & {
  on(event: 'error', listener: (error: Error) => void): unknown;
  append(source: Buffer | Readable, data: { name: string; mode?: number; date?: Date }): unknown;
  finalize(): Promise<void> | void;
  destroy(error?: Error): unknown;
};

const mapSkillArchiveError = (error: unknown): unknown => {
  if (error instanceof ArchiveTooLargeError) {
    return new UserError(SkillErrEnum.archiveTooLarge, undefined, { cause: error });
  }
  if (error instanceof InvalidArchiveEntryPathError) {
    return new UserError(SkillErrEnum.invalidSkillPackage, undefined, { cause: error });
  }
  return error;
};

/** 从运行中容器通过 `POST /archive/pack` 打开工作区 `.tar.zst` 流（发布与导出均跳过符号链接）。 */
async function openSkillEditPackStream(params: {
  sandbox: OpenSandboxClient;
  signal?: AbortSignal;
  applyIgnoreRules?: boolean;
}): Promise<Readable> {
  const { sandbox, signal, applyIgnoreRules = true } = params;
  const { workDirectory } = getSandboxStaticRuntimePaths();
  let rootGitignoreText: string | undefined;
  if (applyIgnoreRules) {
    const [rootGitignore] = await sandbox
      .readFiles([joinSandboxPath(workDirectory, '.gitignore')])
      .catch(() => []);
    if (rootGitignore && !rootGitignore.error) {
      rootGitignoreText = Buffer.from(rootGitignore.content).toString('utf8');
    }
  }
  const tarZstStream = await packSandboxDirectory({
    sandbox,
    targetDirectory: workDirectory,
    excludePatterns: buildSkillExcludePatterns(applyIgnoreRules, rootGitignoreText),
    skipSymlinks: true,
    signal
  });
  if (!tarZstStream) {
    throw new UserError(SkillErrEnum.archiveEmpty);
  }
  return tarZstStream;
}

/**
 * 将编辑态 sandbox 工作区流式打包为 `.tar.zst` 并上传 S3，同时单遍提取可部署结构校验与 `SKILL.md` 元数据。
 *
 * 同一份字节流同时写给 S3 上传与主站解析（`pipe` 自动按较慢一侧背压）；任一侧失败立即中止另一侧，
 * 并清理已上传但未绑定版本的 S3 对象。
 */
export async function packageAndUploadSkillTarZstInSandbox(params: {
  teamId: string;
  skillId: string;
  packageObjectId: string;
  sandboxId: string;
  instanceId?: string;
  signal?: AbortSignal;
}): Promise<{ storageInfo: SkillStorageInfo; runtimeSkills: RuntimeSkillMetadataType[] }> {
  const maxBytes = getAgentSandboxDiskBytes();
  let sandbox: OpenSandboxClient | null = null;
  let stream: Readable | null = null;

  try {
    sandbox = await connectToOpenSandbox({
      sandboxId: params.sandboxId,
      remoteSandboxId: params.instanceId || undefined
    });
    stream = await openSkillEditPackStream({
      sandbox,
      signal: params.signal,
      applyIgnoreRules: true
    });

    const controller = new AbortController();
    const signal = params.signal
      ? AbortSignal.any([params.signal, controller.signal])
      : controller.signal;
    const uploadStream = new PassThrough();
    const inspectStream = new PassThrough();
    let primaryError: unknown;

    const fail = (error: unknown) => {
      primaryError ??= error;
      const normalized = error instanceof Error ? error : new Error(String(error));
      controller.abort(normalized);
      for (const target of [stream, uploadStream, inspectStream]) {
        if (target && !target.destroyed) target.destroy(normalized);
      }
    };
    const failFast = <T>(task: Promise<T>) =>
      task.catch((error) => {
        fail(error);
        throw error;
      });

    stream.on('error', fail);
    stream.pipe(uploadStream);
    stream.pipe(inspectStream);

    const inspect = async (): Promise<RuntimeSkillMetadataType[]> => {
      let entryCount = 0;
      const skillMdFiles: SkillMdFileInput[] = [];

      await parseTarZstStream({
        stream: inspectStream,
        signal,
        maxTotalBytes: maxBytes,
        onEntry: async (entry) => {
          if (entry.type === 'symlink') {
            throw new UserError(SkillErrEnum.archiveSymlinkNotAllowed, undefined, {
              cause: new Error(`Symlink entries are not allowed in skill packages: ${entry.path}`)
            });
          }
          entryCount += 1;
          if (
            entry.type !== 'file' ||
            findSkillMdEntries([{ path: entry.path, isDir: false }]).length === 0
          ) {
            return;
          }
          if (entry.size > MAX_SKILL_MD_ENTRY_BYTES) {
            skillMdFiles.push({
              path: entry.path,
              content: '',
              error: `SKILL.md exceeds maximum metadata size: ${entry.path}`
            });
            return;
          }
          const chunks: Buffer[] = [];
          for await (const chunk of entry.stream) chunks.push(chunk);
          skillMdFiles.push({
            path: entry.path,
            content: Buffer.concat(chunks).toString('utf8')
          });
        }
      });

      if (entryCount === 0) {
        throw new UserError(SkillErrEnum.archiveEmpty);
      }
      return extractRuntimeSkillsFromSkillMdFiles(skillMdFiles);
    };

    const [uploadResult, inspectResult] = await Promise.allSettled([
      failFast(
        uploadSkillPackageStream({
          teamId: params.teamId,
          skillId: params.skillId,
          packageObjectId: params.packageObjectId,
          packageStream: uploadStream,
          signal
        })
      ),
      failFast(inspect())
    ]);

    if (uploadResult.status === 'fulfilled' && inspectResult.status === 'fulfilled') {
      return { storageInfo: uploadResult.value, runtimeSkills: inspectResult.value };
    }
    if (uploadResult.status === 'fulfilled') {
      await deleteSkillPackage(uploadResult.value.key).catch(() => undefined);
    }
    throw primaryError;
  } catch (error) {
    const mapped = mapSkillArchiveError(error);
    if (!(mapped instanceof UserError)) {
      addLog.error('[Sandbox] Failed to package skill', {
        sandboxId: params.sandboxId,
        error: mapped
      });
    }
    throw mapped;
  } finally {
    if (stream && !stream.destroyed) {
      stream.destroy();
    }
    if (sandbox) {
      await disconnectSandbox(sandbox);
    }
  }
}

/**
 * 查询当前正在运行的 OpenSandbox Skill Edit sandbox。
 */
export async function getRunningSkillEditSandbox(params: { skillId: string; teamId: string }) {
  const sandboxInfo = await findSandboxInstanceBySandboxIdAndSource({
    sandboxId: getEditDebugSandboxId(params.skillId),
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: params.skillId,
    status: SandboxStatusEnum.running
  });

  if (!sandboxInfo) {
    if (
      await hasPendingLegacySandboxInstance({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: params.skillId
      })
    ) {
      throw createAgentSandboxMigrationInProgressError();
    }
    return;
  }

  if (sandboxInfo.teamId !== params.teamId) {
    return;
  }

  return sandboxInfo;
}

/**
 * 实时完整导出 Skill Edit 工作区为 `.zip` 流：
 * 1. 不应用 `.gitignore` 规则，不校验 `SKILL.md`；容器与解析侧均跳过符号链接，空工作区（含仅剩软链）返回 `archiveEmpty`；
 * 2. 以 `getSandboxClient.runWithRecovery` 打开 `.tar.zst` 流并严格强制 `maxTotalBytes` 与路径安全校验后边解边压输出到目标流。
 */
export async function streamSkillEditWorkspaceZip(params: {
  skillId: string;
  teamId: string;
  signal?: AbortSignal;
  outputStream: NodeJS.WritableStream;
  createArchive: () => SkillExportZipArchive;
  onHeadersReady: () => void;
}): Promise<void> {
  const maxTotalBytes = getAgentSandboxDiskBytes();
  const sessionId = getEditDebugSandboxId(params.skillId);

  await withAgentSandboxLease({
    sandboxId: sessionId,
    label: `skill-edit:export:${sessionId}`,
    signal: params.signal,
    fn: async (lease) => {
      let sandboxInfo = await getRunningSkillEditSandbox(params);
      if (!sandboxInfo) {
        const context = await getSkillEditRuntimeContext(params);
        await initSkillEditRuntimeSandbox({ context });
        sandboxInfo = await getRunningSkillEditSandbox(params);
        if (!sandboxInfo) {
          throw new UserError(SkillErrEnum.editSandboxNotRunning);
        }
      }
      params.signal?.throwIfAborted();
      const packSignal = params.signal
        ? AbortSignal.any([lease.signal, params.signal])
        : lease.signal;

      const client = await getSandboxClient({
        sandboxId: sandboxInfo.sandboxId,
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: params.skillId,
        userId: ChatSourceTypeEnum.skillEdit,
        chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
      });
      let tarZstStream: Readable | null = null;
      try {
        tarZstStream = await client.runWithRecovery(() =>
          openSkillEditPackStream({
            sandbox: client.opensandbox,
            signal: packSignal,
            applyIgnoreRules: false
          })
        );

        const streamController = new AbortController();
        const effectiveSignal = AbortSignal.any([packSignal, streamController.signal]);
        const archive = params.createArchive();
        archive.on('error', (error) => streamController.abort(error));
        const zipTask = pipeline(archive, params.outputStream);
        zipTask.catch((error) => streamController.abort(error));

        params.onHeadersReady();

        try {
          await parseTarZstStream({
            stream: tarZstStream,
            signal: effectiveSignal,
            maxTotalBytes,
            onEntry: async (entry) => {
              // 容器打包已设 skipSymlinks，此处保留跳过逻辑以兼容未同步升级的旧版镜像。
              if (entry.type === 'symlink') {
                return;
              }
              const data = { name: entry.path, mode: entry.mode, date: entry.mtime };
              if (entry.type === 'directory') {
                archive.append(Buffer.alloc(0), data);
              } else {
                const body = new PassThrough();
                archive.append(body, data);
                await pipeline(entry.stream, body, { signal: effectiveSignal });
              }
            }
          });
          await archive.finalize();
          await zipTask;
        } catch (error) {
          const normalized = error instanceof Error ? error : new Error(String(error));
          streamController.abort(normalized);
          archive.destroy(normalized);
          throw error;
        } finally {
          if (!tarZstStream.destroyed) {
            tarZstStream.destroy();
          }
        }
      } catch (error) {
        const mapped = mapSkillArchiveError(error);
        if (!(mapped instanceof UserError)) {
          addLog.error('[Sandbox] Failed to stream skill export workspace', {
            sandboxId: sandboxInfo.sandboxId,
            error: mapped
          });
        }
        throw mapped;
      } finally {
        await disconnectSandbox(client.opensandbox);
      }
    }
  });
}
