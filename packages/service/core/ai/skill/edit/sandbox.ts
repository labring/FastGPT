import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { MongoAgentSkills } from '../model/schema';
import { MongoAgentSkillsVersion } from '../version/schema';
import { downloadSkillPackage } from '../package';
import { getSkillSizeLimits } from '../sandbox/config';
import {
  EDIT_DEBUG_SANDBOX_CHAT_ID,
  getEditDebugSandboxId,
  buildEditDebugCreateConfig
} from './config';
import { getSandboxProviderConfig, validateSandboxConfig } from '../../sandbox/provider/config';
import { getSandboxDefaults } from '../../sandbox/runtime/config';
import type { SandboxImageConfigType } from '@fastgpt/global/core/ai/skill/type';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  connectReadySandboxByInstance,
  connectToSandbox,
  disconnectSandbox,
  getReadySandboxInfo
} from '../../sandbox/provider/lifecycle';
import type { SandboxClient } from '../../sandbox/service/runtime';
import { getSandboxClient } from '../../sandbox/service/runtime';
import { deleteSandboxResource } from '../../sandbox/service/resource';
import {
  countRunningSandboxInstancesByType,
  deleteSandboxInstanceRecord,
  findSandboxInstanceByAppChatType,
  findSandboxResourcesByAppChatTypeExcludeProvider,
  updateSandboxInstanceRecordBySandboxId
} from '../../sandbox/instance/repository';
import { getLogger, LogCategories } from '../../../../common/logger';
import { serviceEnv } from '../../../../env';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';
import { getSkillsRootPath, joinSandboxPath, shellQuote } from '../runtime';
import { checkTeamSandboxPermission } from '../../../../support/permission/teamLimit';

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
  status: {
    state: string;
    message?: string;
  };
};

/**
 * 创建或复用一个 skill 编辑态 sandbox。
 *
 * 该流程只服务 edit-debug：下载当前版本包，标准化目录结构，写入并解压到
 * sandbox 工作目录下的 `skills`，最后返回 code-server endpoint。普通 agent session
 * 的 skill 注入逻辑仍由 runtime/useSandbox 负责，避免编辑态和运行态生命周期互相污染。
 */
