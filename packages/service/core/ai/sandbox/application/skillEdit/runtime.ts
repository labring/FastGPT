/**
 * 沙盒业务层：编排 Skill Edit runtime 的状态解释、初始化、升级和工作区打包。
 *
 * 本文件统一处理镜像版本、归档状态和运行态实例的业务判断；外部 Skill 业务应通过
 * sandbox/interface/skillEdit 调用，不直接依赖 provider、repository 或 archive 原子能力。
 */
import { getErrText, UserError } from '@fastgpt/global/common/error/utils';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import type { ISandbox, SandboxCreateSpec } from '@fastgpt-sdk/sandbox-adapter';
import { MongoAgentSkills } from '../../../skill/model/schema';
import { MongoAgentSkillsVersion } from '../../../skill/version/schema';
import { parseGitignoreRules } from '../../../skill/utils';
import { resolveSandboxHome } from '../runtime/home';
import { joinSandboxPath } from '../../utils';
import {
  DEFAULT_GITIGNORE_CONTENT,
  validateDeployableSkillWorkspacePackage,
  validateZipStructure
} from '../../../skill/package';
import { EDIT_DEBUG_SANDBOX_CHAT_ID, getEditDebugSandboxId } from '../../../skill/edit/config';
import {
  getSandboxProviderConfig,
  validateSandboxConfig,
  getSandboxAdapterConfig
} from '../../infrastructure/provider/config';
import { getSandboxRuntimeProfile } from '../../infrastructure/provider/runtimeProfile';
import type {
  AgentSkillSchemaType,
  AgentSkillsVersionSchemaType,
  SandboxImageConfigType
} from '@fastgpt/global/core/ai/skill/type';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import {
  connectToSandbox,
  disconnectSandbox,
  getReadySandboxInfo
} from '../../infrastructure/provider/lifecycle';
import type { SandboxClient } from '../runtime/client';
import { getSandboxClient } from '../runtime/client';
import { SandboxLifecycleStateError } from '../archive';
import {
  countRunningSandboxInstancesBySourceType,
  findSandboxInstanceBySandboxIdAndSource,
  findSandboxResourcesBySource,
  updateSandboxInstanceRecordBySandboxId
} from '../../infrastructure/instance/repository';
import { SandboxInstanceStatusEnum } from '../../type';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { serviceEnv } from '../../../../../env';
import { getAgentSandboxSkillMaxBytes } from '../../config';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';
import { assertSandboxAvailable } from '../availability';
import {
  emptyWorkDirectory,
  preparePackageMirrors,
  prepareWorkDirectory,
  prepareSandbox
} from '../runtime/prepare';
import {
  deployDownloadedSkillPackage,
  downloadSkillPackageToContext,
  type SkillPackagePrepareContext
} from '../runtime/skill/prepare';
import { normalizeSandboxImage } from '../runtime/image';
import {
  getSandboxRuntimeUpgradeStatus,
  isSandboxRuntimeUpgradeBusyState,
  resolveSandboxRuntimeUpgradeTarget,
  triggerSandboxRuntimeUpgrade,
  type SandboxRuntimeUpgradeTarget
} from '../runtime/upgrade';
import type { SandboxRuntimeStatusResponse } from '@fastgpt/global/core/ai/sandbox/type';

const addLog = getLogger(LogCategories.MODULE.AI.AGENT);
const RUNTIME_UPGRADE_IN_PROGRESS_MESSAGE = SandboxErrEnum.runtimeUpgradeInProgress;
export const SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR = 'Edit sandbox not found or not running';
const EDIT_DEBUG_SANDBOX_SCENARIO = 'edit-debug';

export type SkillEditRuntimeContext = {
  skillId: string;
  teamId: string;
  tmbId: string;
  providerConfig: ReturnType<typeof getSandboxProviderConfig>;
  runtimeProfile: ReturnType<typeof getSandboxRuntimeProfile>;
  createConfig: SandboxCreateSpec;
  runtimeImage?: SandboxImageConfigType;
  skill: AgentSkillSchemaType;
  currentVersion: AgentSkillsVersionSchemaType;
  sessionId: string;
  targetVersionId: string;
  runtimeUpgradeTarget: SandboxRuntimeUpgradeTarget;
};

