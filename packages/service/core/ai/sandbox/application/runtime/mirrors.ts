/**
 * 沙盒业务层：为运行态 sandbox 准备包管理器镜像源。
 *
 * 负责根据环境配置写入 npm/pip/uv/apt 等镜像文件，不处理 Skill 包部署。
 */
import type { FileWriteEntry, ISandbox } from '@fastgpt-sdk/sandbox-adapter';
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

const SANDBOX_MIRRORS_STATE_HASH_KEY = 'sandboxPackageMirrors';
const APT_MIRROR_SOURCE_PATH = '/etc/apt/sources.list.d/00-fastgpt-mirror.sources';
type SandboxAptDistribution = 'ubuntu' | 'debian';

type SandboxAptPlatform = {
  distribution: SandboxAptDistribution;
  codename: string;
};

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
  if (Object.keys(normalizedConfig).length === 0) return;

  const { aptMirror } = normalizedConfig;
  const aptPlatform = aptMirror ? await resolveSandboxAptPlatform(sandbox) : undefined;

  const homeDirectory = await resolveSandboxHome(sandbox);
  if (!homeDirectory) return;

  const stateContext = await readSandboxRuntimeState({ sandbox, homeDirectory });
  if (!stateContext.statePath) return;

  const files = buildSandboxRuntimeMirrorFiles({
    config: normalizedConfig,
    homeDirectory,
    aptPlatform
  });
  if (files.length === 0) {
    if (getRuntimeStateValue(stateContext.state, SANDBOX_MIRRORS_STATE_HASH_KEY)) {
      setRuntimeStateValue(stateContext.state, SANDBOX_MIRRORS_STATE_HASH_KEY, []);
      await writeSandboxRuntimeState(sandbox, stateContext);
    }
    return;
  }

  const relativeWritePaths = files
    .filter(({ path }) => path !== APT_MIRROR_SOURCE_PATH)
    .map(({ path }) => path);
  const filesHash = buildRuntimeHash(JSON.stringify(files));
  if (getRuntimeStateValue(stateContext.state, SANDBOX_MIRRORS_STATE_HASH_KEY) === filesHash) {
    const aptSource = files.find(({ path }) => path === APT_MIRROR_SOURCE_PATH);
    if (!aptSource || (await isManagedAptMirrorSourceCurrent(sandbox, aptSource.data.toString()))) {
      return;
    }
  }

  const writeResults = await prepareSandboxFileParentDirectories(sandbox, relativeWritePaths)
    .then(() => sandbox.writeFiles(files))
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
    return;
  }

  setRuntimeStateValue(stateContext.state, SANDBOX_MIRRORS_STATE_HASH_KEY, filesHash);
  await writeSandboxRuntimeState(sandbox, stateContext);
};

/** hash 命中时确认受管 apt source 仍存在，避免清理后被旧状态误判为已写入。 */
const isManagedAptMirrorSourceCurrent = async (
  sandbox: ISandbox,
  expectedContent: string
): Promise<boolean> => {
  const [source] = await sandbox.readFiles([APT_MIRROR_SOURCE_PATH]).catch((error) => {
    logger.warn('[Sandbox Runtime] Failed to verify managed apt mirror source', { error });
    return [];
  });

  if (!source || source.error) return false;
  return Buffer.from(source.content).toString('utf-8') === expectedContent;
};

