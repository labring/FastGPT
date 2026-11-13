/**
 * 沙盒业务层：编排 Skill Edit runtime 的状态解释、初始化、升级和工作区打包。
 *
 * 本文件统一处理镜像版本和运行态实例的业务判断；外部 Skill 业务直接引用
 * 本模块的业务能力，不直接依赖底层 OpenSandbox 客户端或 repository 原子能力。
 */
import { SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR } from '../../constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import {
  createOpenSandboxResourceClient,
  type OpenSandboxClient
} from '../../infrastructure/opensandbox/opensandbox';
import type { SandboxCreateSpec } from '../../infrastructure/opensandbox/type';
import { MongoAgentSkills } from '../../../skill/model/schema';
import { MongoAgentSkillsVersion } from '../../../skill/version/schema';
import { parseGitignoreRules } from '../../../skill/utils';
import { joinSandboxPath } from '../../utils';
import {
  DEFAULT_GITIGNORE_CONTENT,
  validateDeployableSkillWorkspacePackage,
  validateZipStructure
} from '../../../skill/package';
import { EDIT_DEBUG_SANDBOX_CHAT_ID, getEditDebugSandboxId } from '../../../skill/edit/config';
import {
  getOpenSandboxClientConfig,
  getOpenSandboxRuntimeConfig
} from '../../infrastructure/opensandbox/config';
import { getSandboxRuntimeProfile } from '../../infrastructure/opensandbox/runtimeProfile';
import type { AgentSkillsVersionSchemaType } from '@fastgpt/global/core/ai/skill/type';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { SandboxClient } from '../runtime/client';
import { getSandboxClient } from '../runtime/client';
import {
  findSandboxInstanceBySandboxIdAndSource,
  findSandboxResourcesBySource,
  updateSandboxInstanceRecordBySandboxId,
  type SandboxResourceDoc
} from '../../infrastructure/instance/repository';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { getAgentSandboxSkillMaxBytes } from '../../config';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';
import { assertSandboxAvailable } from '../availability';
import { assertNoUnmigratedLegacySandbox } from '../../legacy/v2MigrationGate';
import {
  emptyWorkDirectory,
  preparePackageMirrors,
  prepareWorkDirectory,
  prepareSandbox
} from '../runtime/prepare';
import { withAgentSandboxInitLease } from '../runtime/entrypoint';
import { deploySkillPackage, type SkillPackagePrepareContext } from '../runtime/skill/prepare';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);
const EDIT_DEBUG_SANDBOX_SCENARIO = 'edit-debug';

export type SkillEditRuntimeContext = {
  skillId: string;
  teamId: string;
  runtimeProfile: ReturnType<typeof getSandboxRuntimeProfile>;
  createConfig: SandboxCreateSpec;
  runtimeImage?: string;
  currentVersion: AgentSkillsVersionSchemaType;
  sessionId: string;
  targetVersionId: string;
  statusInstance?: SandboxResourceDoc | null;
};

type InitSkillEditRuntimeSandboxParams = {
  context: SkillEditRuntimeContext;
  onProgress?: (status: SandboxStatusItemType) => void;
};

/**
 * 构建 Skill Edit runtime 的后端上下文。
 *
 * 这里统一完成 skill/version 查询、OpenSandbox 运行态配置构造和 sandbox-instance 查询。
 * 目标镜像只从后端 runtime profile/createConfig 得到，不能从客户端入参透传。
 */
