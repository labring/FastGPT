/**
 * 沙盒业务层：为运行态 sandbox 准备包管理器镜像源。
 *
 * 负责根据实例配置写入 npm/pip/uv/apt 等镜像文件，不处理 Skill 包部署。
 */
import type { OpenSandboxClient } from '../../infrastructure/opensandbox/opensandbox';
import { isRecoverableSandboxError } from '../../infrastructure/opensandbox/errors';
import {
  OPEN_SANDBOX_CONTAINER_RUNTIME_DIR,
  OPEN_SANDBOX_DEFAULT_HOME_PATH,
  SANDBOX_INTERNAL_RUNTIME_DIR_NAME
} from '@fastgpt/global/core/ai/sandbox/constants';
import { z } from 'zod';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { getAgentSandboxCommonConfig } from '../../config';
import { buildRuntimeHash, joinSandboxPath } from '../../utils';
import {
  getRuntimeStateValue,
  readSandboxRuntimeState,
  setRuntimeStateValue,
  writeSandboxRuntimeState,
  type SandboxRuntimeStateScope
} from './state';
import { prepareSandboxFileParentDirectories } from '../file';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

const SANDBOX_MIRROR_STATE_HASH_KEYS = {
  npm: 'npmMirror',
  pypi: 'pypiMirror',
  apt: 'aptMirror'
} as const;
const APT_SOURCE_PATHS = {
  debian: '/etc/apt/sources.list.d/debian.sources',
  ubuntu: '/etc/apt/sources.list.d/ubuntu.sources'
} as const;
const SANDBOX_MIRROR_COPY_SUFFIX = '.copy';
const MirrorFileMarkerSchema = z.strictObject({
  version: z.literal(1),
  path: z.string(),
  origin: z.enum(['created', 'backup', 'legacyBackup']),
  /** 目标文件写入进行中；失败残留不能当作管理员编辑，必须保留恢复材料。 */
  pending: z.boolean().optional(),
  backupHash: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .optional(),
  hashes: z
    .array(z.string().regex(/^sha256:[a-f0-9]{64}$/))
    .min(1)
    .max(2)
});

type SandboxRuntimeMirrorGroup = 'npm' | 'pypi' | 'apt';
type SandboxAptDistribution = 'ubuntu' | 'debian';
type SandboxAptPlatform = {
  distribution: SandboxAptDistribution;
  codename: string;
};

type SandboxRuntimeMirrorFile = {
  path: string;
  data: string;
};

type SandboxRuntimeMirrorFiles = Record<SandboxRuntimeMirrorGroup, SandboxRuntimeMirrorFile[]>;

export type SandboxRuntimeMirrorsConfig = {
  npmRegistry?: string;
  pypiIndexUrl?: string;
  aptMirror?: string;
};

export const getSandboxRuntimeMirrorsConfig = (): SandboxRuntimeMirrorsConfig => {
  const common = getAgentSandboxCommonConfig();

  return {
    npmRegistry: common.npmRegistry,
    pypiIndexUrl: common.pypiIndexUrl,
    aptMirror: common.aptMirror
  };
};

/**
 * 按 npm / pypi / apt 三组独立同步沙盒镜像源配置：
 * - `npm` / `pypi` 目标位于 `$HOME` 持久卷，状态与标记跟随 `$HOME/.fastgpt/runtime/{state.json,mirrors}` 持久化；
 * - `apt` 目标位于 `/etc/apt` 容器临时层，状态与标记位于 `/var/lib/fastgpt-runtime/{state.json,mirrors}`，容器重建自动重写。
 */