export async function createEditDebugSandbox(
  params: CreateEditDebugSandboxParams
): Promise<CreateEditDebugSandboxResult> {
  const { skillId, teamId, tmbId, image, entrypoint, onProgress } = params;

  try {
    await checkTeamSandboxPermission(teamId);
  } catch (err) {
    throw new Error('当前应用未配置虚拟机，暂时无法使用相关功能，请联系管理员配置。');
  }

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
  const ensureEditSkillDirectory = async (sandbox: ISandbox) => {
    const { skillsRootPath } = getEditSkillSandboxPaths();
    const relativeSkillsRootPath = getSkillsRootPath('.');
    const migrateResult = await sandbox.execute(
      [
        `mkdir -p ${shellQuote(skillsRootPath)}`,
        [
          `canonical_entry_count=$(find ${shellQuote(
            skillsRootPath
          )} -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ');`,
          `if [ "$canonical_entry_count" = "0" ] && [ -d ${shellQuote(
            relativeSkillsRootPath
          )} ] && [ ${shellQuote(relativeSkillsRootPath)} != ${shellQuote(skillsRootPath)} ]; then`,
          `find ${shellQuote(
            relativeSkillsRootPath
          )} -mindepth 1 -maxdepth 1 -exec mv {} ${shellQuote(`${skillsRootPath}/`)} \\; ;`,
          'fi'
        ].join(' '),
        [
          `legacy_edit_dir=$(find ${shellQuote(
            skillsRootPath
          )} -mindepth 1 -maxdepth 1 -type d -name ${shellQuote(`*-${skillId}-edit`)} | head -n 1);`,
          `if [ -n "$legacy_edit_dir" ]; then`,
          `find "$legacy_edit_dir" -mindepth 1 -maxdepth 1 -exec mv {} ${shellQuote(
            `${skillsRootPath}/`
          )} \\; &&`,
          `rm -rf "$legacy_edit_dir";`,
          'fi'
        ].join(' '),
        [
          `root_skill_md_path=$(find ${shellQuote(
            skillsRootPath
          )} -maxdepth 1 -iname "SKILL.md" | head -n 1);`,
          `if [ -n "$root_skill_md_path" ]; then`,
          `frontmatter_name=$(awk 'BEGIN{in_fm=0} /^---[[:space:]]*$/ { if (in_fm == 0) { in_fm=1; next } else { exit } } in_fm == 1 && /^name:[[:space:]]*/ { sub(/^name:[[:space:]]*/, ""); gsub(/^["'\\'' ]+|["'\\'' ]+$/, ""); print; exit }' "$root_skill_md_path");`,
          `if [ -n "$frontmatter_name" ]; then`,
          `target_dir=${shellQuote(skillsRootPath)}/$frontmatter_name;`,
          `mkdir -p "$target_dir" &&`,
          `find ${shellQuote(
            skillsRootPath
          )} -mindepth 1 -maxdepth 1 ! -name "$frontmatter_name" -exec mv {} "$target_dir/" \\; ;`,
          `fi;`,
          `fi`
        ].join(' '),
        [
          `single_dir=$(find ${shellQuote(
            skillsRootPath
          )} -mindepth 1 -maxdepth 1 -type d | head -n 1);`,
          `single_dir_count=$(find ${shellQuote(
            skillsRootPath
          )} -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ');`,
          `if [ "$single_dir_count" = "1" ]; then`,
          `skill_md_path=$(find "$single_dir" -maxdepth 1 -iname "SKILL.md" | head -n 1);`,
          `if [ -n "$skill_md_path" ]; then`,
          `frontmatter_name=$(awk 'BEGIN{in_fm=0} /^---[[:space:]]*$/ { if (in_fm == 0) { in_fm=1; next } else { exit } } in_fm == 1 && /^name:[[:space:]]*/ { sub(/^name:[[:space:]]*/, ""); gsub(/^["'\\'' ]+|["'\\'' ]+$/, ""); print; exit }' "$skill_md_path");`,
          `if [ -n "$frontmatter_name" ]; then`,
          `target_dir=${shellQuote(skillsRootPath)}/$frontmatter_name;`,
          `if [ "$single_dir" != "$target_dir" ] && [ ! -e "$target_dir" ]; then mv "$single_dir" "$target_dir"; fi;`,
          `fi;`,
          `fi;`,
          `fi`
        ].join(' ')
      ].join('; ')
    );

    if (migrateResult.exitCode !== 0) {
      throw new Error(`Failed to prepare edit skill directory: ${migrateResult.stderr}`);
    }
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
      await ensureEditSkillDirectory(sandbox);

      const existingMetadata = instance.metadata || {};
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
      addLog.info('[Sandbox] Existing sandbox is unavailable, recreating edit-debug sandbox', {
        sandboxId: instance.sandboxId,
        error
      });

      try {
        await deleteSandboxResource(instance);
      } catch (deleteError) {
        addLog.error('[Sandbox] Failed to delete unavailable sandbox resource', {
          sandboxId: instance.sandboxId,
          error: deleteError
        });
        await deleteSandboxInstanceRecord(instance._id);
      }
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
        await deleteSandboxResource(instance).catch((error) => {
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
      storageKey: currentVersion.storageKey
    });

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
        data: packageBuffer
      }
    ]);

    onProgress?.({ sandboxId: sessionId, phase: 'extractingPackage' });
    const extractResult = await client.provider.execute(
      [
        `rm -rf ${shellQuote(skillsRootPath)}`,
        `mkdir -p ${shellQuote(skillsRootPath)}`,
        `unzip -o ${shellQuote(zipPath)} -d ${shellQuote(skillsRootPath)}`,
        `rm ${shellQuote(zipPath)}`
      ].join(' && ')
    );

    if (extractResult.exitCode !== 0) {
      throw new Error(`Failed to extract package: ${extractResult.stderr}`);
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
        provider: providerConfig.provider,
        image: sandboxInfo.image,
        providerCreatedAt: sandboxInfo.createdAt,
        storage: {
          key: currentVersion.storageKey,
          uploadedAt: new Date()
        },
        metadata: new Map([
          ['skillName', skill.name],
          ['versionId', currentVersion._id.toString()]
        ])
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