export async function getSkillEditRuntimeContext(params: {
  skillId: string;
  teamId: string;
  entrypoint?: SandboxCreateSpec['entrypoint'];
}): Promise<SkillEditRuntimeContext> {
  const { skillId, teamId, entrypoint } = params;

  await assertSandboxAvailable(teamId);

  getOpenSandboxClientConfig();
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
    runtime: true,
    sessionId,
    createConfig: {
      entrypoint,
      metadata: runtimeMetadata
    }
  });

  if (!createConfig) {
    throw new Error('Failed to build sandbox create config');
  }

  const runtimeImage = createConfig.image?.trim() || undefined;
  const runtimeInstances = await findSandboxResourcesBySource({
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: skillId
  });
  if (runtimeInstances.length === 0) {
    await assertNoUnmigratedLegacySandbox({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId
    });
  }

  return {
    skillId,
    teamId,
    runtimeProfile,
    createConfig,
    runtimeImage,
    currentVersion: currentVersion as AgentSkillsVersionSchemaType,
    sessionId,
    targetVersionId: currentVersion._id.toString(),
    statusInstance:
      runtimeInstances.find((instance) => instance.sandboxId === sessionId) ??
      runtimeInstances[0] ??
      null
  };
}

/**
 * 初始化 Skill Edit runtime sandbox。
 *
 * 通过 `withAgentSandboxInitLease` 串行化同一技能沙盒的并发初始化请求，并在锁内重读实例最新 `context.skillVersionId`：
 * - 避免并发打开技能编辑页时重复执行 `emptyWorkDirectory()` + `deploySkillPackage()` 互相擦除工作区；
 * - 镜像不一致时由 runtime service 在 `Lifecycle Lease` 内自动停止旧容器并以新镜像重建。
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
    statusInstance: runtimeStatusInstance
  } = context;

  const prepareContext = (sandbox: OpenSandboxClient): SkillPackagePrepareContext => ({
    sandbox,
    workDirectory: runtimeProfile.workDirectory
  });

  const reportProgress = (sandboxId: string) => (phase: SandboxStatusItemType['phase']) =>
    onProgress?.({ sandboxId, phase });

  onProgress?.({ sandboxId: sessionId, phase: 'creatingContainer' });

  await withAgentSandboxInitLease({
    sandboxId: sessionId,
    fn: async () => {
      // 在 Init Lease 内重新读取最新实例记录，确保并发排队后的后序请求读取到前序已提交的 context.skillVersionId。
      const latestRecord = await findSandboxInstanceBySandboxIdAndSource({
        sandboxId: sessionId,
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId
      });
      const effectiveInstance = latestRecord ?? runtimeStatusInstance ?? null;
      const shouldUnzipFromS3 =
        !effectiveInstance || effectiveInstance.context?.skillVersionId !== targetVersionId;
      const shouldCleanWorkspaceBeforeDeploy = Boolean(effectiveInstance);
      const shouldCleanupCreatedSandboxOnFailure = !effectiveInstance;

      if (effectiveInstance) {
        logger.info('[Sandbox] Existing edit-debug sandbox will be activated by runtime client', {
          sandboxId: effectiveInstance.sandboxId,
          lifecycleStatus: effectiveInstance.status
        });
      }

      let sandboxClient: SandboxClient | null = null;

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
            createConfig
          }
        );
        sandboxClient = client;

        if (shouldUnzipFromS3) {
          const prepareSteps = [
            preparePackageMirrors(),
            prepareWorkDirectory(),
            ...(shouldCleanWorkspaceBeforeDeploy ? [emptyWorkDirectory()] : []),
            deploySkillPackage({
              storageKey: currentVersion.storageKey,
              onProgress: reportProgress(sessionId)
            })
          ];

          await prepareSandbox(prepareContext(client.opensandbox), ...prepareSteps);
        } else {
          logger.info(
            '[Sandbox] Skill sandbox resumed with existing volume, skip initial S3 download/unzip',
            {
              sandboxId: sessionId
            }
          );
          await prepareSandbox(
            prepareContext(client.opensandbox),
            preparePackageMirrors(),
            prepareWorkDirectory()
          );
        }

        const newSandboxDoc = await updateSandboxInstanceRecordBySandboxId({
          sandboxId: sessionId,
          sourceType: ChatSourceTypeEnum.skillEdit,
          sourceId: skillId,
          userId: ChatSourceTypeEnum.skillEdit,
          touchActive: true,
          teamId,
          ...(runtimeImage ? { image: runtimeImage } : {}),
          context: {
            skillVersionId: currentVersion._id.toString()
          }
        });

        if (!newSandboxDoc) throw new Error('Failed to find sandbox document after creation');

        onProgress?.({
          sandboxId: sessionId,
          phase: 'ready'
        });
      } catch (error) {
        /** OpenSandbox SDK 的 rawBody 可能挂在当前错误或嵌套 cause 上，仅用于诊断日志。 */
        const getErrorRawBody = (value: unknown): unknown => {
          if (!value || typeof value !== 'object') return undefined;
          if ('rawBody' in value) return value.rawBody;
          return 'cause' in value ? getErrorRawBody(value.cause) : undefined;
        };
        logger.error('[Sandbox] Failed to create sandbox', {
          error,
          rawBody: getErrorRawBody(error)
        });

        if (sandboxClient && shouldCleanupCreatedSandboxOnFailure) {
          await sandboxClient.delete().catch((cleanupError) => {
            logger.error('[Sandbox] Failed to cleanup sandbox after error', { cleanupError });
          });
          sandboxClient = null;
        }

        throw error;
      } finally {
        if (sandboxClient) {
          await sandboxClient.close();
        }
      }
    }
  });
}

