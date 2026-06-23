import { getErrText } from '@fastgpt/global/common/error/utils';
import type { ISandbox, SandboxCreateSpec } from '@fastgpt-sdk/sandbox-adapter';
import { MongoAgentSkills } from '../model/schema';
import { MongoAgentSkillsVersion } from '../version/schema';
import { shellQuote, joinSandboxPath, parseGitignoreRules } from '../utils';
import { downloadSkillPackage, DEFAULT_GITIGNORE_CONTENT, validateZipStructure } from '../package';
import { EDIT_DEBUG_SANDBOX_CHAT_ID, getEditDebugSandboxId } from './config';
import {
  getSandboxProviderConfig,
  validateSandboxConfig,
  getSandboxAdapterConfig
} from '../../sandbox/provider/config';
import { getSandboxRuntimeProfile } from '../../sandbox/runtime/profile';
import type { SandboxImageConfigType } from '@fastgpt/global/core/ai/skill/type';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  connectReadySandboxByInstance,
  connectToSandbox,
  disconnectSandbox,
  getReadySandboxInfo
} from '../../sandbox/provider/lifecycle';
import { buildSandboxAdapter } from '../../sandbox/provider/adapter';
import type { SandboxClient } from '../../sandbox/service/runtime';
import { getSandboxClient } from '../../sandbox/service/runtime';
import { deleteSandboxResource } from '../../sandbox/service/resource';
import {
  countRunningSandboxInstancesByType,
  deleteSandboxInstanceRecord,
  findSandboxInstanceByAppChatType,
  findSandboxResourcesByAppChatTypeExcludeProvider,
  migrateArchivedSandboxInstanceRecord,
  updateSandboxInstanceRecordBySandboxId
} from '../../sandbox/instance/repository';
import { getLogger, LogCategories } from '../../../../common/logger';
import { serviceEnv } from '../../../../env';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';
import { checkTeamSandboxPermission } from '../../../../support/permission/teamLimit';
import { createAgentSandboxPermissionDeniedError } from '../../sandbox/error';

const addLog = getLogger(LogCategories.MODULE.AI.AGENT);

export type CreateEditDebugSandboxParams = {
  skillId: string;
  teamId: string;
  tmbId: string;
  image?: SandboxImageConfigType;
  entrypoint?: SandboxCreateSpec['entrypoint'];
  onProgress?: (status: SandboxStatusItemType) => void;
};

export type CreateEditDebugSandboxResult = {
  sandboxId: string;
  status: {
    state: string;
    message?: string;
  };
};

/**
 * 创建或复用一个 skill 编辑态 sandbox。
 *
 * 该流程只服务 edit-debug：下载当前版本包，标准化目录结构，写入并解压到
 * sandbox 工作目录下的 `skills`，最后返回 sandboxId/status 供 SandboxEditor 文件 API 使用。普通 agent session
 * 的 skill 注入逻辑仍由 runtime/useSandbox 负责，避免编辑态和运行态生命周期互相污染。
 */
