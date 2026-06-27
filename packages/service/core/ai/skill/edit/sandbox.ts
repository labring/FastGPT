import { getErrText, UserError } from '@fastgpt/global/common/error/utils';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import type { ISandbox, SandboxCreateSpec } from '@fastgpt-sdk/sandbox-adapter';
import { MongoAgentSkills } from '../model/schema';
import { MongoAgentSkillsVersion } from '../version/schema';
import { parseGitignoreRules } from '../utils';
import { resolveSandboxHome } from '../../sandbox/runtime/home';
import { joinSandboxPath } from '../../sandbox/runtime/utils';
import {
  DEFAULT_GITIGNORE_CONTENT,
  validateDeployableSkillWorkspacePackage,
  validateZipStructure
} from '../package';
import { EDIT_DEBUG_SANDBOX_CHAT_ID, getEditDebugSandboxId } from './config';
import {
  getSandboxProviderConfig,
  validateSandboxConfig,
  getSandboxAdapterConfig
} from '../../sandbox/provider/config';
import { getSandboxRuntimeProfile } from '../../sandbox/runtime/profile';
import type {
  AgentSkillSchemaType,
  AgentSkillsVersionSchemaType,
  SandboxImageConfigType
} from '@fastgpt/global/core/ai/skill/type';
import type { SkillRuntimeStatusResponse } from '@fastgpt/global/core/ai/skill/api';
import { SandboxStatusEnum, SandboxTypeEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import {
  connectReadySandboxByInstance,
  connectToSandbox,
  disconnectSandbox,
  getReadySandboxInfo
} from '../../sandbox/provider/lifecycle';
import { buildSandboxAdapter } from '../../sandbox/provider/adapter';
import type { SandboxClient } from '../../sandbox/service/runtime';
import { getSandboxClient } from '../../sandbox/service/runtime';
import {
  SandboxArchiveStateError,
  startSandboxRuntimeUpgradeArchive
} from '../../sandbox/service/archive';
import {
  countRunningSandboxInstancesByType,
  deleteSandboxResourceRecord,
  findSandboxInstanceArchiveState,
  findSandboxInstanceBySandboxId,
  findSandboxResourcesBySourceChatTypeExcludeProvider,
  markArchivedSandboxRuntimeImageCurrent,
  markSandboxRuntimeUpgradeArchiveFailed,
  migrateArchivedSandboxInstanceRecord,
  updateSandboxInstanceRecordBySandboxId,
  type SandboxResourceDoc
} from '../../sandbox/instance/repository';
import { getLogger, LogCategories } from '../../../../common/logger';
import { serviceEnv } from '../../../../env';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';
import { checkTeamSandboxPermission } from '../../../../support/permission/teamLimit';
import { createAgentSandboxPermissionDeniedError } from '../../sandbox/error';
import {
  emptyWorkDirectory,
  preparePackageMirrors,
  prepareWorkDirectory,
  prepareSandbox
} from '../../sandbox/runtime/prepare';
import {
  deployDownloadedSkillPackage,
  downloadSkillPackageToContext,
  reportSkillPrepareProgress,
  type SkillPackagePrepareContext
} from '../runtime/prepare';

const addLog = getLogger(LogCategories.MODULE.AI.AGENT);
const RUNTIME_UPGRADE_FAILED_MESSAGE = SandboxErrEnum.runtimeUpgradeFailed;
const RUNTIME_UPGRADE_IN_PROGRESS_MESSAGE = SandboxErrEnum.runtimeUpgradeInProgress;
const RUNTIME_UPGRADE_ARCHIVING_TIMEOUT_MS = 10 * 60 * 1000;

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
  existingInstance: Awaited<ReturnType<typeof findSandboxInstanceBySandboxId>>;
  runtimeArchiveInstance: Awaited<ReturnType<typeof findSandboxInstanceArchiveState>>;
  staleProviderInstances: SandboxResourceDoc[];
};