/**
 * 将编辑态 sandbox 内的 skill 目录打包成 zip。
 *
 * 保存发布时只读取指定 workDirectory，默认会先做目录大小检查，避免把过大的编辑工作区
 * 直接压入对象存储。调用方负责后续 SKILL.md 解析、版本写入和对象存储上传。
 */
export async function packageSkillInSandbox(params: {
  sandboxId: string;
  instanceId?: string;
  workDirectory?: string;
  validationMode?: 'basicZip' | 'deployableWorkspace';
}): Promise<Buffer> {
  const { sandboxId, instanceId, workDirectory, validationMode = 'deployableWorkspace' } = params;
  const maxBytes = getAgentSandboxSkillMaxBytes();

  getOpenSandboxClientConfig();
  const runtimeProfile = getSandboxRuntimeProfile();
  const targetDir = workDirectory || runtimeProfile.workDirectory;

  let client: OpenSandboxClient | null = null;

  try {
    const connected = await createOpenSandboxResourceClient({
      sandboxId,
      instanceId
    });
    await connected.connectRunning({ verifyHealth: true });
    client = connected;

    const targetDirInfo = await connected.getFileInfo([targetDir]);
    if (targetDirInfo.get(targetDir)?.type !== 'directory') {
      throw new Error(`Skill directory does not exist: ${targetDir}`);
    }
    const zipFilePath = `/tmp/fastgpt-skill-package-${getNanoid(12)}.zip`;

    let gitignoreContents: string[] = [];
    try {
      const rootGitignorePath = joinSandboxPath(targetDir, '.gitignore');
      const [rootGitignore] = await connected.readFiles([rootGitignorePath]);

      if (rootGitignore && !rootGitignore.error) {
        gitignoreContents = [Buffer.from(rootGitignore.content).toString('utf-8')];
      }
    } catch (err) {
      logger.warn('[Sandbox] Failed to read root .gitignore file', {
        sandboxId,
        error: getErrText(err)
      });
    }

    // 发布包必须始终套用系统默认忽略规则与 `.fastgpt/` 系统目录排除，避免没有 .gitignore 的工作区把 .venv/node_modules/.fastgpt 打进版本包。
    const { customExcludes, pruneClause } = parseGitignoreRules([
      DEFAULT_GITIGNORE_CONTENT,
      '.fastgpt/',
      ...gitignoreContents
    ]);
    const packageZipExcludes = ['package.zip', '*/package.zip'];
    const allExcludes = Array.from(new Set([...packageZipExcludes, ...customExcludes]));
    const packageZipNameExcludeClause = `! -name ${shellQuote('package.zip')}`;
    const sizeCheckCmd = pruneClause
      ? `find . \\( ${pruneClause} \\) -prune -o -type f ${packageZipNameExcludeClause} -ls 2>/dev/null | awk '{s+=$7} END {print s+0}'`
      : `find . -type f ${packageZipNameExcludeClause} -ls 2>/dev/null | awk '{s+=$7} END {print s+0}'`;
    const sizeResult = await connected.execute(sizeCheckCmd, { workingDirectory: targetDir });

    if (sizeResult.exitCode === 0 && sizeResult.stdout.trim()) {
      const dirBytes = parseInt(sizeResult.stdout.trim(), 10);
      if (!isNaN(dirBytes) && dirBytes > maxBytes) {
        throw new Error(
          `Skill directory size (${(dirBytes / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${(maxBytes / 1024 / 1024).toFixed(2)}MB)`
        );
      }
    }

    const excludeArgs = allExcludes.map((pattern) => `-x ${shellQuote(pattern)}`).join(' ');
    const zipCommand = `zip -r -y ${shellQuote(zipFilePath)} . ${excludeArgs}`;
    const zipResult = await connected.execute(zipCommand, { workingDirectory: targetDir });

    if (zipResult.exitCode !== 0) {
      throw new Error(`Failed to package skill directory: ${zipResult.stderr || zipResult.stdout}`);
    }

    try {
      const files = await connected.readFiles([zipFilePath]);
      const file = files?.[0];

      if (!file) {
        throw new Error('Package file not found in sandbox');
      }
      if (file.error) {
        throw new Error(`Failed to read package file in sandbox: ${file.error.message}`);
      }

      const zipBuffer = Buffer.from(file.content);
      if (zipBuffer.length > maxBytes) {
        throw new Error(
          `Skill package size (${(zipBuffer.length / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${(maxBytes / 1024 / 1024).toFixed(2)}MB)`
        );
      }

      const validation =
        validationMode === 'deployableWorkspace'
          ? await validateDeployableSkillWorkspacePackage(zipBuffer, {
              maxUncompressedBytes: maxBytes
            })
          : await validateZipStructure(zipBuffer, {
              maxUncompressedBytes: maxBytes
            });
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid skill package structure');
      }

      return zipBuffer;
    } finally {
      await connected.deleteFiles([zipFilePath]).catch((cleanupError) => {
        logger.warn('[Sandbox] Failed to cleanup package zip', {
          sandboxId,
          zipFilePath,
          error: cleanupError
        });
      });
    }
  } catch (error) {
    logger.error('[Sandbox] Failed to package skill', {
      sandboxId,
      error
    });
    throw error;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

/**
 * 查询正在运行的 Skill Edit sandbox。
 *
 * 该接口只返回已归属指定 team 的 running edit-debug sandbox，不触发创建或恢复。
 */
export async function getRunningSkillEditSandbox(params: { skillId: string; teamId: string }) {
  const sandboxInfo = await findSandboxInstanceBySandboxIdAndSource({
    sandboxId: getEditDebugSandboxId(params.skillId),
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: params.skillId,
    status: SandboxStatusEnum.running
  });

  if (
    !sandboxInfo ||
    sandboxInfo.status !== SandboxStatusEnum.running ||
    sandboxInfo.teamId !== params.teamId
  ) {
    return;
  }

  return sandboxInfo;
}

/**
 * 确保 Skill Edit sandbox 已启动并等待就绪，供导出接口在打包前调用。
 *
 * 已运行的实例直接复用；不存在时按现有 runtime 状态初始化，初始化完成后再次确认实例已注册。
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
 * 打包当前正在运行的 Skill Edit sandbox 工作区。
 *
 * 调用方需要先完成权限校验；本函数只负责定位运行态 sandbox 和调用打包逻辑。
 */
export async function packageSkillEditWorkspace(params: {
  skillId: string;
  teamId: string;
  validationMode?: Parameters<typeof packageSkillInSandbox>[0]['validationMode'];
}) {
  const sandboxInfo = await ensureSkillEditRuntimeSandbox(params);

  return packageSkillInSandbox({
    sandboxId: sandboxInfo.sandboxId,
    instanceId: sandboxInfo.instanceId,
    validationMode: params.validationMode
  });
}