export type InitSkillEditRuntimeSandboxParams = {
  context: SkillEditRuntimeContext;
  onProgress?: (status: SandboxStatusItemType) => void;
};

/**
 * 构建 Skill Edit runtime 的后端上下文。
 *
 * 这里统一完成 skill/version 查询、provider/runtime config 构造和 sandbox-instance 查询。
 * 目标镜像只从后端 runtime profile/createConfig 得到，不能从客户端入参透传。
 */
export async function getSkillEditRuntimeContext(params: {
  skillId: string;
  teamId: string;
  tmbId: string;
  entrypoint?: SandboxCreateSpec['entrypoint'];
}): Promise<SkillEditRuntimeContext> {
  const { skillId, teamId, tmbId, entrypoint } = params;

  await assertSandboxAvailable(teamId);

  const providerConfig = getSandboxProviderConfig();
  const runtimeProfile = getSandboxRuntimeProfile(providerConfig.provider);
  validateSandboxConfig(providerConfig);

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

  const { createConfig } = getSandboxAdapterConfig({
    provider: providerConfig.provider,
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

  const runtimeImage = normalizeSandboxImage(createConfig.image);
  const runtimeInstances = await findSandboxResourcesBySource({
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: skillId
  });

  return {
    skillId,
    teamId,
    tmbId,
    providerConfig,
    runtimeProfile,
    createConfig,
    runtimeImage,
    skill: skill as AgentSkillSchemaType,
    currentVersion: currentVersion as AgentSkillsVersionSchemaType,
    sessionId,
    targetVersionId: currentVersion._id.toString(),
    runtimeUpgradeTarget: resolveSandboxRuntimeUpgradeTarget({
      sandboxId: sessionId,
      targetProvider: providerConfig.provider,
      targetImage: runtimeImage,
      instances: runtimeInstances
    })
  };
}

/**
 * 获取 Skill Edit runtime 升级状态，不启动、不恢复、不归档 sandbox。
 */
export async function getSkillEditRuntimeStatus(
  params:
    | { context: SkillEditRuntimeContext }
    | {
        skillId: string;
        teamId: string;
        tmbId: string;
        entrypoint?: SandboxCreateSpec['entrypoint'];
      }
): Promise<SandboxRuntimeStatusResponse> {
  const context = 'context' in params ? params.context : await getSkillEditRuntimeContext(params);
  return getSandboxRuntimeUpgradeStatus(context.runtimeUpgradeTarget);
}

/**
 * 触发 Skill Edit runtime 升级归档。
 *
 * 该函数只负责把旧 runtime 推进到 archiving，并启动后台归档任务；客户端随后通过 getStatus 轮询。
 */
export async function triggerSkillEditRuntimeUpgrade(
  params:
    | { context: SkillEditRuntimeContext }
    | {
        skillId: string;
        teamId: string;
        tmbId: string;
        entrypoint?: SandboxCreateSpec['entrypoint'];
      }
): Promise<SandboxRuntimeStatusResponse> {
  const context = 'context' in params ? params.context : await getSkillEditRuntimeContext(params);
  return triggerSandboxRuntimeUpgrade(context.runtimeUpgradeTarget);
}

/**
 * 初始化 Skill Edit runtime sandbox。
 *
 * 调用方必须先通过 getSkillEditRuntimeStatus 判定为 readyToInit；本函数只负责启动、恢复或
 * 复用 sandbox，不再返回 runtime 升级状态。
 */
export async function initSkillEditRuntimeSandbox({
  context,
  onProgress
}: InitSkillEditRuntimeSandboxParams): Promise<void> {
  const {
    skillId,
    teamId,
    tmbId,
    providerConfig,
    runtimeProfile,
    createConfig,
    runtimeImage,
    skill,
    currentVersion,
    sessionId,
    targetVersionId,
    runtimeUpgradeTarget
  } = context;

  addLog.info('[Sandbox] Initializing skill edit runtime sandbox', {
    skillId,
    teamId
  });

  const runtimeStatusInstance = runtimeUpgradeTarget.statusInstance;
  const existingLifecycleStatus = runtimeStatusInstance?.status;
  const shouldUnzipFromS3 =
    !runtimeStatusInstance || runtimeStatusInstance.metadata?.versionId !== targetVersionId;
  const shouldCleanWorkspaceBeforeDeploy = !!runtimeStatusInstance;

  const prepareContext = (sandbox: ISandbox): SkillPackagePrepareContext => ({
    sandbox,
    workDirectory: runtimeProfile.workDirectory
  });

  const reportProgress = (sandboxId: string) => (phase: SandboxStatusItemType['phase']) =>
    onProgress?.({ sandboxId, phase });

  const maxEditDebug =
    global.feConfigs?.limit?.agentSandboxMaxEditDebug ?? serviceEnv.AGENT_SANDBOX_MAX_EDIT_DEBUG;

  const ensureCanActivateEditDebugSandbox = async (params: {
    sandboxId: string;
    status?: string;
  }) => {
    if (maxEditDebug === undefined || params.status === SandboxStatusEnum.running) return;

    const activeCount = await countRunningSandboxInstancesBySourceType(
      ChatSourceTypeEnum.skillEdit,
      providerConfig.provider
    );
    if (activeCount < maxEditDebug) return;

    const message = `Active edit-debug sandbox limit reached (${activeCount}/${maxEditDebug}). Please try again later.`;
    onProgress?.({ sandboxId: params.sandboxId, phase: 'failed', message });
    throw new Error(message);
  };

  if (runtimeStatusInstance) {
    addLog.info('[Sandbox] Existing edit-debug sandbox will be activated by runtime client', {
      sandboxId: runtimeStatusInstance.sandboxId,
      lifecycleStatus: existingLifecycleStatus
    });
  }

  if (existingLifecycleStatus !== SandboxInstanceStatusEnum.restoring) {
    await ensureCanActivateEditDebugSandbox({
      sandboxId: sessionId,
      status: runtimeStatusInstance?.status
    });
  }
  let sandbox: ISandbox | null = null;
  let sandboxClient: SandboxClient | null = null;
  const shouldCleanupCreatedSandboxOnFailure = !runtimeStatusInstance;

  try {
    onProgress?.({ sandboxId: sessionId, phase: 'creatingContainer' });
    const createRuntimeSandboxClient = () =>
      getSandboxClient(
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

    const client = await createRuntimeSandboxClient();
    sandboxClient = client;
    sandbox = client.provider;

    await getReadySandboxInfo(client.provider, {
      sandboxId: sessionId,
      image: createConfig.image,
      entrypoint: createConfig.entrypoint,
      status: client.provider.status
    });

    if (shouldUnzipFromS3) {
      const prepareSteps = [
        preparePackageMirrors(),
        prepareWorkDirectory(),
        downloadSkillPackageToContext({
          storageKey: currentVersion.storageKey,
          onProgress: reportProgress(sessionId)
        }),
        ...(shouldCleanWorkspaceBeforeDeploy ? [emptyWorkDirectory()] : []),
        deployDownloadedSkillPackage({
          skillsRootPath: runtimeProfile.skillsRootPath,
          onProgress: reportProgress(sessionId)
        })
      ];

      await prepareSandbox(prepareContext(client.provider), ...prepareSteps);
    } else {
      addLog.info(
        '[Sandbox] Skill sandbox resumed with existing volume, skip initial S3 download/unzip',
        {
          sandboxId: sessionId
        }
      );
      await prepareSandbox(
        prepareContext(client.provider),
        preparePackageMirrors(),
        prepareWorkDirectory()
      );
    }

    const newSandboxDoc = await updateSandboxInstanceRecordBySandboxId({
      provider: providerConfig.provider,
      sandboxId: sessionId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      userId: ChatSourceTypeEnum.skillEdit,
      touchActive: true,
      metadata: {
        teamId,
        tmbId,
        sessionId,
        ...(runtimeImage ? { image: runtimeImage } : {}),
        skillName: skill.name,
        versionId: currentVersion._id.toString()
      }
    });

    if (!newSandboxDoc) throw new Error('Failed to find sandbox document after creation');

    onProgress?.({
      sandboxId: sessionId,
      phase: 'ready'
    });
    return;
  } catch (error) {
    if (
      error instanceof SandboxLifecycleStateError &&
      isSandboxRuntimeUpgradeBusyState(error.state)
    ) {
      throw new UserError(RUNTIME_UPGRADE_IN_PROGRESS_MESSAGE);
    }

    /** Provider SDK 的 rawBody 可能挂在当前错误或嵌套 cause 上，仅用于诊断日志。 */
    const getProviderRawBody = (value: unknown): unknown => {
      if (!value || typeof value !== 'object') return undefined;
      if ('rawBody' in value) return value.rawBody;
      return 'cause' in value ? getProviderRawBody(value.cause) : undefined;
    };
    addLog.error('[Sandbox] Failed to create sandbox', {
      error,
      rawBody: getProviderRawBody(error)
    });

    if (sandboxClient && shouldCleanupCreatedSandboxOnFailure) {
      try {
        await sandboxClient.delete();
        sandbox = null;
      } catch (cleanupError) {
        addLog.error('[Sandbox] Failed to cleanup sandbox after error', { cleanupError });
      }
    }

    throw error;
  } finally {
    if (sandbox) {
      await disconnectSandbox(sandbox);
    }
  }
}

/**
 * 将编辑态 sandbox 内的 skill 目录打包成 zip。
 *
 * 保存发布时只读取指定 workDirectory，默认会先做目录大小检查，避免把过大的编辑工作区
 * 直接压入对象存储。调用方负责后续 SKILL.md 解析、版本写入和对象存储上传。
 */
export async function packageSkillInSandbox(params: {
  sandboxId: string;
  workDirectory?: string;
  validationMode?: 'basicZip' | 'deployableWorkspace';
}): Promise<Buffer> {
  const { sandboxId, workDirectory, validationMode = 'deployableWorkspace' } = params;
  const maxBytes = getAgentSandboxSkillMaxBytes();

  const providerConfig = getSandboxProviderConfig();
  const runtimeProfile = getSandboxRuntimeProfile(providerConfig.provider);
  const targetDir = workDirectory || runtimeProfile.workDirectory;

  let sandbox: ISandbox | null = null;

  try {
    const newSandbox = await connectToSandbox(providerConfig, sandboxId);
    sandbox = newSandbox;

    const targetDirExists = await newSandbox.execute(`[ -d ${shellQuote(targetDir)} ]`);
    if (targetDirExists.exitCode !== 0) {
      throw new Error(`Skill directory does not exist: ${targetDir}`);
    }
    const quotedTargetDir = shellQuote(targetDir);
    const homeDirectory = await resolveSandboxHome(newSandbox);
    if (!homeDirectory) {
      throw new Error('Failed to resolve sandbox HOME for package temp directory');
    }
    const packageTempDir = joinSandboxPath(joinSandboxPath(homeDirectory, '.fastgpt'), 'tmp');
    const packageZipFilename = `skill-package-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.zip`;
    const zipFilePath = joinSandboxPath(packageTempDir, packageZipFilename);
    const preparePackageTempDirResult = await newSandbox.execute(
      `mkdir -p ${shellQuote(packageTempDir)}`
    );
    if (preparePackageTempDirResult.exitCode !== 0) {
      throw new Error(
        `Failed to prepare package temp directory: ${preparePackageTempDirResult.stderr || preparePackageTempDirResult.stdout}`
      );
    }

    let gitignoreContents: string[] = [];
    try {
      const rootGitignorePath = joinSandboxPath(targetDir, '.gitignore');
      const [rootGitignore] = await newSandbox.readFiles([rootGitignorePath]);

      if (rootGitignore && !rootGitignore.error) {
        gitignoreContents = [
          typeof rootGitignore.content === 'string'
            ? rootGitignore.content
            : Buffer.from(rootGitignore.content).toString('utf-8')
        ];
      }
    } catch (err) {
      addLog.warn('[Sandbox] Failed to read root .gitignore file', {
        sandboxId,
        error: getErrText(err)
      });
    }

    // 发布包必须始终套用系统默认忽略规则，避免没有 .gitignore 的工作区把 .venv/node_modules 打进版本包。
    const { customExcludes, pruneClause } = parseGitignoreRules([
      DEFAULT_GITIGNORE_CONTENT,
      ...gitignoreContents
    ]);
    const packageZipExcludes = ['package.zip', '*/package.zip'];
    const allExcludes = Array.from(new Set([...packageZipExcludes, ...customExcludes]));
    const packageZipNameExcludeClause = `! -name ${shellQuote('package.zip')}`;
    const sizeCheckCmd = pruneClause
      ? `cd ${quotedTargetDir} && find . \\( ${pruneClause} \\) -prune -o -type f ${packageZipNameExcludeClause} -ls 2>/dev/null | awk '{s+=$7} END {print s+0}'`
      : `cd ${quotedTargetDir} && find . -type f ${packageZipNameExcludeClause} -ls 2>/dev/null | awk '{s+=$7} END {print s+0}'`;
    const sizeResult = await newSandbox.execute(sizeCheckCmd);

    if (sizeResult.exitCode === 0 && sizeResult.stdout.trim()) {
      const dirBytes = parseInt(sizeResult.stdout.trim(), 10);
      if (!isNaN(dirBytes) && dirBytes > maxBytes) {
        throw new Error(
          `Skill directory size (${(dirBytes / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${(maxBytes / 1024 / 1024).toFixed(2)}MB)`
        );
      }
    }

    const excludeArgs = allExcludes.map((pattern) => `-x ${shellQuote(pattern)}`).join(' ');
    const zipCommand = `cd ${quotedTargetDir} && zip -r -y ${shellQuote(zipFilePath)} . ${excludeArgs}`;
    const zipResult = await newSandbox.execute(zipCommand);

    if (zipResult.exitCode !== 0) {
      throw new Error(`Failed to package skill directory: ${zipResult.stderr || zipResult.stdout}`);
    }

    try {
      const files = await newSandbox.readFiles([zipFilePath]);
      const file = files?.[0];

      if (!file) {
        throw new Error('Package file not found in sandbox');
      }
      if (file.error) {
        throw new Error(`Failed to read package file in sandbox: ${file.error.message}`);
      }

      const content = file.content;
      const zipBuffer = Buffer.from(
        content instanceof Uint8Array ? content : Buffer.from(content, 'utf-8')
      );
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
      await newSandbox.execute(`rm -f ${shellQuote(zipFilePath)}`).catch((cleanupError) => {
        addLog.warn('[Sandbox] Failed to cleanup package zip', {
          sandboxId,
          zipFilePath,
          error: cleanupError
        });
      });
    }
  } catch (error) {
    addLog.error('[Sandbox] Failed to package skill', {
      sandboxId,
      error
    });
    throw error;
  } finally {
    if (sandbox) {
      await disconnectSandbox(sandbox);
    }
  }
}

/**
 * 查询当前 provider 下正在运行的 Skill Edit sandbox。
 *
 * 该接口只返回已归属指定 team 的 running edit-debug sandbox，不触发创建或恢复。
 */
export async function getRunningSkillEditSandbox(params: { skillId: string; teamId: string }) {
  const providerConfig = getSandboxProviderConfig();
  const sandboxInfo = await findSandboxInstanceBySandboxIdAndSource({
    provider: providerConfig.provider,
    sandboxId: getEditDebugSandboxId(params.skillId),
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: params.skillId,
    status: SandboxStatusEnum.running
  });

  if (
    !sandboxInfo ||
    sandboxInfo.status !== SandboxStatusEnum.running ||
    sandboxInfo.metadata?.teamId !== params.teamId
  ) {
    return;
  }

  return sandboxInfo;
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
  const sandboxInfo = await getRunningSkillEditSandbox(params);
  if (!sandboxInfo) {
    throw new Error(SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR);
  }

  const runtimeProfile = getSandboxRuntimeProfile(sandboxInfo.provider);
  return packageSkillInSandbox({
    sandboxId: sandboxInfo.sandboxId,
    workDirectory: runtimeProfile.workDirectory,
    validationMode: params.validationMode
  });
}
