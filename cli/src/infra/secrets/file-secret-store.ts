import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CliArgumentError, CliAuthError } from '../../shared/errors';
import {
  checkPosixFileMode,
  ensureSecureDir,
  writeSecureJsonFile
} from '../config/config-repository';
import type { SecretStoreStrategy } from './secret-store';

/**
 * 基于 `0600` 权限 `credentials.json` 的凭据存储策略，用于 Headless/容器或显式文件模式。
 */
export function createFileSecretStore({ configDir }: { configDir: string }): SecretStoreStrategy {
  const credentialsPath = join(configDir, 'credentials.json');

  async function readAll(): Promise<Record<string, string>> {
    const permWarning = await checkPosixFileMode(credentialsPath);
    if (permWarning) {
      throw new CliAuthError({
        code: 'AUTH_INVALID',
        message: permWarning,
        hint: `Run: chmod 600 "${credentialsPath}"`
      });
    }

    try {
      const raw = await readFile(credentialsPath, 'utf8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new CliArgumentError(
          `Invalid credentials file at ${credentialsPath}.`,
          undefined,
          `Fix or remove the corrupted credentials.json file and run "fastgpt login" again.`
        );
      }

      // 使用无原型字典避免 `toString`/`constructor` 等 profile 名称命中 Object.prototype。
      const map = Object.create(null) as Record<string, string>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return map;
      }
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          map[key] = value;
        }
      }
      return map;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return Object.create(null) as Record<string, string>;
      }
      throw error;
    }
  }

  async function writeAll(records: Record<string, string>): Promise<void> {
    await ensureSecureDir(configDir);
    await writeSecureJsonFile(credentialsPath, records);
  }

  return {
    backend: 'file',
    isAvailable: async () => true,
    get: async (profileName) => {
      const records = await readAll();
      return Object.hasOwn(records, profileName) ? records[profileName] : undefined;
    },
    set: async (profileName, secret) => {
      const records = await readAll();
      records[profileName] = secret;
      await writeAll(records);
      return true;
    },
    delete: async (profileName) => {
      const records = await readAll();
      if (Object.hasOwn(records, profileName)) {
        delete records[profileName];
        await writeAll(records);
      }
    }
  };
}