export type InitSkillEditRuntimeSandboxParams = {
  context: SkillEditRuntimeContext;
  onProgress?: (status: SandboxStatusItemType) => void;
};

const normalizeSandboxImage = (image?: SandboxImageConfigType | string | null) => {
  if (typeof image === 'string') {
    const lastColonIndex = image.lastIndexOf(':');
    if (lastColonIndex > 0 && !image.slice(lastColonIndex + 1).includes('/')) {
      return {
        repository: image.slice(0, lastColonIndex),
        tag: image.slice(lastColonIndex + 1)
      };
    }
    return {
      repository: image,
      tag: ''
    };
  }
  if (!image?.repository) return undefined;
  const repository = image.repository;
  const tag = image.tag ?? '';
  if (!tag) {
    const lastColonIndex = repository.lastIndexOf(':');
    if (lastColonIndex > 0 && !repository.slice(lastColonIndex + 1).includes('/')) {
      return {
        repository: repository.slice(0, lastColonIndex),
        tag: repository.slice(lastColonIndex + 1)
      };
    }
  }
  return {
    repository,
    tag
  };
};

const isRuntimeImageMatched = (
  runtimeImage: SandboxImageConfigType | undefined,
  existingImage?: SandboxImageConfigType | string | null
) => {
  const normalizedExistingImage = normalizeSandboxImage(existingImage);
  return (
    !runtimeImage ||
    (!!normalizedExistingImage &&
      normalizedExistingImage.repository === runtimeImage.repository &&
      normalizedExistingImage.tag === runtimeImage.tag)
  );
};

const buildRuntimeStatusResponse = (params: {
  sandboxId: string;
  status: SkillRuntimeStatusResponse['status'];
  archiveState?: SkillRuntimeStatusResponse['archiveState'];
  lastError?: string;
}): SkillRuntimeStatusResponse => {
  const { sandboxId, status, archiveState, lastError } = params;
  return {
    sandboxId,
    status,
    ...(archiveState ? { archiveState } : {}),
    canUpgrade: status === 'upgradeRequired',
    shouldPoll: status === 'upgrading',
    shouldInit: status === 'readyToInit',
    ...(lastError ? { lastError } : {})
  };
};

const isRuntimeUpgradeBusyArchiveState = (state?: string) =>
  state === 'archiving' || state === 'restoring';

const isRuntimeUpgradeArchivingTimedOut = (instance: SandboxResourceDoc) => {
  const startedAt = instance.metadata?.archive?.startedAt ?? instance.lastActiveAt;
  return Date.now() - startedAt.getTime() > RUNTIME_UPGRADE_ARCHIVING_TIMEOUT_MS;
};

const markRuntimeUpgradeFailed = async (instance: SandboxResourceDoc) => {
  await markSandboxRuntimeUpgradeArchiveFailed(instance, RUNTIME_UPGRADE_FAILED_MESSAGE).catch(
    (error) => {
      addLog.error('[Sandbox] Failed to mark runtime upgrade archive failed', {
        sandboxId: instance.sandboxId,
        error
      });
    }
  );
};

/**
 * 构建 Skill Edit runtime 的后端上下文。
 *
 * 这里统一完成 skill/version 查询、provider/runtime config 构造、当前实例和跨 provider
 * 旧实例查询。目标镜像只从后端 runtime profile/createConfig 得到，不能从客户端入参透传。
 */
