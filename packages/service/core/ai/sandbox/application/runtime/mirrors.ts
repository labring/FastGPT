/**
 * 沙盒业务层：为运行态 sandbox 准备包管理器镜像源。
 *
 * 负责根据环境配置写入 npm/pip/uv 等镜像文件，不处理 Skill 包部署。
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

const SANDBOX_MIRRORS_STATE_HASH_KEY = 'sandboxPackageMirrors';

export type SandboxRuntimeMirrorsConfig = {
  npmRegistry?: string;
  pypiIndexUrl?: string;
};

export const getSandboxRuntimeMirrorsConfig = (): SandboxRuntimeMirrorsConfig =>
  normalizeMirrorsConfig({
    npmRegistry: serviceEnv.AGENT_SANDBOX_NPM_REGISTRY,
    pypiIndexUrl: serviceEnv.AGENT_SANDBOX_PYPI_INDEX_URL
  });

export const prepareSandboxRuntimeMirrors = async ({
  sandbox,
  config = getSandboxRuntimeMirrorsConfig()
}: {
  sandbox: ISandbox;
  config?: SandboxRuntimeMirrorsConfig;
}): Promise<void> => {
  const files = buildSandboxRuntimeMirrorFiles(config);
  if (files.length === 0) return;

  const homeDirectory = await resolveSandboxHome(sandbox);
  if (!homeDirectory) return;

  const stateContext = await readSandboxRuntimeState({ sandbox, homeDirectory });
  if (!stateContext.statePath) return;

  const writeEntries = files.map((file) => ({
    path: joinSandboxPath(homeDirectory, file.path),
    data: file.content
  }));
  const filesHash = buildRuntimeHash(JSON.stringify(writeEntries));
  if (getRuntimeStateValue(stateContext.state, SANDBOX_MIRRORS_STATE_HASH_KEY) === filesHash) {
    return;
  }

  const writeResults = await prepareSandboxFileParentDirectories(
    sandbox,
    writeEntries.map(({ path }) => path)
  )
    .then(() => sandbox.writeFiles(writeEntries))
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

const buildSandboxRuntimeMirrorFiles = (config: SandboxRuntimeMirrorsConfig) => {
  const normalized = normalizeMirrorsConfig(config);
  const files: Array<{ path: string; content: string }> = [];

  if (normalized.npmRegistry) {
    files.push({
      path: '.npmrc',
      content: `registry=${normalized.npmRegistry}\n`
    });
    files.push({
      path: '.yarnrc',
      content: `registry "${normalized.npmRegistry}"\n`
    });
    files.push({
      path: '.yarnrc.yml',
      content: `npmRegistryServer: "${escapeYamlString(normalized.npmRegistry)}"\n`
    });
    files.push({
      path: '.bunfig.toml',
      content: `[install]\nregistry = "${escapeTomlString(normalized.npmRegistry)}"\n`
    });
  }

  let pypiTrustedHost: string | undefined;
  if (normalized.pypiIndexUrl) {
    try {
      pypiTrustedHost = new URL(normalized.pypiIndexUrl).host || undefined;
    } catch {
      pypiTrustedHost = undefined;
    }
  }
  const pipConfig = [
    '[global]',
    ...(normalized.pypiIndexUrl ? [`index-url = ${normalized.pypiIndexUrl}`] : []),
    ...(pypiTrustedHost ? [`trusted-host = ${pypiTrustedHost}`] : [])
  ];
  if (pipConfig.length > 1) {
    files.push({
      path: '.pip/pip.conf',
      content: `${pipConfig.join('\n')}\n`
    });
    files.push({
      path: '.config/pip/pip.conf',
      content: `${pipConfig.join('\n')}\n`
    });
    files.push({
      path: '.config/uv/uv.toml',
      content: `${[
        `default-index = "${escapeTomlString(normalized.pypiIndexUrl!)}"`,
        ...(pypiTrustedHost
          ? [`allow-insecure-host = ["${escapeTomlString(pypiTrustedHost)}"]`]
          : [])
      ].join('\n')}\n`
    });
  }

  return files;
};

const normalizeMirrorsConfig = (config: SandboxRuntimeMirrorsConfig): SandboxRuntimeMirrorsConfig =>
  Object.fromEntries(
    Object.entries(config).flatMap(([key, value]) => {
      const trimmed = value?.trim();
      return trimmed ? [[key, trimmed]] : [];
    })
  );

const escapeTomlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const escapeYamlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
