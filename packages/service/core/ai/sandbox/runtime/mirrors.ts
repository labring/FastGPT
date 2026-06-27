import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import { serviceEnv } from '../../../../env';
import { buildRuntimeHash, joinSandboxPath } from './utils';
import {
  getRuntimeStateValue,
  readSandboxRuntimeState,
  setRuntimeStateValue,
  writeSandboxRuntimeState
} from './state';
import { resolveSandboxHome } from './home';

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

  const mirrorScript = buildSandboxRuntimeMirrorScript({ homeDirectory, files });
  const scriptHash = buildRuntimeHash(mirrorScript);
  if (getRuntimeStateValue(stateContext.state, SANDBOX_MIRRORS_STATE_HASH_KEY) === scriptHash) {
    return;
  }

  const result = await sandbox
    .execute(mirrorScript, {
      timeoutMs: 5_000,
      maxOutputBytes: 1024
    })
    .catch((error) => {
      logger.warn('[Sandbox Runtime] Failed to execute mirror config script', { error });
      return undefined;
    });
  if (!result || result.exitCode !== 0) {
    logger.warn('[Sandbox Runtime] Failed to execute mirror config script', {
      exitCode: result?.exitCode,
      stderr: result?.stderr
    });
    return;
  }

  setRuntimeStateValue(stateContext.state, SANDBOX_MIRRORS_STATE_HASH_KEY, scriptHash);
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

const buildSandboxRuntimeMirrorScript = ({
  homeDirectory,
  files
}: {
  homeDirectory: string;
  files: Array<{ path: string; content: string }>;
}) => {
  const writeEntries = files.map((file) => ({
    path: joinSandboxPath(homeDirectory, file.path),
    content: file.content
  }));
  const prepareDirs = Array.from(
    new Set(writeEntries.map((entry) => entry.path.split('/').slice(0, -1).join('/')))
  );

  return [
    `mkdir -p ${prepareDirs.map((dir) => shellQuote(dir)).join(' ')}`,
    ...writeEntries.map(({ path, content }) => {
      const encodedContent = Buffer.from(content, 'utf-8').toString('base64');
      return `printf %s ${shellQuote(encodedContent)} | base64 -d > ${shellQuote(path)}`;
    })
  ].join('\n');
};

const escapeTomlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const escapeYamlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
