/**
 * 沙盒业务层：编排 Skill Edit runtime 的上下文解析、初始化、就绪保证与工作区打包。
 *
 * 统一依赖 OpenSandbox + 持久化 PVC 与单行迁移门禁：运行中或已停止实例升级镜像时，
 * 直接在 `getSandboxClient` 内完成同 PVC 静默重建，不再需要独立升级状态/弹窗流程。
 */
import { PassThrough, type Readable } from 'node:stream';
import { SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR } from '../../constants';
import type { OpenSandboxClient } from '../../infrastructure/opensandbox/opensandbox';
import type { SandboxCreateSpec } from '../../infrastructure/opensandbox/type';
import { MongoAgentSkills } from '../../../skill/model/schema';
import { MongoAgentSkillsVersion } from '../../../skill/version/schema';
import { joinSandboxPath } from '../../utils';
import { DEFAULT_GITIGNORE_CONTENT } from '../../../skill/package/constants';
import {
  extractRuntimeSkillsFromSkillMdFiles,
  isRuntimeSkillMdPath,
  MAX_SKILL_MD_ENTRY_BYTES,
  type SkillMdFileInput
} from '../../../skill/package/runtimeMetadata';
import {
  deleteSkillPackage,
  type SkillStorageInfo,
  uploadSkillPackageStream
} from '../../../skill/package/storage';
import { validateDeployableSkillWorkspacePaths } from '../../../skill/package/workspace';
import type { RuntimeSkillMetadataType } from '@fastgpt/global/core/ai/skill/type';
import { parseTarZstStream } from '../../../../../common/file/tarZst';
import { packSandboxDirectory } from '../ideAgent';
import { EDIT_DEBUG_SANDBOX_CHAT_ID, getEditDebugSandboxId } from '../../../skill/edit/config';
import { getOpenSandboxRuntimeConfig } from '../../infrastructure/opensandbox/config';
import { getSandboxRuntimeProfile } from '../../infrastructure/opensandbox/runtimeProfile';
import type {
  AgentSkillsVersionSchemaType,
  SandboxImageConfigType
} from '@fastgpt/global/core/ai/skill/type';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  connectToOpenSandbox,
  disconnectSandbox
} from '../../infrastructure/opensandbox/opensandbox';
import type { SandboxClient } from '../runtime/client';
import { getSandboxClient } from '../runtime/client';
import {
  findSandboxInstanceBySandboxIdAndSource,
  findSandboxResourcesBySource,
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
import { isRedisLeaseError, type RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import { createAgentSandboxInitializingError } from '../../error';
import { resolveSandboxRuntimeImage } from '../runtime/image';
import { assertSandboxMigratedOrThrow } from '../../legacy';
import { SANDBOX_PROVIDER } from '../../type';
import { withSandboxLease } from '../lease';

const addLog = getLogger(LogCategories.MODULE.AI.AGENT);
const EDIT_DEBUG_SANDBOX_SCENARIO = 'edit-debug';

export type SkillEditRuntimeContext = {
  skillId: string;
  teamId: string;
  runtimeProfile: ReturnType<typeof getSandboxRuntimeProfile>;
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
 * 若关联记录尚未完成 4.18.0 迁移（非 OpenSandbox 或非 tar.zst 归档），抛出 409 阻断。
 */
export async function getSkillEditRuntimeContext(params: {
  skillId: string;
  teamId: string;
}): Promise<SkillEditRuntimeContext> {
  const { skillId, teamId } = params;

  await assertSandboxAvailable(teamId);

  const runtimeProfile = getSandboxRuntimeProfile();

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

  const { createConfig } = getOpenSandboxRuntimeConfig({
    createConfig: {
      metadata: runtimeMetadata
    }
  });

  const runtimeImage = resolveSandboxRuntimeImage({ createConfig });
  const runtimeInstances = await findSandboxResourcesBySource({
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: skillId
  });
  const existingInstance =
    runtimeInstances.find((item) => item.sandboxId === sessionId) ?? runtimeInstances[0] ?? null;

  assertSandboxMigratedOrThrow(existingInstance);

  return {
    skillId,
    teamId,
    runtimeProfile,
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
    runtimeProfile,
    createConfig,
    runtimeImage,
    currentVersion,
    sessionId,
    targetVersionId,
    existingInstance
  } = context;

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
    workDirectory: runtimeProfile.workDirectory
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

  try {
    onProgress?.({ sandboxId: sessionId, phase: 'creatingContainer' });
    await withSandboxLease({
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
              onUpgrade: () => onProgress?.({ sandboxId: sessionId, phase: 'creatingContainer' })
            }
          );
          runtimeState.client = client;
          lease.assertValid();

          const latestInstance = await findSandboxInstanceBySandboxIdAndSource({
            provider: SANDBOX_PROVIDER,
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
                provider: SANDBOX_PROVIDER,
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
                skillsRootPath: runtimeProfile.skillsRootPath,
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
            provider: SANDBOX_PROVIDER,
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
    if (isRedisLeaseError(error)) {
      throw createAgentSandboxInitializingError();
    }
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

/** 发布/导出包的排除规则：系统默认 `.gitignore` + 工作区根 `.gitignore` + 内部产物（`.gitignore` 语法，由 agent 求值）。 */
const buildSkillExcludePatterns = (rootGitignore?: string): string[] => [
  'package.zip',
  '.fastgpt/',
  ...[DEFAULT_GITIGNORE_CONTENT, rootGitignore ?? ''].flatMap((content) => content.split(/\r?\n/))
];

/**
 * 通过 `fastgpt-ide-agent` `POST /archive/pack` 获取编辑态工作区 `.tar.zst` 流并交给回调消费。
 *
 * 包内容的结构校验、体积上限与 `SKILL.md` 解析均由消费方在主站侧完成；工作区为空时直接报错。
 */
async function withSkillEditPackStream<T>(
  params: {
    sandboxId: string;
    instanceId?: string;
    signal?: AbortSignal;
  },
  consumer: (ctx: { stream: Readable; maxBytes: number }) => Promise<T>
): Promise<T> {
  const { sandboxId, instanceId, signal } = params;
  const maxBytes = getAgentSandboxDiskBytes();
  const { workDirectory } = getSandboxRuntimeProfile();

  let sandbox: OpenSandboxClient | null = null;
  let tarZstStream: Readable | null = null;

  try {
    sandbox = await connectToOpenSandbox({
      sandboxId,
      remoteSandboxId: instanceId || undefined
    });

    const [rootGitignore] = await sandbox
      .readFiles([joinSandboxPath(workDirectory, '.gitignore')])
      .catch(() => []);
    tarZstStream = await packSandboxDirectory({
      sandbox,
      targetDirectory: workDirectory,
      excludePatterns: buildSkillExcludePatterns(
        rootGitignore && !rootGitignore.error
          ? Buffer.from(rootGitignore.content).toString('utf8')
          : undefined
      ),
      signal
    });
    if (!tarZstStream) {
      throw new Error('Skill package is empty or contains no deployable files');
    }

    return await consumer({ stream: tarZstStream, maxBytes });
  } catch (error) {
    addLog.error('[Sandbox] Failed to package skill', {
      sandboxId,
      error
    });
    throw error;
  } finally {
    if (tarZstStream && !tarZstStream.destroyed) {
      tarZstStream.destroy();
    }
    if (sandbox) {
      await disconnectSandbox(sandbox);
    }
  }
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
  return withSkillEditPackStream(
    {
      sandboxId: params.sandboxId,
      instanceId: params.instanceId,
      signal: params.signal
    },
    async ({ stream, maxBytes }) => {
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
          if (!target.destroyed) target.destroy(normalized);
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
        const files: string[] = [];
        const skillMdFiles: SkillMdFileInput[] = [];

        await parseTarZstStream({
          stream: inspectStream,
          signal,
          maxTotalBytes: maxBytes,
          onEntry: async (entry) => {
            files.push(entry.path);
            if (entry.type !== 'file' || !isRuntimeSkillMdPath(entry.path)) return;
            if (entry.size > MAX_SKILL_MD_ENTRY_BYTES) {
              throw new Error(`SKILL.md exceeds maximum metadata size: ${entry.path}`);
            }
            const chunks: Buffer[] = [];
            for await (const chunk of entry.stream) chunks.push(chunk);
            skillMdFiles.push({
              path: entry.path,
              content: Buffer.concat(chunks).toString('utf8')
            });
          }
        });

        const validation = validateDeployableSkillWorkspacePaths(files);
        if (!validation.valid) {
          throw new Error(validation.error || 'Invalid skill package structure');
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
    }
  );
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

  if (!sandboxInfo || sandboxInfo.teamId !== params.teamId) {
    return;
  }

  assertSandboxMigratedOrThrow(sandboxInfo);

  return sandboxInfo;
}

/**
 * 确保 Skill Edit sandbox 已启动并等待就绪，供导出接口在打包前调用。
 */
async function ensureSkillEditRuntimeSandbox(params: { skillId: string; teamId: string }) {
  const running = await getRunningSkillEditSandbox(params);
  if (running) return running;

  const context = await getSkillEditRuntimeContext(params);
  await initSkillEditRuntimeSandbox({ context });

  const ready = await getRunningSkillEditSandbox(params);
  if (!ready) {
    throw new Error(SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR);
  }
  return ready;
}

/**
 * 将当前 Skill Edit sandbox 工作区在统一可重入租约保护下流式打包为 `.tar.zst` 并传入回调流（供 `.zip` 实时导出）。
 */
export async function streamSkillEditWorkspaceTarZst<T = void>(params: {
  skillId: string;
  teamId: string;
  signal?: AbortSignal;
  onStreamReady: (tarZstStream: Readable) => Promise<T>;
}): Promise<T> {
  const sessionId = getEditDebugSandboxId(params.skillId);
  try {
    return await withSandboxLease({
      sandboxId: sessionId,
      label: `skill-edit:export:${sessionId}`,
      signal: params.signal,
      fn: async (lease) => {
        const sandboxInfo = await ensureSkillEditRuntimeSandbox({
          skillId: params.skillId,
          teamId: params.teamId
        });
        params.signal?.throwIfAborted();
        const packSignal = params.signal
          ? AbortSignal.any([lease.signal, params.signal])
          : lease.signal;

        return await withSkillEditPackStream(
          {
            sandboxId: sandboxInfo.sandboxId,
            instanceId: sandboxInfo.instanceId,
            signal: packSignal
          },
          ({ stream }) => params.onStreamReady(stream)
        );
      }
    });
  } catch (error) {
    if (isRedisLeaseError(error)) {
      throw createAgentSandboxInitializingError();
    }
    throw error;
  }
}
