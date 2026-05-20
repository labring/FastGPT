import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { MongoAgentSkills } from '../model/schema';
import { MongoAgentSkillsVersion } from '../version/schema';
import { downloadSkillPackage, normalizeSkillPackageZipForSandbox } from '../package';
import { getSkillSizeLimits } from '../sandbox/config';
import {
  EDIT_DEBUG_SANDBOX_CHAT_ID,
  getEditDebugSandboxId,
  buildEditDebugCreateConfig
} from './config';
import {
  getSandboxDefaults,
  getSandboxProviderConfig,
  validateSandboxConfig
} from '../../sandbox/config';
import type {
  SandboxImageConfigType,
  SkillSandboxEndpointType
} from '@fastgpt/global/core/ai/skill/type';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  connectReadySandboxByInstance,
  connectToSandbox,
  disconnectSandbox,
  getReadySandboxInfo,
  getSandboxEndpoint,
  SandboxClient,
  getSandboxClient
} from '../../sandbox/controller';
import {
  countRunningSandboxInstancesByType,
  deleteSandboxInstanceRecord,
  findSandboxInstanceByAppChatType,
  findSandboxResourcesByAppChatTypeExcludeProvider,
  updateSandboxInstanceEndpoint,
  updateSandboxInstanceRecordBySandboxId
} from '../../sandbox/instance';
import { getLogger, LogCategories } from '../../../../common/logger';
import { serviceEnv } from '../../../../env';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';
import {
  getSafeSkillDirectoryName,
  getSkillsRootPath,
  joinSandboxPath,
  shellQuote
} from '../runtime';

const addLog = getLogger(LogCategories.MODULE.AI.AGENT);

export type CreateEditDebugSandboxParams = {
  skillId: string;
  teamId: string;
  tmbId: string;
  image?: SandboxImageConfigType;
  entrypoint?: string;
  onProgress?: (status: SandboxStatusItemType) => void;
};

export type CreateEditDebugSandboxResult = {
  sandboxId: string;
  endpoint: SkillSandboxEndpointType;
  status: {
    state: string;
    message?: string;
  };
};

/**
 * 创建或复用一个 skill 编辑态 sandbox。
 *
 * 该流程只服务 edit-debug：下载 active version 包，标准化目录结构，写入并解压到
 * sandbox 工作目录下的 `skills`，最后返回 code-server endpoint。普通 agent session
 * 的 skill 注入逻辑仍由 runtime/useSandbox 负责，避免编辑态和运行态生命周期互相污染。
 */