export async function getSkillEditRuntimeContext(params: {
  skillId: string;
  teamId: string;
  tmbId: string;
  entrypoint?: SandboxCreateSpec['entrypoint'];
}): Promise<SkillEditRuntimeContext> {
  const { skillId, teamId, tmbId, entrypoint } = params;

  try {
    await checkTeamSandboxPermission(teamId);
  } catch {
    throw createAgentSandboxPermissionDeniedError();
  }

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
    scenario: SandboxTypeEnum.editDebug
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

  const existingInstance = await findSandboxInstanceBySandboxId({
    provider: providerConfig.provider,
    sandboxId: sessionId,
    type: SandboxTypeEnum.editDebug
  });
  const runtimeArchiveInstance = await findSandboxInstanceArchiveState({
    provider: providerConfig.provider,
    sandboxId: sessionId
  });

  const staleProviderInstances = await findSandboxResourcesBySourceChatTypeExcludeProvider({
    provider: providerConfig.provider,
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: skillId,
    chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
    type: SandboxTypeEnum.editDebug
  });

  return {
    skillId,
    teamId,
    tmbId,
    providerConfig,
    runtimeProfile,
    createConfig,
    runtimeImage: normalizeSandboxImage(createConfig.image),
    skill: skill as AgentSkillSchemaType,
    currentVersion: currentVersion as AgentSkillsVersionSchemaType,
    sessionId,
    targetVersionId: currentVersion._id.toString(),
    existingInstance,
    runtimeArchiveInstance,
    staleProviderInstances
  };
}

const getStaleRuntimeInstance = (context: SkillEditRuntimeContext) => {
  const { staleProviderInstances, runtimeImage } = context;
  const busyInstance = staleProviderInstances.find((instance) =>
    isRuntimeUpgradeBusyArchiveState(instance.metadata?.archive?.state)
  );
  if (busyInstance) return busyInstance;

  const failedInstance = staleProviderInstances.find(
    (instance) => instance.metadata?.archive?.state === 'failed'
  );
  if (failedInstance) return failedInstance;

  const archivedInstance = staleProviderInstances.find(
    (instance) => instance.metadata?.archive?.state === 'archived'
  );
  if (archivedInstance) return archivedInstance;

  return staleProviderInstances.find(
    (instance) =>
      instance.metadata?.archive?.state === undefined &&
      !isRuntimeImageMatched(runtimeImage, instance.metadata?.image)
  );
};

const getRuntimeStatusInstance = (context: SkillEditRuntimeContext) => {
  return (
    context.runtimeArchiveInstance ?? context.existingInstance ?? getStaleRuntimeInstance(context)
  );
};

