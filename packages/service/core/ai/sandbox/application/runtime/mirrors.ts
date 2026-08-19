/**
 * 沙盒业务层：为运行态 sandbox 准备包管理器镜像源。
 *
 * 负责根据环境配置写入 npm/pip/uv/apt 等镜像文件，不处理 Skill 包部署。
 */
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { serviceEnv } from '../../../../../env';
import { buildRuntimeHash, joinSandboxPath } from '../../utils';
import {
  getRuntimeStateValue,
  readSandboxRuntimeState,
  setRuntimeStateValue,
  writeSandboxRuntimeState
} from './state';
import { resolveSandboxHome } from './home';
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

export const getSandboxRuntimeMirrorsConfig = (): SandboxRuntimeMirrorsConfig => ({
  npmRegistry: serviceEnv.AGENT_SANDBOX_NPM_REGISTRY,
  pypiIndexUrl: serviceEnv.AGENT_SANDBOX_PYPI_INDEX_URL,
  aptMirror: serviceEnv.AGENT_SANDBOX_APT_MIRROR
});

export const prepareSandboxRuntimeMirrors = async ({
  sandbox,
  config = getSandboxRuntimeMirrorsConfig()
}: {
  sandbox: ISandbox;
  config?: SandboxRuntimeMirrorsConfig;
}): Promise<void> => {
  const normalizedConfig = normalizeMirrorsConfig(config);
  const homeDirectory = await resolveSandboxHome(sandbox);
  if (!homeDirectory) return;

  const stateContext = await readSandboxRuntimeState({ sandbox, homeDirectory });
  if (!stateContext.statePath) return;

  const aptMirrorHash = buildRuntimeHash(normalizedConfig.aptMirror ?? '');
  const aptMirrorSynchronized =
    getRuntimeStateValue(stateContext.state, SANDBOX_MIRROR_STATE_HASH_KEYS.apt) === aptMirrorHash;
  const aptPlatform =
    normalizedConfig.aptMirror && !aptMirrorSynchronized
      ? await resolveSandboxAptPlatform(sandbox)
      : undefined;

  const mirrorPaths = getSandboxRuntimeMirrorPaths(homeDirectory);
  const files = buildSandboxRuntimeMirrorFiles({
    config: normalizedConfig,
    paths: mirrorPaths,
    aptPlatform
  });

  const mirrorGroups: Array<{
    group: SandboxRuntimeMirrorGroup;
    stateKey: string;
    value?: string;
    managedPaths: readonly string[];
    files: SandboxRuntimeMirrorFile[];
  }> = [
    {
      group: 'npm',
      stateKey: SANDBOX_MIRROR_STATE_HASH_KEYS.npm,
      value: normalizedConfig.npmRegistry,
      managedPaths: mirrorPaths.npm,
      files: files.npm
    },
    {
      group: 'pypi',
      stateKey: SANDBOX_MIRROR_STATE_HASH_KEYS.pypi,
      value: normalizedConfig.pypiIndexUrl,
      managedPaths: mirrorPaths.pypi,
      files: files.pypi
    },
    {
      group: 'apt',
      stateKey: SANDBOX_MIRROR_STATE_HASH_KEYS.apt,
      value: normalizedConfig.aptMirror,
      managedPaths: mirrorPaths.apt,
      files: files.apt
    }
  ];

  let stateDirty = false;
  for (const mirrorGroup of mirrorGroups) {
    const configHash = buildRuntimeHash(mirrorGroup.value ?? '');
    if (getRuntimeStateValue(stateContext.state, mirrorGroup.stateKey) === configHash) {
      continue;
    }

    // APT 无法识别发行版时只跳过 APT，保留旧状态让下一次调用继续重试。
    if (mirrorGroup.group === 'apt' && mirrorGroup.value && !aptPlatform) continue;

    const synchronized = await new SandboxRuntimeMirrorFileManager(
      mirrorGroup.managedPaths
    ).synchronize({
      sandbox,
      files: mirrorGroup.files
    });
    if (!synchronized) continue;

    setRuntimeStateValue(stateContext.state, mirrorGroup.stateKey, configHash);
    stateDirty = true;
  }

  if (stateDirty) await writeSandboxRuntimeState(sandbox, stateContext);
};