export async function createEditDebugSandbox(
  params: CreateEditDebugSandboxParams
): Promise<CreateEditDebugSandboxResult> {
  const { skillId, teamId, tmbId, image, entrypoint, onProgress } = params;

  try {
    await checkTeamSandboxPermission(teamId);
  } catch {
    throw createAgentSandboxPermissionDeniedError();
  }

  const providerConfig = getSandboxProviderConfig();
  const runtimeProfile = getSandboxRuntimeProfile(providerConfig.provider);
  validateSandboxConfig(providerConfig);

  addLog.info('[Sandbox] Creating edit-debug sandbox', {
    skillId,
    teamId
  });

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

  // 提前构造 runtimeMetadata 与 createConfig，以便 reload 流程和全新创建流程共同访问并进行热连接/热拉起
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
      ...(image ? { image } : {}),
      entrypoint,
      metadata: runtimeMetadata
    }
  });

  if (!createConfig) {
    throw new Error('Failed to build sandbox create config');
  }

  /**
   * 复用编辑沙盒时只保证 sandbox 工作目录下的 skills 存在。
   *
   * 历史版本曾把编辑态内容放在 skills/<edit-dir> 下；如果当前 skills 里
   * 只有这个旧 wrapper，启动时顺手展开一层，避免每次加载继续制造
   * skills/<edit-dir>/<real-skill>/SKILL.md 这种嵌套结构。
   */
  const existingInstance = await findSandboxInstanceByAppChatType({
    provider: providerConfig.provider,
    appId: skillId,
    chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
    type: SandboxTypeEnum.editDebug
  });

  const targetVersionId = currentVersion._id.toString();
  let shouldUnzipFromS3 =
    !existingInstance || existingInstance.metadata?.versionId !== targetVersionId;
  const existingArchiveState = existingInstance?.metadata?.archive?.state;
  const shouldRecoverArchivedInstance = existingArchiveState !== undefined;
  let archivedRestoreRecord: {
    _id: unknown;
    provider: string;
    sandboxId: string;
  } | null =
    existingArchiveState === 'archived' && existingInstance
      ? {
          _id: existingInstance._id,
          provider: existingInstance.provider,
          sandboxId: existingInstance.sandboxId
        }
      : null;

  const forceCleanupStaleSandbox = async (instance: NonNullable<typeof existingInstance>) => {
    try {
      await deleteSandboxResource(instance, { keepVolume: true });
    } catch (deleteError) {
      addLog.error('[Sandbox] Failed to delete unavailable sandbox resource', {
        sandboxId: instance.sandboxId,
        error: deleteError
      });
    }
    await deleteSandboxInstanceRecord(instance._id);
  };

  /**
   * edit-debug 是可从当前 skill package 重建的临时工作区。
   * 当历史归档记录存在但 S3 对象已缺失时，只在本入口降级重建，避免普通运行态 sandbox 静默丢数据。
   */
  const isMissingSandboxArchiveError = (error: unknown): boolean => {
    const pending: unknown[] = [error];
    const visited = new Set<unknown>();

    while (pending.length > 0) {
      const current = pending.shift();
      if (!current || typeof current !== 'object' || visited.has(current)) continue;
      visited.add(current);

      const errorLike = current as Error & {
        code?: unknown;
        Code?: unknown;
        cause?: unknown;
        commandError?: unknown;
      };
      const errorName = errorLike.name;
      const errorCode = errorLike.code ?? errorLike.Code;
      const message = errorLike.message ?? '';

      if (
        errorName === 'NoSuchKey' ||
        errorCode === 'NoSuchKey' ||
        (message.includes('NoSuchKey') && message.includes('specified key does not exist'))
      ) {
        return true;
      }

      pending.push(errorLike.cause, errorLike.commandError);
    }

    return false;
  };

  const reuseExistingEditDebugSandbox = async (
    instance: NonNullable<typeof existingInstance>
  ): Promise<CreateEditDebugSandboxResult | null> => {
    addLog.info('[Sandbox] Found existing sandbox instance, ensuring running', {
      instanceId: instance._id,
      sandboxId: instance.sandboxId
    });

    let sandbox: ISandbox | null = null;

    try {
      // 在连接前先校验物理容器是否存在。如果已被物理删除，则不应复用，应直接走重建流程以恢复文件。
      const preCheckSandbox = buildSandboxAdapter(providerConfig, {
        sandboxId: instance.sandboxId
      });
      const info = await preCheckSandbox.getInfo().catch(() => null);
      if (!info || info.status.state === 'UnExist' || info.status.state === 'Deleting') {
        throw new Error('Sandbox container does not exist physically');
      }

      onProgress?.({ sandboxId: instance.sandboxId, phase: 'creatingContainer' });

      const connected = await connectReadySandboxByInstance(providerConfig, instance, createConfig);
      sandbox = connected.sandbox;

      const existingMetadata = instance.metadata || {};
      const workspaceHasContent = await hasWorkspaceContent(sandbox);
      if (!workspaceHasContent) {
        addLog.warn(
          '[Sandbox] Existing edit-debug sandbox workspace is empty, redeploying package',
          {
            sandboxId: instance.sandboxId
          }
        );

        onProgress?.({ sandboxId: instance.sandboxId, phase: 'downloadingPackage' });
        const packageBuffer = await downloadSkillPackage({
          storageKey: currentVersion.storageKey
        });
        await uploadAndDecompressPackage(sandbox, instance.sandboxId, packageBuffer);

        await updateSandboxInstanceRecordBySandboxId({
          provider: providerConfig.provider,
          sandboxId: instance.sandboxId,
          appId: skillId,
          userId: '',
          chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
          metadata: {
            ...existingMetadata,
            versionId: targetVersionId,
            storage: {
              key: currentVersion.storageKey,
              uploadedAt: new Date()
            }
          }
        });

        onProgress?.({
          sandboxId: instance.sandboxId,
          phase: 'ready'
        });

        return {
          sandboxId: instance.sandboxId,
          status: { state: 'Running' }
        };
      }

      await updateSandboxInstanceRecordBySandboxId({
        provider: providerConfig.provider,
        sandboxId: instance.sandboxId,
        appId: skillId,
        userId: '',
        chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
        metadata: existingMetadata
      });

      onProgress?.({
        sandboxId: instance.sandboxId,
        phase: 'ready'
      });

      return {
        sandboxId: instance.sandboxId,
        status: { state: 'Running' }
      };
    } catch (error) {
      addLog.error('[Sandbox] Existing sandbox is unavailable, recreating edit-debug sandbox', {
        sandboxId: instance.sandboxId,
        error: getErrText(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      shouldUnzipFromS3 = true;
      await forceCleanupStaleSandbox(instance);
      return null;
    } finally {
      if (sandbox) {
        await disconnectSandbox(sandbox);
      }
    }
  };

  const uploadAndDecompressPackage = async (
    sandbox: ISandbox,
    sandboxId: string,
    packageBuffer: Buffer
  ) => {
    onProgress?.({ sandboxId, phase: 'uploadingPackage' });
    const prepareSkillsRootResult = await sandbox.execute(
      `mkdir -p ${shellQuote(runtimeProfile.skillsRootPath)}`
    );
    if (prepareSkillsRootResult.exitCode !== 0) {
      throw new Error(`Failed to prepare skill directory: ${prepareSkillsRootResult.stderr}`);
    }

    const zipPath = joinSandboxPath(runtimeProfile.skillsRootPath, 'package.zip');
    const maxPackageBytes = serviceEnv.AGENT_SANDBOX_SKILL_MAX_SIZE * 1024 * 1024;

    const writeResults = await sandbox.writeFiles([
      {
        path: zipPath,
        data: packageBuffer
      }
    ]);
    const failedWrite = writeResults.find((result) => result.error);
    if (failedWrite) {
      throw new Error(`Failed to write skill package ZIP: ${failedWrite.error?.message}`);
    }

    onProgress?.({ sandboxId, phase: 'extractingPackage' });

    const unzipCmd = [
      `cd ${shellQuote(runtimeProfile.workDirectory)}`,
      `unzip -Z -t ${shellQuote(zipPath)} | awk -v max=${maxPackageBytes} 'BEGIN { ok=0 } /uncompressed,/ { ok=(($3 + 0) <= max) } END { exit ok ? 0 : 1 }'`,
      `unzip -Z1 ${shellQuote(zipPath)} | awk 'BEGIN { ok=1 } /^\\// || /(^|\\/)\\.\\.($|\\/)/ { ok=0 } END { exit ok ? 0 : 1 }'`,
      `unzip -o -q ${shellQuote(zipPath)} -d .`,
      `rm -f ${shellQuote(zipPath)}`,
      `if [ ! -f .gitignore ]; then echo ${shellQuote(DEFAULT_GITIGNORE_CONTENT)} > .gitignore; fi`
    ].join(' && ');

    const extractResult = await sandbox.execute(unzipCmd);
    if (extractResult.exitCode !== 0) {
      throw new Error(`Failed to decompress package inside sandbox: ${extractResult.stderr}`);
    }
  };

  const cleanWorkspace = async (sandbox: ISandbox) => {
    // 已有实例重部署时先清空工作区；保留挂载点本身，避免 volume 根目录权限问题。
    const cleanCmd = `find ${shellQuote(runtimeProfile.workDirectory)} -mindepth 1 -delete || (rm -rf ${shellQuote(runtimeProfile.workDirectory)}/* && rm -rf ${shellQuote(runtimeProfile.workDirectory)}/.[!.]*)`;

    const cleanResult = await sandbox.execute(cleanCmd);
    if (cleanResult.exitCode !== 0) {
      throw new Error(`Failed to clean workspace processes and files: ${cleanResult.stderr}`);
    }
  };

  const hasWorkspaceContent = async (sandbox: ISandbox): Promise<boolean> => {
    const quotedWorkDirectory = shellQuote(runtimeProfile.workDirectory);
    const result = await sandbox.execute(
      `mkdir -p ${quotedWorkDirectory} && test -n "$(find ${quotedWorkDirectory} -mindepth 1 -print -quit 2>/dev/null)"`
    );

    if (result.exitCode === 0) return true;
    if (result.exitCode === 1) return false;

    throw new Error(`Failed to inspect workspace content: ${result.stderr || result.stdout}`);
  };

  const reloadExistingEditDebugSandbox = async (
    instance: NonNullable<typeof existingInstance>,
    sandbox: ISandbox
  ): Promise<CreateEditDebugSandboxResult> => {
    addLog.info('[Sandbox] Reloading mismatched sandbox workspace with new version', {
      instanceId: instance._id,
      sandboxId: instance.sandboxId,
      targetVersionId: currentVersion._id.toString()
    });

    onProgress?.({ sandboxId: instance.sandboxId, phase: 'downloadingPackage' });
    const packageBuffer = await downloadSkillPackage({
      storageKey: currentVersion.storageKey
    });

    onProgress?.({ sandboxId: instance.sandboxId, phase: 'deployingSkills' });

    await cleanWorkspace(sandbox);

    await uploadAndDecompressPackage(sandbox, instance.sandboxId, packageBuffer);

    const existingMetadata = instance.metadata || {};
    const newMetadata = {
      ...existingMetadata,
      versionId: currentVersion._id.toString(),
      storage: {
        key: currentVersion.storageKey,
        uploadedAt: new Date()
      }
    };

    await updateSandboxInstanceRecordBySandboxId({
      provider: providerConfig.provider,
      sandboxId: instance.sandboxId,
      appId: skillId,
      userId: '',
      chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
      metadata: newMetadata
    });

    onProgress?.({
      sandboxId: instance.sandboxId,
      phase: 'ready'
    });

    return {
      sandboxId: instance.sandboxId,
      status: { state: 'Running' }
    };
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

        return await reloadExistingEditDebugSandbox(existingInstance, connectedSandbox);
      } catch (error) {
        addLog.error(
          '[Sandbox] Mismatched sandbox is offline or unavailable, falling back to full recreation',
          {
            sandboxId: existingInstance.sandboxId,
            error: getErrText(error),
            stack: error instanceof Error ? error.stack : undefined
          }
        );
        await forceCleanupStaleSandbox(existingInstance);
        // 让流程继续往下走全新创建流程
      } finally {
        if (connectedSandbox) {
          try {
            await disconnectSandbox(connectedSandbox);
          } catch {}
        }
      }
    } else {
      const reusedSandbox = await reuseExistingEditDebugSandbox(existingInstance);
      if (reusedSandbox) return reusedSandbox;
    }
  } else if (existingInstance) {
    // 归档记录必须交给 runtime restore，不能按“远端容器不存在”清理，否则会删除 S3 归档并创建空 volume。
    addLog.info('[Sandbox] Existing edit-debug sandbox is archived, restoring via runtime client', {
      sandboxId: existingInstance.sandboxId,
      archiveState: existingArchiveState
    });
  }

  const staleProviderInstances = await findSandboxResourcesByAppChatTypeExcludeProvider({
    provider: providerConfig.provider,
    appId: skillId,
    chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
    type: SandboxTypeEnum.editDebug
  });
  if (staleProviderInstances.length > 0) {
    addLog.info('[Sandbox] Removing stale edit-debug sandbox records for inactive provider', {
      skillId,
      provider: providerConfig.provider,
      staleProviders: staleProviderInstances.map((item) => item.provider)
    });
    await Promise.all(
      staleProviderInstances.map(async (instance) => {
        if (instance.metadata?.archive?.state === undefined) {
          await deleteSandboxResource(instance).catch((error) => {
            addLog.error('[Sandbox] Failed to delete stale provider sandbox resource', {
              sandboxId: instance.sandboxId,
              provider: instance.provider,
              error
            });
          });
          await deleteSandboxInstanceRecord(instance._id);
        } else {
          // edit-debug sandboxId 由 skillId + edit-debug 稳定生成，不随 provider 变化；只需迁移 Mongo 索引记录。
          const migratedInstance = await migrateArchivedSandboxInstanceRecord({
            source: instance,
            provider: providerConfig.provider,
            appId: skillId,
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

  const maxEditDebug =
    global.feConfigs?.limit?.agentSandboxMaxEditDebug ?? serviceEnv.AGENT_SANDBOX_MAX_EDIT_DEBUG;
  if (maxEditDebug !== undefined) {
    const activeCount = await countRunningSandboxInstancesByType(
      SandboxTypeEnum.editDebug,
      providerConfig.provider
    );
    if (activeCount >= maxEditDebug) {
      const message = `Active edit-debug sandbox limit reached (${activeCount}/${maxEditDebug}). Please try again later.`;
      onProgress?.({ sandboxId: sessionId, phase: 'failed', message });
      throw new Error(message);
    }
  }

  let sandbox: ISandbox | null = null;
  let sandboxClient: SandboxClient | null = null;

  try {
    onProgress?.({ sandboxId: sessionId, phase: 'creatingContainer' });
    const createRuntimeSandboxClient = () =>
      getSandboxClient(
        {
          appId: skillId,
          userId: '',
          chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
        },
        {
          createConfig
        }
      );

    let client: SandboxClient;
    try {
      client = await createRuntimeSandboxClient();
    } catch (error) {
      if (!archivedRestoreRecord || !isMissingSandboxArchiveError(error)) {
        throw error;
      }

      addLog.warn(
        '[Sandbox] Archived edit-debug package is missing, rebuilding from skill package',
        {
          sandboxId: archivedRestoreRecord.sandboxId,
          provider: archivedRestoreRecord.provider,
          error
        }
      );

      await deleteSandboxInstanceRecord(archivedRestoreRecord._id);
      archivedRestoreRecord = null;
      shouldUnzipFromS3 = true;

      client = await createRuntimeSandboxClient();
    }
    sandboxClient = client;
    sandbox = client.provider;

    const sandboxInfo = await getReadySandboxInfo(client.provider, {
      sandboxId: sessionId,
      image: createConfig.image,
      entrypoint: createConfig.entrypoint,
      status: client.provider.status
    });

    const prepareWorkDirectoryResult = await client.provider.execute(
      `mkdir -p ${shellQuote(runtimeProfile.workDirectory)}`
    );
    if (prepareWorkDirectoryResult.exitCode !== 0) {
      throw new Error(
        `Failed to prepare workspace directory: ${prepareWorkDirectoryResult.stderr}`
      );
    }

    if (shouldUnzipFromS3) {
      onProgress?.({ sandboxId: sessionId, phase: 'downloadingPackage' });
      const packageBuffer = await downloadSkillPackage({
        storageKey: currentVersion.storageKey
      });
      if (existingInstance) {
        await cleanWorkspace(client.provider);
      }
      await uploadAndDecompressPackage(client.provider, sessionId, packageBuffer);
    } else {
      addLog.info(
        '[Sandbox] Skill sandbox resumed with existing volume, skip initial S3 download/unzip',
        {
          sandboxId: sessionId
        }
      );
    }

    const newSandboxDoc = await updateSandboxInstanceRecordBySandboxId({
      provider: providerConfig.provider,
      sandboxId: sessionId,
      appId: skillId,
      userId: '',
      chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
      type: SandboxTypeEnum.editDebug,
      metadata: {
        teamId,
        tmbId,
        skillId,
        sessionId,
        ...(sandboxInfo.image ? { image: sandboxInfo.image } : {}),
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

    return {
      sandboxId: sessionId,
      status: {
        state: sandboxInfo.status.state,
        message: sandboxInfo.status.message
      }
    };
  } catch (error) {
    addLog.error('[Sandbox] Failed to create sandbox', {
      error,
      rawBody: (error as any)?.cause?.rawBody ?? (error as any)?.rawBody
    });

    if (sandboxClient) {
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
}): Promise<Buffer> {
  const { sandboxId, workDirectory } = params;
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
    const zipCommand = `cd ${quotedTargetDir} && zip -r -y package.zip . ${excludeArgs}`;
    const zipResult = await newSandbox.execute(zipCommand);

    if (zipResult.exitCode !== 0) {
      throw new Error(`Failed to package skill directory: ${zipResult.stderr || zipResult.stdout}`);
    }

    const zipFilePath = joinSandboxPath(targetDir, 'package.zip');
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

      const validation = await validateZipStructure(zipBuffer, {
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
