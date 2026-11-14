import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createFileConfigRepository,
  resolveConfigDir
} from '../../src/infra/config/config-repository';
import { CliArgumentError } from '../../src/shared/errors';

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-cfg-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('FileConfigRepository', () => {
  it('resolves platform config directories', () => {
    expect(resolveConfigDir({ FASTGPT_CONFIG_DIR: '/custom/dir' }, 'darwin')).toBe('/custom/dir');
    expect(resolveConfigDir({ XDG_CONFIG_HOME: '/xdg' }, 'linux')).toBe('/xdg/fastgpt');
    expect(resolveConfigDir({ APPDATA: 'C:\\AppData' }, 'win32')).toContain('fastgpt');
  });

  it('reads defaults, writes atomically with 0700/0600 modes, and warns on permissive modes', async () => {
    const dir = await makeTempDir();
    const nestedDir = join(dir, 'cfg');
    const repo = createFileConfigRepository({ configDir: nestedDir });

    const initial = await repo.read();
    expect(initial.config.currentProfile).toBe('default');
    expect(initial.config.profiles).toEqual({});

    const configPath = await repo.write({
      schemaVersion: 1,
      currentProfile: 'prod',
      profiles: {
        prod: {
          baseUrl: 'https://cloud.fastgpt.in/api',
          authType: 'token',
          updatedAt: 1000
        }
      }
    });

    if (process.platform !== 'win32') {
      expect((await stat(nestedDir)).mode & 0o777).toBe(0o700);
      expect((await stat(configPath)).mode & 0o777).toBe(0o600);

      await chmod(configPath, 0o644);
      const warned = await repo.read();
      expect(warned.warnings).toHaveLength(1);
    }

    const loaded = await repo.read();
    expect(loaded.config.currentProfile).toBe('prod');
    expect(JSON.parse(await readFile(configPath, 'utf8')).profiles.prod.baseUrl).toBe(
      'https://cloud.fastgpt.in/api'
    );

    await writeFile(configPath, '{bad json', 'utf8');
    await expect(repo.read()).rejects.toThrow(CliArgumentError);
  });
});