/** 读取发行版信息，用于生成对应的 APT source 文件。 */
const resolveSandboxAptPlatform = async (
  sandbox: ISandbox
): Promise<SandboxAptPlatform | undefined> => {
  const [osRelease] = await sandbox.readFiles(['/etc/os-release']).catch((error) => {
    logger.warn('[Sandbox Runtime] Failed to read sandbox OS release', { error });
    return [];
  });
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

/** 统一处理镜像文件的备份、写入和环境变量删除后的恢复。 */
class SandboxRuntimeMirrorFileManager {
  constructor(private readonly managedPaths: readonly string[]) {}

  /**
   * 配置变化时先读取目标文件和备份文件；目标存在且没有备份时只备份一次，
   * 配置未生成目标文件时则恢复已有备份，没有备份的文件保持不变。
   */
  async synchronize({
    sandbox,
    files
  }: {
    sandbox: ISandbox;
    files: SandboxRuntimeMirrorFile[];
  }): Promise<boolean> {
    const activePaths = new Set(files.map(({ path }) => path));
    const restorePaths = this.managedPaths.filter((path) => !activePaths.has(path));
    const readPaths = Array.from(
      new Set([
        ...files.map(({ path }) => path),
        ...this.managedPaths.map((path) => this.getCopyPath(path))
      ])
    );
    const readResults = await sandbox.readFiles(readPaths).catch((error) => {
      logger.warn('[Sandbox Runtime] Failed to read mirror config files', { error });
      return undefined;
    });
    if (!readResults) return false;

    const contents = new Map(
      readResults
        .filter(({ error }) => !error)
        .map(({ path, content }) => [path, Buffer.from(content).toString('utf-8')])
    );
    const backupFiles = files.flatMap(({ path }) => {
      const copyPath = this.getCopyPath(path);
      if (contents.has(copyPath) || !contents.has(path)) return [];
      return [{ path: copyPath, data: contents.get(path)! }];
    });
    const restoreFiles = restorePaths.flatMap((path) => {
      const copyPath = this.getCopyPath(path);
      return contents.has(copyPath) ? [{ path, data: contents.get(copyPath)! }] : [];
    });
    const writes = [...backupFiles, ...files, ...restoreFiles];
    if (writes.length === 0) return true;

    const writeResults = await prepareSandboxFileParentDirectories(
      sandbox,
      writes.map(({ path }) => path)
    )
      .then(() => sandbox.writeFiles(writes))
      .catch((error) => {
        logger.warn('[Sandbox Runtime] Failed to write mirror config files', { error });
        return undefined;
      });
    const failedWrite = writeResults?.find((result) => result.error);
    if (!writeResults || failedWrite) {
      logger.warn('[Sandbox Runtime] Failed to write mirror config files', {
        path: failedWrite?.path,
        error: failedWrite?.error
      });
      return false;
    }
    return true;
  }

  private getCopyPath(path: string): string {
    return `${path}${SANDBOX_MIRROR_COPY_SUFFIX}`;
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
        data: `npmRegistryServer: "${escapeYamlString(config.npmRegistry)}"\n`
      },
      {
        path: paths.npm[3],
        data: `[install]\nregistry = "${escapeTomlString(config.npmRegistry)}"\n`
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
          `default-index = "${escapeTomlString(config.pypiIndexUrl!)}"`,
          ...(pypiTrustedHost
            ? [`allow-insecure-host = ["${escapeTomlString(pypiTrustedHost)}"]`]
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

const escapeTomlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const escapeYamlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