const getRuntimeUpgradeInstance = (context: SkillEditRuntimeContext) => {
  const { existingInstance, runtimeArchiveInstance, staleProviderInstances, runtimeImage } =
    context;
  const currentProviderInstance = runtimeArchiveInstance ?? existingInstance;
  const existingArchiveState = currentProviderInstance?.metadata?.archive?.state;
  if (
    currentProviderInstance &&
    existingArchiveState !== 'archived' &&
    !isRuntimeUpgradeBusyArchiveState(existingArchiveState)
  ) {
    return currentProviderInstance;
  }

  return (
    staleProviderInstances.find((instance) => instance.metadata?.archive?.state === 'failed') ??
    staleProviderInstances.find(
      (instance) =>
        instance.metadata?.archive?.state === undefined &&
        !isRuntimeImageMatched(runtimeImage, instance.metadata?.image)
    )
  );
};

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
): Promise<SkillRuntimeStatusResponse> {
  const context = 'context' in params ? params.context : await getSkillEditRuntimeContext(params);
  const { sessionId, providerConfig, runtimeImage } = context;
  const statusInstance = getRuntimeStatusInstance(context);
  const archiveState = statusInstance?.metadata?.archive?.state;
  const isRuntimeImageOutdated =
    !!statusInstance && !isRuntimeImageMatched(runtimeImage, statusInstance.metadata?.image);

  if (statusInstance && archiveState === 'archiving') {
    if (!isRuntimeUpgradeArchivingTimedOut(statusInstance)) {
      return buildRuntimeStatusResponse({
        sandboxId: statusInstance.sandboxId,
        status: 'upgrading',
        archiveState: 'archiving'
      });
    }

    addLog.warn('[Sandbox] Runtime upgrade archive timed out', {
      sandboxId: statusInstance.sandboxId,
      provider: statusInstance.provider,
      archiveStartedAt: statusInstance.metadata?.archive?.startedAt
    });
    await markRuntimeUpgradeFailed(statusInstance);
    return buildRuntimeStatusResponse({
      sandboxId: statusInstance.sandboxId,
      status: 'upgradeRequired',
      archiveState: 'failed',
      lastError: RUNTIME_UPGRADE_FAILED_MESSAGE
    });
  }

  if (statusInstance && archiveState === 'restoring') {
    return buildRuntimeStatusResponse({
      sandboxId: statusInstance.sandboxId,
      status: 'upgrading',
      archiveState: 'restoring'
    });
  }

  if (
    statusInstance &&
    archiveState === 'archived' &&
    statusInstance.provider !== providerConfig.provider
  ) {
    // 跨 provider 的归档记录已经没有旧 provider 运行态依赖，放行 init 走迁移和恢复归档包流程。
    return buildRuntimeStatusResponse({
      sandboxId: statusInstance.sandboxId,
      status: 'readyToInit',
      archiveState: 'archived'
    });
  }

  // 镜像一致说明当前记录已经是目标 runtime。archiving/restoring 仍需由归档流程接管，
  // 其他 archive state 只代表普通启动/恢复状态，不能再解释成“有新版本沙盒升级中”。
  if (statusInstance && !isRuntimeImageOutdated) {
    return buildRuntimeStatusResponse({
      sandboxId: statusInstance.sandboxId,
      status: 'readyToInit',
      ...(archiveState ? { archiveState } : {})
    });
  }

  if (statusInstance && archiveState === 'archived') {
    // 走到这里说明镜像不一致；归档包已经保留 workspace，但仍需要用户确认 runtime 升级。
    return buildRuntimeStatusResponse({
      sandboxId: statusInstance.sandboxId,
      status: 'upgradeRequired',
      archiveState: 'archived'
    });
  }

  if (statusInstance && archiveState === 'failed') {
    return buildRuntimeStatusResponse({
      sandboxId: statusInstance.sandboxId,
      status: 'upgradeRequired',
      archiveState: 'failed',
      lastError: statusInstance.metadata?.archive?.error
    });
  }

  if (isRuntimeImageOutdated) {
    return buildRuntimeStatusResponse({
      sandboxId: statusInstance.sandboxId,
      status: 'upgradeRequired'
    });
  }

  return buildRuntimeStatusResponse({
    sandboxId: sessionId,
    status: 'readyToInit'
  });
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
): Promise<SkillRuntimeStatusResponse> {
  const context = 'context' in params ? params.context : await getSkillEditRuntimeContext(params);
  const status = await getSkillEditRuntimeStatus({ context });

  if (status.status === 'readyToInit') return status;

  if (status.status === 'upgrading') {
    throw new UserError(RUNTIME_UPGRADE_IN_PROGRESS_MESSAGE);
  }

  const statusInstance = getRuntimeStatusInstance(context);
  const archiveState = statusInstance?.metadata?.archive?.state;
  if (statusInstance && archiveState === 'archived') {
    const updateResult = await markArchivedSandboxRuntimeImageCurrent(statusInstance);
    if (updateResult.matchedCount === 0) return status;

    return buildRuntimeStatusResponse({
      sandboxId: statusInstance.sandboxId,
      status: 'readyToInit',
      archiveState: 'archived'
    });
  }

  const runtimeUpgradeInstance = getRuntimeUpgradeInstance(context);
  if (!runtimeUpgradeInstance) return status;

  const archiveResult = await startSandboxRuntimeUpgradeArchive(runtimeUpgradeInstance, {
    ensureZipInSandbox: true
  });

  if (!archiveResult.success) {
    throw new UserError(RUNTIME_UPGRADE_IN_PROGRESS_MESSAGE);
  }

  return buildRuntimeStatusResponse({
    sandboxId: runtimeUpgradeInstance.sandboxId,
    status: 'upgrading',
    archiveState: 'archiving'
  });
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
    existingInstance,
    staleProviderInstances
  } = context;

  addLog.info('[Sandbox] Initializing skill edit runtime sandbox', {
    skillId,
    teamId
  });

  const runtimeStatusInstance = getRuntimeStatusInstance(context);
  const existingArchiveState = runtimeStatusInstance?.metadata?.archive?.state;
  const shouldRecoverArchivedInstance = existingArchiveState === 'archived';
  let shouldUnzipFromS3 =
    !runtimeStatusInstance || runtimeStatusInstance.metadata?.versionId !== targetVersionId;
  const shouldCleanWorkspaceBeforeDeploy = !!runtimeStatusInstance;
  let archivedRestoreRecord: {
    _id: unknown;
    provider: string;
    sandboxId: string;
  } | null =
    shouldRecoverArchivedInstance && runtimeStatusInstance
      ? {
          _id: runtimeStatusInstance._id,
          provider: runtimeStatusInstance.provider,
          sandboxId: runtimeStatusInstance.sandboxId
        }
      : null;

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

    const activeCount = await countRunningSandboxInstancesByType(
      SandboxTypeEnum.editDebug,
      providerConfig.provider
    );
    if (activeCount < maxEditDebug) return;

    const message = `Active edit-debug sandbox limit reached (${activeCount}/${maxEditDebug}). Please try again later.`;
    onProgress?.({ sandboxId: params.sandboxId, phase: 'failed', message });
    throw new Error(message);
  };

  const withSkillEditMetadata = (metadata: Record<string, unknown> = {}) => ({
    ...metadata,
    teamId,
    tmbId,
    sessionId,
    skillName: skill.name
  });

  const reuseExistingEditDebugSandbox = async (
    instance: NonNullable<typeof existingInstance>
  ): Promise<boolean> => {
    addLog.info('[Sandbox] Found existing sandbox instance, ensuring running', {
      instanceId: instance._id,
      sandboxId: instance.sandboxId
    });

    let sandbox: ISandbox | null = null;

    try {
      // 物理容器丢失时不能直接失败；OpenSandbox 可能仍保留同名 PVC，需要交给运行态按同一 sandboxId 重新拉起。
      const preCheckSandbox = buildSandboxAdapter(providerConfig, {
        sandboxId: instance.sandboxId
      });
      const info = await preCheckSandbox.getInfo().catch(() => null);
      if (!info || info.status.state === 'UnExist' || info.status.state === 'Deleting') {
        addLog.warn(
          '[Sandbox] Existing edit-debug sandbox container is missing, recreating via runtime client',
          {
            sandboxId: instance.sandboxId,
            status: info?.status.state
          }
        );
        return false;
      }

      await ensureCanActivateEditDebugSandbox({
        sandboxId: instance.sandboxId,
        status: instance.status
      });
      onProgress?.({ sandboxId: instance.sandboxId, phase: 'creatingContainer' });

      const connected = await connectReadySandboxByInstance(providerConfig, instance, createConfig);
      sandbox = connected.sandbox;
      await prepareSandbox(
        prepareContext(sandbox),
        preparePackageMirrors(),
        prepareWorkDirectory()
      );

      const existingMetadata = instance.metadata || {};
      const normalizedExistingMetadata = {
        ...withSkillEditMetadata(existingMetadata),
        ...(runtimeImage ? { image: runtimeImage } : {})
      };
      const updatedInstance = await updateSandboxInstanceRecordBySandboxId({
        provider: providerConfig.provider,
        sandboxId: instance.sandboxId,
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        userId: '',
        chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
        metadata: normalizedExistingMetadata,
        touchActive: true
      });
      if (!updatedInstance) {
        throw new UserError(RUNTIME_UPGRADE_IN_PROGRESS_MESSAGE);
      }

      onProgress?.({
        sandboxId: instance.sandboxId,
        phase: 'ready'
      });

      return true;
    } catch (error) {
      addLog.error('[Sandbox] Existing sandbox is unavailable', {
        sandboxId: instance.sandboxId,
        error: getErrText(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      throw error;
    } finally {
      if (sandbox) {
        await disconnectSandbox(sandbox);
      }
    }
  };

  const reloadExistingEditDebugSandbox = async (
    instance: NonNullable<typeof existingInstance>,
    sandbox: ISandbox
  ): Promise<void> => {
    addLog.info('[Sandbox] Reloading mismatched sandbox workspace with new version', {
      instanceId: instance._id,
      sandboxId: instance.sandboxId,
      targetVersionId: currentVersion._id.toString()
    });

    await ensureCanActivateEditDebugSandbox({
      sandboxId: instance.sandboxId,
      status: instance.status
    });

    await prepareSandbox(
      prepareContext(sandbox),
      preparePackageMirrors(),
      downloadSkillPackageToContext({
        storageKey: currentVersion.storageKey,
        onProgress: reportProgress(instance.sandboxId)
      }),
      reportSkillPrepareProgress({
        phase: 'deployingSkills',
        onProgress: reportProgress(instance.sandboxId)
      }),
      emptyWorkDirectory(),
      deployDownloadedSkillPackage({
        skillsRootPath: runtimeProfile.skillsRootPath,
        onProgress: reportProgress(instance.sandboxId)
      })
    );

    const existingMetadata = instance.metadata || {};
    const newMetadata = {
      ...withSkillEditMetadata(existingMetadata),
      ...(runtimeImage ? { image: runtimeImage } : {}),
      versionId: currentVersion._id.toString(),
      storage: {
        key: currentVersion.storageKey,
        uploadedAt: new Date()
      }
    };

    const updatedInstance = await updateSandboxInstanceRecordBySandboxId({
      provider: providerConfig.provider,
      sandboxId: instance.sandboxId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      userId: '',
      chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
      metadata: newMetadata,
      touchActive: true
    });
    if (!updatedInstance) {
      throw new UserError(RUNTIME_UPGRADE_IN_PROGRESS_MESSAGE);
    }

    onProgress?.({
      sandboxId: instance.sandboxId,
      phase: 'ready'
    });
  };

  if (existingInstance && !shouldRecoverArchivedInstance) {
    // 切换历史版本或还原草稿时，如果版本不一致，且容器可用，直接在现有实例中执行热更新（清理 workspace 文件并重新 unzip）
    const existingVersionId = existingInstance.metadata?.versionId;

    if (!existingVersionId || existingVersionId !== targetVersionId) {
      addLog.info('[Sandbox] Sandbox version mismatched, checking online status for hot reload', {
        sandboxId: existingInstance.sandboxId,
        existingVersionId,
        targetVersionId
      });

      let connectedSandbox: ISandbox | null = null;
      try {
        const connected = await connectReadySandboxByInstance(
          providerConfig,
          existingInstance,
          createConfig
        );
        connectedSandbox = connected.sandbox;

        await reloadExistingEditDebugSandbox(existingInstance, connectedSandbox);
        return;
      } catch (error) {
        addLog.error('[Sandbox] Mismatched sandbox is offline or unavailable', {
          sandboxId: existingInstance.sandboxId,
          error: getErrText(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
      } finally {
        if (connectedSandbox) {
          try {
            await disconnectSandbox(connectedSandbox);
          } catch {}
        }
      }
    } else {
      const reusedSandbox = await reuseExistingEditDebugSandbox(existingInstance);
      if (reusedSandbox) return;
    }
  } else if (runtimeStatusInstance && shouldRecoverArchivedInstance) {
    // 归档记录必须交给 runtime restore，不能按“远端容器不存在”清理，否则会删除 S3 归档并创建空 volume。
    addLog.info('[Sandbox] Existing edit-debug sandbox is archived, restoring via runtime client', {
      sandboxId: runtimeStatusInstance.sandboxId,
      archiveState: existingArchiveState
    });
  } else if (runtimeStatusInstance) {
    addLog.info('[Sandbox] Existing edit-debug sandbox record will be normalized by runtime init', {
      sandboxId: runtimeStatusInstance.sandboxId,
      archiveState: existingArchiveState
    });
  }

  if (staleProviderInstances.length > 0) {
    addLog.info('[Sandbox] Removing stale edit-debug sandbox records for inactive provider', {
      skillId,
      provider: providerConfig.provider,
      staleProviders: staleProviderInstances.map((item) => item.provider)
    });
    await Promise.all(
      staleProviderInstances.map(async (instance) => {
        if (instance.metadata?.archive?.state === undefined) {
          // 当前 provider 已切换，非归档旧记录无法通过当前 provider 恢复；这里仅清理本地索引，避免创建链路依赖旧 provider 配置。
          await deleteSandboxResourceRecord(instance).catch((error) => {
            addLog.error('[Sandbox] Failed to delete stale provider sandbox record', {
              sandboxId: instance.sandboxId,
              provider: instance.provider,
              error
            });
          });
        } else {
          // edit-debug sandboxId 由 skillId + edit-debug 稳定生成，不随 provider 变化；只需迁移 Mongo 索引记录。
          const migratedInstance = await migrateArchivedSandboxInstanceRecord({
            source: instance,
            provider: providerConfig.provider,
            sourceType: ChatSourceTypeEnum.skillEdit,
            sourceId: skillId,
            userId: '',
            chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
            type: SandboxTypeEnum.editDebug
          });
          if (migratedInstance) {
            shouldUnzipFromS3 = false;
            archivedRestoreRecord = {
              _id: migratedInstance._id,
              provider: migratedInstance.provider,
              sandboxId: migratedInstance.sandboxId
            };
          }
        }
      })
    );
  }

  const currentProviderInstanceBeforeRuntimeClient =
    existingInstance ??
    (await findSandboxInstanceArchiveState({
      provider: providerConfig.provider,
      sandboxId: sessionId
    }));
  await ensureCanActivateEditDebugSandbox({
    sandboxId: sessionId,
    status: currentProviderInstanceBeforeRuntimeClient?.status
  });
  let sandbox: ISandbox | null = null;
  let sandboxClient: SandboxClient | null = null;
  const shouldCleanupCreatedSandboxOnFailure =
    !currentProviderInstanceBeforeRuntimeClient && !archivedRestoreRecord;

  try {
    onProgress?.({ sandboxId: sessionId, phase: 'creatingContainer' });
    const createRuntimeSandboxClient = () =>
      getSandboxClient(
        {
          sandboxId: sessionId,
          sourceType: ChatSourceTypeEnum.skillEdit,
          sourceId: skillId,
          userId: '',
          chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
        },
        {
          createConfig
        }
      );

    const client = await createRuntimeSandboxClient();
    sandboxClient = client;
    sandbox = client.provider;

    const sandboxInfo = await getReadySandboxInfo(client.provider, {
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
      userId: '',
      chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
      type: SandboxTypeEnum.editDebug,
      touchActive: true,
      metadata: {
        teamId,
        tmbId,
        sessionId,
        ...(runtimeImage ? { image: runtimeImage } : {}),
        providerCreatedAt: sandboxInfo.createdAt,
        storage: {
          key: currentVersion.storageKey,
          uploadedAt: new Date()
        },
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
      error instanceof SandboxArchiveStateError &&
      isRuntimeUpgradeBusyArchiveState(error.state)
    ) {
      throw new UserError(RUNTIME_UPGRADE_IN_PROGRESS_MESSAGE);
    }

    addLog.error('[Sandbox] Failed to create sandbox', {
      error,
      rawBody: (error as any)?.cause?.rawBody ?? (error as any)?.rawBody
    });

    if (sandboxClient && shouldCleanupCreatedSandboxOnFailure) {
      try {
        await sandboxClient.delete({ keepArchive: true });
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
  const maxBytes = serviceEnv.AGENT_SANDBOX_SKILL_MAX_SIZE * 1024 * 1024;

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
    } catch (err: any) {
      addLog.warn('[Sandbox] Failed to read root .gitignore file', {
        sandboxId,
        error: err.message
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