/**
 * 读取 Ubuntu 或 Debian 代号，以生成与运行镜像版本匹配的 apt source。
 * 无法识别支持的发行版时跳过自定义 apt source，镜像原有官方源保持不变。
 */
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
      .replace(/^(['"])(.*)\1$/, '$2');
  const osId = readField('ID');
  const codename = readField('UBUNTU_CODENAME') ?? readField('VERSION_CODENAME');

  if ((osId !== 'ubuntu' && osId !== 'debian') || !codename) {
    logger.warn('[Sandbox Runtime] Cannot configure apt mirror for an unsupported sandbox', {
      osId,
      codename
    });
    return undefined;
  }

  return {
    distribution: osId,
    codename
  };
};

const buildSandboxRuntimeMirrorFiles = ({
  config,
  homeDirectory,
  aptPlatform
}: {
  config: SandboxRuntimeMirrorsConfig;
  homeDirectory: string;
  aptPlatform?: SandboxAptPlatform;
}): FileWriteEntry[] => {
  const files: FileWriteEntry[] = [];

  if (config.npmRegistry) {
    files.push({
      path: joinSandboxPath(homeDirectory, '.npmrc'),
      data: `registry=${config.npmRegistry}\n`
    });
    files.push({
      path: joinSandboxPath(homeDirectory, '.yarnrc'),
      data: `registry "${config.npmRegistry}"\n`
    });
    files.push({
      path: joinSandboxPath(homeDirectory, '.yarnrc.yml'),
      data: `npmRegistryServer: "${escapeYamlString(config.npmRegistry)}"\n`
    });
    files.push({
      path: joinSandboxPath(homeDirectory, '.bunfig.toml'),
      data: `[install]\nregistry = "${escapeTomlString(config.npmRegistry)}"\n`
    });
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
    files.push({
      path: joinSandboxPath(homeDirectory, '.pip/pip.conf'),
      data: `${pipConfig.join('\n')}\n`
    });
    files.push({
      path: joinSandboxPath(homeDirectory, '.config/pip/pip.conf'),
      data: `${pipConfig.join('\n')}\n`
    });
    files.push({
      path: joinSandboxPath(homeDirectory, '.config/uv/uv.toml'),
      data: `${[
        `default-index = "${escapeTomlString(config.pypiIndexUrl!)}"`,
        ...(pypiTrustedHost
          ? [`allow-insecure-host = ["${escapeTomlString(pypiTrustedHost)}"]`]
          : [])
      ].join('\n')}\n`
    });
  }

  if (config.aptMirror && aptPlatform) {
    const aptSource =
      aptPlatform.distribution === 'ubuntu'
        ? {
            components: 'main restricted universe multiverse',
            signedBy: '/usr/share/keyrings/ubuntu-archive-keyring.gpg'
          }
        : {
            components: 'main contrib non-free non-free-firmware',
            signedBy: '/usr/share/keyrings/debian-archive-keyring.gpg'
          };

    const aptSources = (() => {
      const regularSuites = [
        aptPlatform.codename,
        `${aptPlatform.codename}-updates`,
        `${aptPlatform.codename}-backports`
      ];

      if (aptPlatform.distribution !== 'debian') {
        return [
          {
            uri: config.aptMirror,
            suites: [...regularSuites, `${aptPlatform.codename}-security`]
          }
        ];
      }

      // Debian 将安全更新放在独立的 debian-security 仓库，不能与普通 debian 仓库共用 suite。
      const securityMirror = (() => {
        try {
          const url = new URL(config.aptMirror);
          const path = url.pathname.replace(/\/+$/, '');
          if (!path.endsWith('/debian')) return undefined;
          url.pathname = `${path.slice(0, -'/debian'.length)}/debian-security`;
          return url.toString();
        } catch {
          return undefined;
        }
      })();

      return [
        {
          uri: config.aptMirror,
          suites: regularSuites
        },
        ...(securityMirror
          ? [
              {
                uri: securityMirror,
                suites: [`${aptPlatform.codename}-security`]
              }
            ]
          : [])
      ];
    })();

    files.push({
      path: APT_MIRROR_SOURCE_PATH,
      data: `${aptSources
        .map(({ uri, suites }) =>
          [
            'Types: deb',
            `URIs: ${uri}`,
            `Suites: ${suites.join(' ')}`,
            `Components: ${aptSource.components}`,
            `Signed-By: ${aptSource.signedBy}`
          ].join('\n')
        )
        .join('\n\n')}\n`
    });
  }

  return files;
};

/** 统一清理镜像配置，空值不生成对应的运行时文件。 */
const normalizeMirrorsConfig = (config: SandboxRuntimeMirrorsConfig): SandboxRuntimeMirrorsConfig =>
  Object.fromEntries(
    Object.entries(config).flatMap(([key, value]) => {
      const trimmed = value?.trim();
      return trimmed ? [[key, trimmed]] : [];
    })
  );

const escapeTomlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const escapeYamlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