export const prepareSandboxRuntimeMirrors = async ({
  sandbox,
  config = getSandboxRuntimeMirrorsConfig()
}: {
  sandbox: OpenSandboxClient;
  config?: SandboxRuntimeMirrorsConfig;
}): Promise<void> => {
  const normalizedConfig = normalizeMirrorsConfig(config);
  const homeDirectory = OPEN_SANDBOX_DEFAULT_HOME_PATH;

  // 状态文件按目标生命周期分域读取；任一域读取失败仅跳过该域，避免误判历史状态覆盖用户文件。
  const [homeStateContext, containerStateContext] = await Promise.all([
    readSandboxRuntimeState({ sandbox, scope: 'home' }),
    readSandboxRuntimeState({ sandbox, scope: 'container' })
  ]);
  const stateContexts = {
    home: homeStateContext,
    container: containerStateContext
  } as const;

  // 兼容旧版本已落盘的空字符串 hash，判定曾经是否启用镜像时将其视为未启用。
  const emptyMirrorHash = buildRuntimeHash('');
  const aptMirrorHash = normalizedConfig.aptMirror
    ? buildRuntimeHash(normalizedConfig.aptMirror)
    : '';
  const previousAptHash = getRuntimeStateValue(
    containerStateContext.state,
    SANDBOX_MIRROR_STATE_HASH_KEYS.apt
  );
  const aptNeedsPlatform = normalizedConfig.aptMirror
    ? previousAptHash !== aptMirrorHash
    : Boolean(previousAptHash) && previousAptHash !== emptyMirrorHash;
  const aptPlatform =
    !containerStateContext.readFailed && aptNeedsPlatform
      ? await resolveSandboxAptPlatform(sandbox)
      : undefined;

  const mirrorPaths = getSandboxRuntimeMirrorPaths(homeDirectory);
  const files = buildSandboxRuntimeMirrorFiles({
    config: normalizedConfig,
    paths: mirrorPaths,
    aptPlatform
  });

  const homeMarkerDir = joinSandboxPath(
    homeDirectory,
    SANDBOX_INTERNAL_RUNTIME_DIR_NAME,
    'runtime/mirrors'
  );
  const containerMarkerDir = joinSandboxPath(OPEN_SANDBOX_CONTAINER_RUNTIME_DIR, 'mirrors');
  const markerDirExistsCache = new Map<string, Promise<boolean>>();
  const hasMarkerDirectory = (markerDirectory: string) => {
    let cached = markerDirExistsCache.get(markerDirectory);
    if (!cached) {
      cached = sandbox
        .getFileInfo([markerDirectory])
        .then((dirInfo) => dirInfo.has(markerDirectory))
        .catch((error) => {
          if (isRecoverableSandboxError(error)) throw error;
          // 探测目录状态失败时不跳过同步，保留后续 synchronize 的兜底校验。
          return true;
        });
      markerDirExistsCache.set(markerDirectory, cached);
    }
    return cached;
  };

  const mirrorGroups: Array<{
    group: SandboxRuntimeMirrorGroup;
    stateScope: SandboxRuntimeStateScope;
    markerDirectory: string;
    stateKey: string;
    value?: string;
    managedPaths: readonly string[];
    files: SandboxRuntimeMirrorFile[];
  }> = [
    {
      group: 'npm',
      stateScope: 'home',
      markerDirectory: homeMarkerDir,
      stateKey: SANDBOX_MIRROR_STATE_HASH_KEYS.npm,
      value: normalizedConfig.npmRegistry,
      managedPaths: mirrorPaths.npm,
      files: files.npm
    },
    {
      group: 'pypi',
      stateScope: 'home',
      markerDirectory: homeMarkerDir,
      stateKey: SANDBOX_MIRROR_STATE_HASH_KEYS.pypi,
      value: normalizedConfig.pypiIndexUrl,
      managedPaths: mirrorPaths.pypi,
      files: files.pypi
    },
    {
      group: 'apt',
      stateScope: 'container',
      markerDirectory: containerMarkerDir,
      stateKey: SANDBOX_MIRROR_STATE_HASH_KEYS.apt,
      value: normalizedConfig.aptMirror,
      // 只处理当前发行版的源文件，不能误动另一发行版的用户文件。
      managedPaths: aptPlatform ? [APT_SOURCE_PATHS[aptPlatform.distribution]] : mirrorPaths.apt,
      files: files.apt
    }
  ];

  const dirtyScopes = new Set<SandboxRuntimeStateScope>();
  for (const mirrorGroup of mirrorGroups) {
    const stateContext = stateContexts[mirrorGroup.stateScope];
    if (stateContext.readFailed) {
      continue;
    }
    const targetHash = mirrorGroup.value ? buildRuntimeHash(mirrorGroup.value) : '';
    const previousHash = getRuntimeStateValue(stateContext.state, mirrorGroup.stateKey);
    if (mirrorGroup.value && previousHash === targetHash) {
      continue;
    }
    // 未配置镜像且无历史状态时，若连 marker 目录都不存在说明从无托管残留，直接跳过扫描以消除无谓 RPC；
    // 旧版若已写入 emptyMirrorHash，仍执行一次清理以摘除遗留空键。
    if (!mirrorGroup.value && !previousHash) {
      if (!(await hasMarkerDirectory(mirrorGroup.markerDirectory))) {
        continue;
      }
    }

    // APT 无法识别发行版时只跳过 APT，保留旧状态让下一次调用继续重试。
    if (mirrorGroup.group === 'apt' && aptNeedsPlatform && !aptPlatform) {
      continue;
    }

    const synchronized = await new SandboxRuntimeMirrorFileManager(
      mirrorGroup.managedPaths,
      mirrorGroup.markerDirectory
    ).synchronize({
      sandbox,
      files: mirrorGroup.files,
      previouslyActive: Boolean(previousHash) && previousHash !== emptyMirrorHash,
      legacyActivePaths:
        mirrorGroup.group === 'apt' && aptPlatform
          ? [APT_SOURCE_PATHS[aptPlatform.distribution]]
          : mirrorGroup.managedPaths
    });
    if (!synchronized) {
      logger.warn('[Sandbox Runtime] Mirror files not synchronized; will retry', {
        group: mirrorGroup.group
      });
      continue;
    }

    if (previousHash !== targetHash) {
      setRuntimeStateValue({
        state: stateContext.state,
        key: mirrorGroup.stateKey,
        value: targetHash
      });
      dirtyScopes.add(mirrorGroup.stateScope);
    }
  }

  for (const dirtyScope of dirtyScopes) {
    await writeSandboxRuntimeState({
      sandbox,
      context: stateContexts[dirtyScope],
      scope: dirtyScope
    });
  }
};

