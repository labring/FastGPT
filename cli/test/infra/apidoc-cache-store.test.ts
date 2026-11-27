import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFileApidocCacheStore } from '../../src/infra/cache/apidoc-cache-store';
import { createNodeFileIoAdapter } from '../../src/infra/fs/file-io';
import { sha256Hex } from '../../src/shared/crypto';
import { CliArgumentError } from '../../src/shared/errors';

const tempDirs: string[] = [];

async function makeTempDir(prefix = 'fastgpt-cli-apidoc-'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('FileApidocCacheStore & FileIoAdapter.writeBinaryAtomic', () => {
  it('returns undefined when missing and stores entries per origin+source with 0700/0600 modes', async () => {
    const configDir = await makeTempDir();
    const store = createFileApidocCacheStore({ configDir });

    await expect(
      store.read({ baseUrl: 'https://cloud.fastgpt.cn/api', source: 'system' })
    ).resolves.toBeUndefined();

    const entry = {
      fetchedAt: 1_700_000_000_000,
      source: 'system' as const,
      baseUrl: 'https://cloud.fastgpt.cn/api',
      document: {
        openapi: '3.1.0',
        paths: {
          '/core/dataset/detail': { get: { summary: 'Get dataset detail' } }
        }
      }
    };

    const writtenPath = await store.write(entry);
    const expectedOriginHash = sha256Hex('https://cloud.fastgpt.cn/api').slice(0, 16);
    expect(writtenPath).toBe(
      join(configDir, 'cache', 'apidoc', `${expectedOriginHash}-system.json`)
    );

    if (process.platform !== 'win32') {
      expect((await stat(join(configDir, 'cache'))).mode & 0o777).toBe(0o700);
      expect((await stat(join(configDir, 'cache', 'apidoc'))).mode & 0o777).toBe(0o700);
      expect((await stat(writtenPath)).mode & 0o777).toBe(0o600);
    }

    // 同部署路径尾部斜杠规范化后命中同一缓存；不同子路径与 root 必须隔离。
    const loadedNormalized = await store.read({
      baseUrl: 'https://cloud.fastgpt.cn/api/',
      source: 'system'
    });
    expect(loadedNormalized).toEqual(entry);

    await expect(
      store.read({
        baseUrl: 'https://cloud.fastgpt.cn/subpath/api',
        source: 'system'
      })
    ).resolves.toBeUndefined();

    // 即使缓存文件落盘键相同，如果内容中声明的 baseUrl 不一致也必须视为未命中。
    const mismatchedSubpathPath = store.getCachePath({
      baseUrl: 'https://cloud.fastgpt.cn/other/api',
      source: 'system'
    });
    await writeFile(
      mismatchedSubpathPath,
      JSON.stringify({ ...entry, baseUrl: 'https://cloud.fastgpt.cn/different/api' }),
      'utf8'
    );
    await expect(
      store.read({
        baseUrl: 'https://cloud.fastgpt.cn/other/api',
        source: 'system'
      })
    ).resolves.toBeUndefined();

    // dev 与 system 以及不同 origin 分别隔离缓存文件
    await expect(
      store.read({ baseUrl: 'https://cloud.fastgpt.cn/api', source: 'dev' })
    ).resolves.toBeUndefined();
    await expect(
      store.read({ baseUrl: 'https://other.fastgpt.cn/api', source: 'system' })
    ).resolves.toBeUndefined();
  });

  it('throws clear CliArgumentError on corrupted JSON or invalid cache schema', async () => {
    const configDir = await makeTempDir();
    const store = createFileApidocCacheStore({ configDir });
    const cachePath = await store.write({
      fetchedAt: 1000,
      source: 'dev',
      baseUrl: 'http://127.0.0.1:3000/api',
      document: { paths: {} }
    });

    await writeFile(cachePath, '{corrupted json', 'utf8');
    await expect(
      store.read({ baseUrl: 'http://127.0.0.1:3000/api', source: 'dev' })
    ).rejects.toMatchObject({
      code: 'CLI_ARGUMENT_INVALID',
      exitCode: 2,
      hint: expect.stringContaining('--refresh')
    });

    await writeFile(cachePath, JSON.stringify({ fetchedAt: 'not-a-number' }), 'utf8');
    await expect(
      store.read({ baseUrl: 'http://127.0.0.1:3000/api', source: 'dev' })
    ).rejects.toBeInstanceOf(CliArgumentError);
  });

  it('supports concurrent cache writes and binary atomic writes cleanly', async () => {
    const dir = await makeTempDir();
    const store = createFileApidocCacheStore({ configDir: dir });

    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        store.write({
          fetchedAt: 1000 + index,
          source: 'system',
          baseUrl: 'http://localhost:3000/api',
          document: { index }
        })
      )
    );

    const loaded = await store.read({
      baseUrl: 'http://localhost:3000/api',
      source: 'system'
    });
    expect(loaded?.source).toBe('system');
    expect(typeof loaded?.document.index).toBe('number');

    const fileIo = createNodeFileIoAdapter({ cwd: dir });
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);
    const binaryOut = await fileIo.writeBinaryAtomic({
      filePath: 'nested/out.bin',
      content: bytes
    });
    const readBack = await readFile(binaryOut);
    expect(new Uint8Array(readBack)).toEqual(bytes);
  });
});
