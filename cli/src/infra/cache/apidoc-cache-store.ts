import { randomUUID } from 'node:crypto';
import { chmod, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { sha256Hex } from '../../shared/crypto';
import { CliArgumentError } from '../../shared/errors';
import { ensureSecureDir } from '../config/config-repository';

export const ApidocSourceSchema = z.enum(['system', 'dev']);
export type ApidocSource = z.infer<typeof ApidocSourceSchema>;

export const CachedApidocEntrySchema = z.object({
  fetchedAt: z.number().finite(),
  source: ApidocSourceSchema,
  baseUrl: z.string().min(1),
  document: z.record(z.string(), z.unknown())
});
export type CachedApidocEntry = z.infer<typeof CachedApidocEntrySchema>;

export type ApidocCacheStore = {
  getCachePath: (params: { baseUrl: string; source: ApidocSource }) => string;
  read: (params: {
    baseUrl: string;
    source: ApidocSource;
  }) => Promise<CachedApidocEntry | undefined>;
  write: (entry: CachedApidocEntry) => Promise<string>;
};

function extractOrigin(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    throw new CliArgumentError(`Invalid baseUrl for OpenAPI cache key: "${baseUrl}".`);
  }
}

/**
 * 基于本地配置目录实现 OpenAPI 文档缓存仓储，按服务端 Origin 哈希分片并以 0700/0600 权限原子落盘。
 */
export function createFileApidocCacheStore({ configDir }: { configDir: string }): ApidocCacheStore {
  const cacheParentDir = join(configDir, 'cache');
  const cacheDir = join(cacheParentDir, 'apidoc');

  const getCachePath = ({ baseUrl, source }: { baseUrl: string; source: ApidocSource }): string => {
    const validSource = ApidocSourceSchema.parse(source);
    const originHash = sha256Hex(extractOrigin(baseUrl)).slice(0, 16);
    return join(cacheDir, `${originHash}-${validSource}.json`);
  };

  return {
    getCachePath,

    read: async ({ baseUrl, source }) => {
      const cachePath = getCachePath({ baseUrl, source });
      try {
        const raw = await readFile(cachePath, 'utf8');
        return CachedApidocEntrySchema.parse(JSON.parse(raw));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return undefined;
        }
        if (error instanceof SyntaxError || error instanceof z.ZodError) {
          throw new CliArgumentError(
            `Corrupted OpenAPI cache file at "${cachePath}": ${error.message}`,
            { cachePath, source },
            'Re-run with --refresh to re-fetch and overwrite the cached OpenAPI schema.'
          );
        }
        throw error;
      }
    },

    write: async (entry) => {
      const validated = CachedApidocEntrySchema.parse(entry);
      const cachePath = getCachePath({
        baseUrl: validated.baseUrl,
        source: validated.source
      });

      // 确保父级 cache 目录与 apidoc 子目录均保持 0700 私有权限。
      await ensureSecureDir(configDir);
      await ensureSecureDir(cacheParentDir);
      await ensureSecureDir(cacheDir);

      const tempPath = `${cachePath}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
      const serialized = `${JSON.stringify(validated)}\n`;

      try {
        await writeFile(tempPath, serialized, { encoding: 'utf8', mode: 0o600 });
        if (process.platform !== 'win32') {
          await chmod(tempPath, 0o600);
        }
        await rename(tempPath, cachePath);
        return cachePath;
      } finally {
        await rm(tempPath, { force: true }).catch(() => {});
      }
    }
  };
}