/** 读取发行版信息，用于生成对应的 APT source 文件。 */
const resolveSandboxAptPlatform = async (
  sandbox: OpenSandboxClient
): Promise<SandboxAptPlatform | undefined> => {
  const [osRelease] = await sandbox.readFiles(['/etc/os-release']).catch((error) => {
    if (isRecoverableSandboxError(error)) throw error;
    logger.warn('[Sandbox Runtime] Failed to read sandbox OS release', { error });
    return [];
  });
  if (osRelease?.error && isRecoverableSandboxError(osRelease.error)) {
    throw osRelease.error;
  }
  if (!osRelease || osRelease.error) {
    logger.warn('[Sandbox Runtime] Cannot configure apt mirror; official sources remain active', {
      error: osRelease?.error
    });
    return undefined;
  }

  const content = Buffer.from(osRelease.content).toString('utf-8');
  const readField = (key: string) =>
    content
      .split('\n')
      .find((line) => line.startsWith(`${key}=`))
      ?.slice(key.length + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2') || undefined;
  const osId = readField('ID');
  const codename = readField('UBUNTU_CODENAME') ?? readField('VERSION_CODENAME');
  if ((osId !== 'ubuntu' && osId !== 'debian') || !codename) {
    logger.warn('[Sandbox Runtime] Cannot configure apt mirror for an unsupported sandbox', {
      osId,
      codename
    });
    return undefined;
  }

  return { distribution: osId, codename };
};

/** 统一清理镜像配置，空值不生成对应的运行时文件。 */
const normalizeMirrorsConfig = (config: SandboxRuntimeMirrorsConfig): SandboxRuntimeMirrorsConfig =>
  Object.fromEntries(
    Object.entries(config).flatMap(([key, value]) => {
      const trimmed = value?.trim();
      return trimmed ? [[key, trimmed]] : [];
    })
  );

const getSandboxRuntimeMirrorPaths = (homeDirectory: string) => ({
  npm: [
    joinSandboxPath(homeDirectory, '.npmrc'),
    joinSandboxPath(homeDirectory, '.yarnrc'),
    joinSandboxPath(homeDirectory, '.yarnrc.yml'),
    joinSandboxPath(homeDirectory, '.bunfig.toml')
  ],
  pypi: [
    joinSandboxPath(homeDirectory, '.pip/pip.conf'),
    joinSandboxPath(homeDirectory, '.config/pip/pip.conf'),
    joinSandboxPath(homeDirectory, '.config/uv/uv.toml')
  ],
  apt: Object.values(APT_SOURCE_PATHS)
});

const rethrowRecoverableResultError = (results?: Array<{ error?: unknown | null }>) => {
  const recoverable = results?.find(
    ({ error }) => error && isRecoverableSandboxError(error)
  )?.error;
  if (recoverable) throw recoverable;
};

/** 统一处理镜像文件的备份、写入和配置清空后的恢复。 */
class SandboxRuntimeMirrorFileManager {
  constructor(
    private readonly managedPaths: readonly string[],
    private readonly markerDirectory: string
  ) {}

  /**
   * 先保存备份和来源标记，再覆盖目标。清空时只删除有标记且内容仍匹配的自建文件；
   * 未知来源的旧文件保留，并让调用方继续重试而不是把清空状态记为成功。
   */
  async synchronize({
    sandbox,
    files,
    previouslyActive,
    legacyActivePaths
  }: {
    sandbox: OpenSandboxClient;
    files: SandboxRuntimeMirrorFile[];
    previouslyActive: boolean;
    legacyActivePaths: readonly string[];
  }): Promise<boolean> {
    const paths = this.managedPaths.flatMap((path) => [
      path,
      this.getCopyPath(path),
      this.getMarkerPath(path),
      this.getBackupPath(path)
    ]);
    // readFiles 的 error 不区分缺失与权限/传输错误；只有 stat 明确缺失才能视作不存在。
    const info = await sandbox.getFileInfo(paths).catch((error) => {
      if (isRecoverableSandboxError(error)) throw error;
      logger.warn('[Sandbox Runtime] Failed to inspect mirror config files', { error });
      return undefined;
    });
    if (!info || [...info.values()].some((item) => item.isDirectory || item.isSymlink)) {
      return false;
    }

    const existingPaths = paths.filter((path) => info.has(path));
    const readResults =
      existingPaths.length === 0
        ? []
        : await sandbox.readFiles(existingPaths).catch((error) => {
            if (isRecoverableSandboxError(error)) throw error;
            return undefined;
          });
    rethrowRecoverableResultError(readResults);
    if (
      !readResults ||
      readResults.length !== existingPaths.length ||
      readResults.some((result, index) => result.error || result.path !== existingPaths[index])
    ) {
      return false;
    }
    const contents = new Map(readResults.map(({ path, content }) => [path, content]));

    const markers = new Map<string, z.infer<typeof MirrorFileMarkerSchema>>();
    for (const path of this.managedPaths) {
      const raw = contents.get(this.getMarkerPath(path));
      if (!raw) continue;
      try {
        const marker = MirrorFileMarkerSchema.parse(JSON.parse(Buffer.from(raw).toString('utf8')));
        if (marker.path !== path) return false;
        markers.set(path, marker);
      } catch {
        // 无法证明来源的标记或文件均不能覆盖或删除。
        return false;
      }
    }

    const write = async (entries: Array<{ path: string; data: string | Uint8Array }>) => {
      if (entries.length === 0) return true;
      const results = await prepareSandboxFileParentDirectories(
        sandbox,
        entries.map(({ path }) => path)
      )
        .then(() => sandbox.writeFiles(entries))
        .catch((error) => {
          if (isRecoverableSandboxError(error)) throw error;
          return undefined;
        });
      rethrowRecoverableResultError(results);
      return Boolean(
        results &&
        results.length === entries.length &&
        results.every((result, index) => !result.error && result.path === entries[index].path)
      );
    };
    const remove = async (pathsToRemove: string[]) => {
      if (pathsToRemove.length === 0) return true;
      const results = await sandbox.deleteFiles(pathsToRemove).catch((error) => {
        if (isRecoverableSandboxError(error)) throw error;
        return undefined;
      });
      rethrowRecoverableResultError(results);
      return Boolean(
        results &&
        results.length === pathsToRemove.length &&
        results.every(
          (result, index) => result.success && !result.error && result.path === pathsToRemove[index]
        )
      );
    };
    if (files.length > 0) {
      const backups: Array<{ path: string; data: Uint8Array }> = [];
      const markerWrites: Array<{ path: string; payload: Record<string, unknown> }> = [];
      for (const file of files) {
        const copyPath = this.getCopyPath(file.path);
        const backupPath = this.getBackupPath(file.path);
        const content = contents.get(file.path);
        const marker = markers.get(file.path);
        const copy = contents.get(copyPath);
        const backup = contents.get(backupPath);
        if (
          marker?.origin === 'backup' &&
          !backup &&
          (!content || !marker.backupHash || buildRuntimeHash(content) !== marker.backupHash)
        ) {
          return false;
        }
        if (marker?.origin === 'legacyBackup' && !copy) return false;

        // pending 表示上次目标写入未完成，残片不是用户编辑；按原 marker 的 origin/备份续作，
        // 不能把失败残片提升为新备份或用户原文。
        const writePending = marker?.pending === true;
        // 自建文件被用户修改后，先把修改作为新的原始文件备份。
        const userFile =
          !writePending &&
          content &&
          (!marker || !marker.hashes.includes(buildRuntimeHash(content)));
        const legacyBackup =
          !marker && previouslyActive && legacyActivePaths.includes(file.path) && copy;
        // 用户更改了受管的已有文件时不覆盖其编辑；先等待清空阶段保留编辑内容。
        if (
          !writePending &&
          userFile &&
          (marker?.origin === 'backup' || marker?.origin === 'legacyBackup') &&
          (!marker.backupHash || buildRuntimeHash(content) !== marker.backupHash)
        ) {
          return false;
        }
        if (
          marker?.origin === 'backup' &&
          backup &&
          (!marker.backupHash || buildRuntimeHash(backup) !== marker.backupHash)
        ) {
          return false;
        }
        if (
          marker?.origin === 'legacyBackup' &&
          copy &&
          (!marker.backupHash || buildRuntimeHash(copy) !== marker.backupHash)
        ) {
          return false;
        }
        const contentHash = content ? buildRuntimeHash(content) : undefined;
        // 上次 marker 已落库但备份写入失败：目标仍是原始内容时，重试必须先补备份。
        const retryMissingBackup =
          writePending &&
          marker?.origin === 'backup' &&
          !backup &&
          contentHash === marker.backupHash;
        const needsBackup =
          (userFile || retryMissingBackup) &&
          !legacyBackup &&
          marker?.origin !== 'legacyBackup' &&
          (marker?.origin !== 'backup' || !backup);
        const backupContent = needsBackup ? content : undefined;
        if (needsBackup) {
          // 不覆盖未知来源的同名备份；失败后的遗留文件须保守处理。
          if (backup || !backupContent) return false;
          backups.push({ path: backupPath, data: backupContent });
        }
        const origin = legacyBackup
          ? 'legacyBackup'
          : needsBackup
            ? 'backup'
            : (marker?.origin ?? 'created');
        const backupHash = backupContent
          ? buildRuntimeHash(backupContent)
          : (marker?.backupHash ?? (legacyBackup ? buildRuntimeHash(legacyBackup) : undefined));
        const currentHash =
          content && marker?.hashes.includes(buildRuntimeHash(content))
            ? buildRuntimeHash(content)
            : undefined;
        const nextHash = buildRuntimeHash(file.data);
        const hashes = writePending
          ? // 重试时保留一个旧的受管 hash，避免残片/中间配置膨胀 marker；新目标始终写入。
            [...new Set([...(marker?.hashes ?? []).slice(0, 1), nextHash])]
          : [...new Set([currentHash, nextHash].filter((hash): hash is string => Boolean(hash)))];
        markerWrites.push({
          path: this.getMarkerPath(file.path),
          payload: { version: 1, path: file.path, origin, hashes, backupHash }
        });
      }
      const writeMarkers = (pending: boolean) =>
        write(
          markerWrites.map(({ path, payload }) => ({
            path,
            data: JSON.stringify({ ...payload, ...(pending ? { pending: true } : {}) })
          }))
        );
      // 先记录来源和写入中标记，再落备份，最后覆盖目标；成功后才清除 pending。
      // provider 写入失败可能留下部分内容，pending 让清理阶段保留备份而不是误判为用户编辑。
      return (
        (await writeMarkers(true)) &&
        (await write(backups)) &&
        (await write(files)) &&
        (await writeMarkers(false))
      );
    }

    const restores: Array<{ path: string; data: Uint8Array }> = [];
    const generatedFiles: string[] = [];
    const backupsToRemove: string[] = [];
    const markersToRemove: string[] = [];
    let unknownLegacyFile = false;
    for (const path of this.managedPaths) {
      const marker = markers.get(path);
      const content = contents.get(path);
      const copy = contents.get(this.getCopyPath(path));
      const backup = contents.get(this.getBackupPath(path));
      if (marker?.origin === 'backup' || marker?.origin === 'legacyBackup') {
        const original = marker.origin === 'backup' ? backup : copy;
        if (!marker.backupHash) return false;
        // 上次目标写入未完成：只要有可校验的原始备份，清空时直接恢复它并收尾，
        // 不把失败残留误判为用户编辑；目标仍等于原件（如非 root EACCES 未改写）则跳过写目标。
        if (marker.pending) {
          if (original && marker.backupHash && buildRuntimeHash(original) === marker.backupHash) {
            if (!content || buildRuntimeHash(content) !== marker.backupHash) {
              restores.push({ path, data: original });
            }
            if (marker.origin === 'backup') backupsToRemove.push(this.getBackupPath(path));
            markersToRemove.push(this.getMarkerPath(path));
            continue;
          }
          const contentHash = content ? buildRuntimeHash(content) : undefined;
          const isManagedOrRestored =
            !contentHash ||
            marker.hashes.includes(contentHash) ||
            contentHash === marker.backupHash;
          if (!isManagedOrRestored) return false;
        }
        // 上次可能已恢复并删除备份、但删除标记失败；校验恢复内容后即可继续收尾。
        if (!original) {
          if (!content || buildRuntimeHash(content) !== marker.backupHash) return false;
        } else if (buildRuntimeHash(original) !== marker.backupHash) {
          // 原文件尚未覆盖时允许移除不完整备份；后续重试不再接触用户内容。
          if (!content || buildRuntimeHash(content) !== marker.backupHash) return false;
          if (marker.origin === 'backup') backupsToRemove.push(this.getBackupPath(path));
          markersToRemove.push(this.getMarkerPath(path));
          continue;
        }
        // 只恢复被本功能覆盖的内容；管理员或用户中途改写后应保留现有文件。
        if (original && (!content || marker.hashes.includes(buildRuntimeHash(content)))) {
          restores.push({ path, data: original });
        }
        if (marker.origin === 'backup' && original) backupsToRemove.push(this.getBackupPath(path));
      } else if (copy && !marker && previouslyActive && legacyActivePaths.includes(path)) {
        restores.push({ path, data: copy });
      } else if (marker?.origin === 'created' && marker.pending) {
        // pending 自建文件可能是部分写入残片，也可能已被用户改写；无法证明归属时
        // 保留 marker 并让清空失败，避免删除证据后错误记录空 hash。
        if (!content) {
          markersToRemove.push(this.getMarkerPath(path));
          continue;
        }
        if (!marker.hashes.includes(buildRuntimeHash(content))) return false;
        generatedFiles.push(path);
      } else if (
        marker?.origin === 'created' &&
        content &&
        marker.hashes.includes(buildRuntimeHash(content))
      ) {
        generatedFiles.push(path);
      } else if (
        !marker &&
        !copy &&
        content &&
        previouslyActive &&
        legacyActivePaths.includes(path)
      ) {
        // 旧版没有来源标记，无法安全判断是否由 FastGPT 创建。
        unknownLegacyFile = true;
      }
      if (marker) markersToRemove.push(this.getMarkerPath(path));
    }

    // 已恢复的备份和已删除的文件可重试；任何一步失败都保留该组旧 hash。
    if (
      !(await write(restores)) ||
      !(await remove(generatedFiles)) ||
      !(await remove(backupsToRemove)) ||
      !(await remove(markersToRemove))
    ) {
      return false;
    }
    return !unknownLegacyFile;
  }

  private getCopyPath(path: string): string {
    return `${path}${SANDBOX_MIRROR_COPY_SUFFIX}`;
  }

  private getMarkerPath(path: string): string {
    return joinSandboxPath(this.markerDirectory, `${buildRuntimeHash(path).slice(7)}.json`);
  }

  private getBackupPath(path: string): string {
    return joinSandboxPath(this.markerDirectory, `${buildRuntimeHash(path).slice(7)}.backup`);
  }
}

const buildSandboxRuntimeMirrorFiles = ({
  config,
  paths,
  aptPlatform
}: {
  config: SandboxRuntimeMirrorsConfig;
  paths: ReturnType<typeof getSandboxRuntimeMirrorPaths>;
  aptPlatform?: SandboxAptPlatform;
}): SandboxRuntimeMirrorFiles => {
  const files: SandboxRuntimeMirrorFiles = {
    npm: [],
    pypi: [],
    apt: []
  };

  if (config.npmRegistry) {
    files.npm.push(
      {
        path: paths.npm[0],
        data: `registry=${config.npmRegistry}\n`
      },
      {
        path: paths.npm[1],
        data: `registry "${config.npmRegistry}"\n`
      },
      {
        path: paths.npm[2],
        data: `npmRegistryServer: "${escapeQuotedString(config.npmRegistry)}"\n`
      },
      {
        path: paths.npm[3],
        data: `[install]\nregistry = "${escapeQuotedString(config.npmRegistry)}"\n`
      }
    );
  }

  let pypiTrustedHost: string | undefined;
  if (config.pypiIndexUrl) {
    try {
      pypiTrustedHost = new URL(config.pypiIndexUrl).host || undefined;
    } catch {
      pypiTrustedHost = undefined;
    }
  }
  const pipConfig = [
    '[global]',
    ...(config.pypiIndexUrl ? [`index-url = ${config.pypiIndexUrl}`] : []),
    ...(pypiTrustedHost ? [`trusted-host = ${pypiTrustedHost}`] : [])
  ];
  if (pipConfig.length > 1) {
    const data = `${pipConfig.join('\n')}\n`;
    files.pypi.push(
      { path: paths.pypi[0], data },
      { path: paths.pypi[1], data },
      {
        path: paths.pypi[2],
        data: `${[
          `default-index = "${escapeQuotedString(config.pypiIndexUrl!)}"`,
          ...(pypiTrustedHost
            ? [`allow-insecure-host = ["${escapeQuotedString(pypiTrustedHost)}"]`]
            : [])
        ].join('\n')}\n`
      }
    );
  }

  if (config.aptMirror && aptPlatform) {
    files.apt.push({
      path: APT_SOURCE_PATHS[aptPlatform.distribution],
      data: buildAptSourceContent({ platform: aptPlatform, aptMirror: config.aptMirror })
    });
  }

  return files;
};

const buildAptSourceContent = ({
  platform,
  aptMirror
}: {
  platform: SandboxAptPlatform;
  aptMirror: string;
}): string => {
  if (platform.distribution === 'debian') {
    return [
      'Types: deb',
      `URIs: ${aptMirror}`,
      `Suites: ${platform.codename} ${platform.codename}-updates`,
      'Components: main',
      'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg',
      '',
      'Types: deb',
      `URIs: ${resolveDebianSecurityMirror(aptMirror)}`,
      `Suites: ${platform.codename}-security`,
      'Components: main',
      'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg',
      ''
    ].join('\n');
  }

  return [
    'Types: deb',
    `URIs: ${aptMirror}`,
    `Suites: ${platform.codename} ${platform.codename}-updates ${platform.codename}-backports`,
    'Components: main universe restricted multiverse',
    'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg',
    '',
    'Types: deb',
    `URIs: ${aptMirror}`,
    `Suites: ${platform.codename}-security`,
    'Components: main universe restricted multiverse',
    'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg',
    ''
  ].join('\n');
};

const resolveDebianSecurityMirror = (aptMirror: string): string => {
  try {
    const mirrorUrl = new URL(aptMirror);
    const mirrorPath = mirrorUrl.pathname.replace(/\/+$/, '');
    if (mirrorPath.endsWith('/debian')) {
      mirrorUrl.pathname = `${mirrorPath.slice(0, -'/debian'.length)}/debian-security`;
      return mirrorUrl.toString();
    }
  } catch {
    // 保留原配置，让 apt 在执行时报告无效地址。
  }
  return aptMirror;
};

const escapeQuotedString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
