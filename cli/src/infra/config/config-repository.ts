import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { CliArgumentError } from '../../shared/errors';

export const DEFAULT_PROFILE_NAME = 'default';

export const CliProfileConfigSchema = z.object({
  baseUrl: z.string().min(1),
  allowInsecureHttp: z.boolean().optional(),
  authType: z.enum(['token', 'apikey']).optional(),
  apiKeyType: z.enum(['personal', 'app']).optional(),
  apiKeyName: z.string().optional(),
  boundAppId: z.string().optional(),
  boundAppName: z.string().optional(),
  maskedSecret: z.string().optional(),
  user: z
    .object({
      userId: z.string(),
      username: z.string()
    })
    .optional(),
  team: z
    .object({
      teamId: z.string(),
      teamName: z.string(),
      tmbId: z.string()
    })
    .optional(),
  isRoot: z.boolean().optional(),
  sessionExpiresAt: z.number().optional(),
  storageMode: z.enum(['keychain', 'file']).optional(),
  updatedAt: z.number()
});
export type CliProfileConfig = z.infer<typeof CliProfileConfigSchema>;

export const CliConfigFileSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  currentProfile: z.string().default(DEFAULT_PROFILE_NAME),
  profiles: z.record(z.string(), CliProfileConfigSchema).default({})
});
export type CliConfigFile = z.infer<typeof CliConfigFileSchema>;

export type ConfigLoadResult = {
  config: CliConfigFile;
  configPath: string;
  warnings: string[];
};

export type ConfigRepository = {
  getConfigDir: () => string;
  getConfigPath: () => string;
  read: () => Promise<ConfigLoadResult>;
  write: (config: CliConfigFile) => Promise<string>;
};

/**
 * 解析配置目录，支持 `FASTGPT_CONFIG_DIR` 覆盖，默认遵循 XDG / Windows APPDATA 规范。
 */
export function resolveConfigDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string {
  if (env.FASTGPT_CONFIG_DIR && env.FASTGPT_CONFIG_DIR.trim().length > 0) {
    return env.FASTGPT_CONFIG_DIR.trim();
  }
  if (platform === 'win32') {
    const appData = env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'fastgpt');
  }
  const xdgConfig = env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(xdgConfig, 'fastgpt');
}

export async function ensureSecureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    await chmod(dirPath, 0o700).catch(() => {});
  }
}

export async function checkPosixFileMode(filePath: string): Promise<string | undefined> {
  if (process.platform === 'win32') {
    return undefined;
  }
  try {
    const info = await stat(filePath);
    if ((info.mode & 0o077) !== 0) {
      return `File "${filePath}" has overly permissive permissions (${(info.mode & 0o777).toString(8)}); expected 600.`;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  return undefined;
}

export async function writeSecureJsonFile(filePath: string, data: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(tempPath, serialized, { encoding: 'utf8', mode: 0o600 });
  if (process.platform !== 'win32') {
    await chmod(tempPath, 0o600);
  }
  await rename(tempPath, filePath);
}

export function createEmptyConfig(): CliConfigFile {
  return {
    schemaVersion: 1,
    currentProfile: DEFAULT_PROFILE_NAME,
    profiles: {}
  };
}

/**
 * 基于本地 JSON 文件的配置仓储实现，确保目录 0700、文件 0600 原子写入。
 */
export function createFileConfigRepository({ configDir }: { configDir: string }): ConfigRepository {
  const configPath = join(configDir, 'config.json');

  return {
    getConfigDir: () => configDir,
    getConfigPath: () => configPath,
    read: async () => {
      const warnings: string[] = [];
      try {
        const permWarning = await checkPosixFileMode(configPath);
        if (permWarning) {
          warnings.push(permWarning);
        }
        const raw = await readFile(configPath, 'utf8');
        const parsed = CliConfigFileSchema.parse(JSON.parse(raw));
        return { config: parsed, configPath, warnings };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return { config: createEmptyConfig(), configPath, warnings };
        }
        if (error instanceof SyntaxError || error instanceof z.ZodError) {
          throw new CliArgumentError(
            `Invalid CLI config file at ${configPath}: ${error.message}`,
            undefined,
            'Fix or remove the corrupted config.json file and run fastgpt login.'
          );
        }
        throw error;
      }
    },
    write: async (config) => {
      await ensureSecureDir(configDir);
      const validated = CliConfigFileSchema.parse(config);
      await writeSecureJsonFile(configPath, validated);
      return configPath;
    }
  };
}