export async function createEditDebugSandbox(
  params: CreateEditDebugSandboxParams
): Promise<CreateEditDebugSandboxResult> {
  const { skillId, teamId, tmbId, image, entrypoint, onProgress } = params;

  const providerConfig = getSandboxProviderConfig();
  const defaults = getSandboxDefaults();
  validateSandboxConfig(providerConfig);

  const sandboxImage = image || defaults.defaultImage;

  addLog.info('[Sandbox] Creating edit-debug sandbox', {
    skillId,
    teamId,
    image: sandboxImage
  });

  const skill = await MongoAgentSkills.findOne({
    _id: skillId,
    teamId,
    deleteTime: null
  });

  if (!skill) {
    throw new Error('Skill not found or access denied');
  }

  if (!skill.currentStorage) {
    throw new Error('Skill package not found - no current version available');
  }

  const activeVersion = await MongoAgentSkillsVersion.findOne({
    skillId,
    isActive: true,
    isDeleted: false
  });

  if (!activeVersion) {
    throw new Error('No active version found for skill');
  }

  const sessionId = getEditDebugSandboxId(skillId);
  const getEditSkillSandboxPaths = () => ({
    skillsRootPath: getSkillsRootPath(defaults.workDirectory)
  });

  /**
   * 复用编辑沙盒时只保证 sandbox 工作目录下的 skills 存在。
   *
   * 历史版本曾把编辑态内容放在 skills/<edit-dir> 下；如果当前 skills 里
   * 只有这个旧 wrapper，启动时顺手展开一层，避免每次加载继续制造
   * skills/<edit-dir>/<real-skill>/SKILL.md 这种嵌套结构。
   */
  const ensureEditSkillDirectory = async (sandbox: ISandbox, skillName: string) => {
    const { skillsRootPath } = getEditSkillSandboxPaths();
    const relativeSkillsRootPath = getSkillsRootPath('.');
    const safeName = getSafeSkillDirectoryName(skillName);
    const targetEditDir = joinSandboxPath(skillsRootPath, safeName);
    const migrateResult = await sandbox.execute(
      [
        `mkdir -p ${shellQuote(skillsRootPath)}`,
        [
          `canonical_entry_count=$(find ${shellQuote(
            skillsRootPath
          )} -mindepth 1 -maxdepth 1 ! -name '.normalize-edit-skill' | wc -l | tr -d ' ')`,
          `if [ "$canonical_entry_count" = "0" ] && [ -d ${shellQuote(
            relativeSkillsRootPath
          )} ] && [ ${shellQuote(relativeSkillsRootPath)} != ${shellQuote(skillsRootPath)} ]; then`,
          `find ${shellQuote(
            relativeSkillsRootPath
          )} -mindepth 1 -maxdepth 1 -exec mv {} ${shellQuote(`${skillsRootPath}/`)} \\;`,
          'fi'
        ].join(' '),
        [
          `legacy_edit_dir=$(find ${shellQuote(
            skillsRootPath
          )} -mindepth 1 -maxdepth 1 -type d -name ${shellQuote(`*-${skillId}-edit`)} | head -n 1)`,
          `if [ -n "$legacy_edit_dir" ]; then`,
          `mkdir -p ${shellQuote(targetEditDir)} &&`,
          `find "$legacy_edit_dir" -mindepth 1 -maxdepth 1 -exec mv {} ${shellQuote(
            `${targetEditDir}/`
          )} \\; &&`,
          `rm -rf "$legacy_edit_dir"`,
          'fi'
        ].join(' '),
        [
          `if [ -f ${shellQuote(joinSandboxPath(skillsRootPath, 'SKILL.md'))} ] || [ -f ${shellQuote(joinSandboxPath(skillsRootPath, 'skill.md'))} ]; then`,
          `mkdir -p ${shellQuote(targetEditDir)} &&`,
          `find ${shellQuote(
            skillsRootPath
          )} -mindepth 1 -maxdepth 1 ! -name '.normalize-edit-skill' ! -name "${safeName.replace(/"/g, '\\"')}" -exec mv {} ${shellQuote(
            `${targetEditDir}/`
          )} \\;`,
          'fi'
        ].join(' ')
      ].join(' && ')
    );

    if (migrateResult.exitCode !== 0) {
      throw new Error(`Failed to prepare edit skill directory: ${migrateResult.stderr}`);
    }

    return targetEditDir;
  };

  const existingInstance = await findSandboxInstanceByAppChatType({
    provider: providerConfig.provider,
    appId: skillId,
    chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
    type: SandboxTypeEnum.editDebug
  });

  const reuseExistingEditDebugSandbox = async (
    instance: NonNullable<typeof existingInstance>
  ): Promise<CreateEditDebugSandboxResult | null> => {
    addLog.info('[Sandbox] Found existing sandbox instance, ensuring running', {
      instanceId: instance._id,
      sandboxId: instance.sandboxId
    });

    let sandbox: ISandbox | null = null;

    try {
      onProgress?.({ sandboxId: instance.sandboxId, phase: 'creatingContainer' });

      const connected = await connectReadySandboxByInstance(providerConfig, instance);
      sandbox = connected.sandbox;
      await ensureEditSkillDirectory(sandbox, skill.name);

      const endpointInfo = await getSandboxEndpoint(sandbox);

      await updateSandboxInstanceEndpoint({ instanceId: instance._id, endpoint: endpointInfo });
      await updateSandboxInstanceRecordBySandboxId({
        provider: providerConfig.provider,
        sandboxId: instance.sandboxId,
        appId: skillId,
        userId: '',
        chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
      });

      onProgress?.({
        sandboxId: instance.sandboxId,
        phase: 'ready',
        endpoint: endpointInfo
      });

      return {
        sandboxId: instance.sandboxId,
        endpoint: endpointInfo,
        status: { state: 'Running' }
      };
    } catch (error) {
      addLog.info('[Sandbox] Existing sandbox is unavailable, recreating edit-debug sandbox', {
        sandboxId: instance.sandboxId,
        error
      });

      await deleteSandboxInstanceRecord(instance._id);
      return null;
    } finally {
      if (sandbox) {
        await disconnectSandbox(sandbox);
      }
    }
  };

  if (existingInstance) {
    const reusedSandbox = await reuseExistingEditDebugSandbox(existingInstance);
    if (reusedSandbox) return reusedSandbox;
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
        await SandboxClient.deleteResource(instance).catch((error) => {
          addLog.error('[Sandbox] Failed to delete stale provider sandbox resource', {
            sandboxId: instance.sandboxId,
            provider: instance.provider,
            error
          });
        });
        await deleteSandboxInstanceRecord(instance._id);
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
    onProgress?.({ sandboxId: sessionId, phase: 'downloadingPackage' });
    const packageBuffer = await downloadSkillPackage({
      storageInfo: activeVersion.storage
    });

    const standardizedBuffer = await normalizeSkillPackageZipForSandbox(packageBuffer);

    onProgress?.({ sandboxId: sessionId, phase: 'creatingContainer' });

    const createConfig = buildEditDebugCreateConfig({
      providerConfig,
      sessionId,
      sandboxImage,
      defaults,
      entrypoint,
      skillId,
      teamId
    });
    const client = await getSandboxClient(
      {
        appId: skillId,
        userId: '',
        chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
      },
      {
        createConfig
      }
    );
    sandboxClient = client;
    sandbox = client.provider;

    const sandboxInfo = await getReadySandboxInfo(client.provider, {
      sandboxId: sessionId,
      image: createConfig.image ?? sandboxImage,
      entrypoint: createConfig.entrypoint,
      status: client.provider.status
    });

    const { skillsRootPath } = getEditSkillSandboxPaths();
    const editSkillDir = joinSandboxPath(skillsRootPath, getSafeSkillDirectoryName(skill.name));
    const zipPath = joinSandboxPath(defaults.workDirectory, 'package.zip');

    const prepareWorkDirectoryResult = await client.provider.execute(
      `mkdir -p ${shellQuote(defaults.workDirectory)}`
    );
    if (prepareWorkDirectoryResult.exitCode !== 0) {
      throw new Error(
        `Failed to prepare workspace directory: ${prepareWorkDirectoryResult.stderr}`
      );
    }

    onProgress?.({ sandboxId: sessionId, phase: 'uploadingPackage' });
    await client.provider.writeFiles([
      {
        path: zipPath,
        data: standardizedBuffer
      }
    ]);

    onProgress?.({ sandboxId: sessionId, phase: 'extractingPackage' });
    const extractResult = await client.provider.execute(
      [
        `rm -rf ${shellQuote(editSkillDir)}`,
        `mkdir -p ${shellQuote(editSkillDir)}`,
        `unzip -o ${shellQuote(zipPath)} -d ${shellQuote(editSkillDir)}`,
        `rm ${shellQuote(zipPath)}`
      ].join(' && ')
    );

    if (extractResult.exitCode !== 0) {
      throw new Error(`Failed to extract package: ${extractResult.stderr}`);
    }

    const endpointInfo = await getSandboxEndpoint(client.provider);

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
        editSkillDir: editSkillDir,
        provider: providerConfig.provider,
        image: sandboxInfo.image,
        providerCreatedAt: sandboxInfo.createdAt,
        endpoint: endpointInfo,
        storage: {
          bucket: activeVersion.storage.bucket,
          key: activeVersion.storage.key,
          size: standardizedBuffer.length,
          uploadedAt: new Date()
        },
        metadata: new Map([
          ['skillName', skill.name],
          ['version', activeVersion.version.toString()]
        ])
      }
    });

    if (!newSandboxDoc) throw new Error('Failed to find sandbox document after creation');

    onProgress?.({
      sandboxId: sessionId,
      phase: 'ready',
      endpoint: endpointInfo
    });

    return {
      sandboxId: sessionId,
      endpoint: endpointInfo,
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
  fallbackDirectory?: {
    rootDirectory: string;
    suffix: string;
  };
}): Promise<Buffer> {
  const { sandboxId, workDirectory, fallbackDirectory } = params;
  const { maxSandboxPackageBytes: maxBytes } = getSkillSizeLimits();

  const providerConfig = getSandboxProviderConfig();
  const defaults = getSandboxDefaults();
  const preferredTargetDir = workDirectory || defaults.workDirectory;

  let sandbox: ISandbox | null = null;

  try {
    const newSandbox = await connectToSandbox(providerConfig, sandboxId);
    sandbox = newSandbox;

    const preferredDirExists = await newSandbox.execute(`[ -d ${shellQuote(preferredTargetDir)} ]`);
    const targetDir = await (async () => {
      if (preferredDirExists.exitCode === 0) return preferredTargetDir;
      if (!fallbackDirectory) return preferredTargetDir;

      const fallbackResult = await newSandbox.execute(
        `find ${shellQuote(fallbackDirectory.rootDirectory)} -mindepth 1 -maxdepth 1 -type d -name ${shellQuote(
          `*${fallbackDirectory.suffix}`
        )} -print | head -n 1`
      );
      const fallbackDir = fallbackResult.stdout.trim().split('\n').filter(Boolean)[0];
      return fallbackResult.exitCode === 0 && fallbackDir ? fallbackDir : preferredTargetDir;
    })();
    const quotedTargetDir = shellQuote(targetDir);

    const sizeCheckCmd = `find ${quotedTargetDir} -type f ! -name 'package.zip' -ls 2>/dev/null | awk '{s+=$7} END {print s+0}'`;
    const sizeResult = await newSandbox.execute(sizeCheckCmd);

    if (sizeResult.exitCode === 0 && sizeResult.stdout.trim()) {
      const dirBytes = parseInt(sizeResult.stdout.trim(), 10);
      if (!isNaN(dirBytes) && dirBytes > maxBytes) {
        throw new Error(
          `Skill directory size (${(dirBytes / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${maxBytes / 1024 / 1024}MB)`
        );
      }
    }

    const zipCommand = `cd ${quotedTargetDir} && zip -r package.zip . -x 'package.zip'`;
    const zipResult = await newSandbox.execute(zipCommand);

    if (zipResult.exitCode !== 0) {
      throw new Error(`Failed to package skill directory: ${zipResult.stderr || zipResult.stdout}`);
    }

    const zipFilePath = joinSandboxPath(targetDir, 'package.zip');
    const files = await newSandbox.readFiles([zipFilePath]);

    if (!files || files.length === 0) {
      throw new Error('Package file not found in sandbox');
    }

    await newSandbox.execute(`rm -f ${shellQuote(zipFilePath)}`);

    const content = files[0].content;
    return Buffer.from(content instanceof Uint8Array ? content : Buffer.from(content, 'utf-8'));
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
