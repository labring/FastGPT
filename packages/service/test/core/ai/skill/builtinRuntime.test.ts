import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAvailableBuiltinSkillSources,
  getBuiltinSkillsRootPath,
  syncBuiltinSkillsToSandbox
} from '@fastgpt/service/core/ai/skill/runtime/builtin';

describe('builtin skill runtime', () => {
  const originalFeConfigs = global.feConfigs;

  beforeEach(() => {
    global.feConfigs = {
      ...originalFeConfigs,
      isPlus: true
    };
  });

  afterEach(() => {
    global.feConfigs = originalFeConfigs;
  });

  it('discovers pro builtin skill sources without exposing them in workspace', async () => {
    const sources = await getAvailableBuiltinSkillSources();

    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'skill-creator',
          sourceDirectory: expect.stringContaining(
            'pro/admin/src/service/core/ai/skill/builtin/skill-creator'
          )
        })
      ])
    );
  });

  it('skips requested builtin skills when pro builtin source root is unavailable', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/tmp/fastgpt-no-pro-source-root');

    try {
      await expect(
        getAvailableBuiltinSkillSources({ includeNames: ['skill-creator'] })
      ).resolves.toEqual([]);
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it('skips builtin skills when current deployment is not plus version', async () => {
    global.feConfigs = {
      ...originalFeConfigs,
      isPlus: false
    };

    await expect(
      getAvailableBuiltinSkillSources({ includeNames: ['skill-creator'] })
    ).resolves.toEqual([]);
  });

  it('injects builtin skill files into runtime directory instead of user workspace', async () => {
    const sources = await getAvailableBuiltinSkillSources();
    const skillCreatorSource = sources.find((source) => source.name === 'skill-creator');
    expect(skillCreatorSource).toBeDefined();

    const sandbox = {
      execute: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
        entries.map((entry) => ({
          path: entry.path,
          bytesWritten: entry.data.length,
          error: null
        }))
      )
    };

    await syncBuiltinSkillsToSandbox({
      sandbox: sandbox as any,
      homeDirectory: '/home/sandbox',
      sources: [skillCreatorSource!]
    });

    expect(getBuiltinSkillsRootPath('/home/sandbox')).toBe('/home/sandbox/.fastgpt/skills');
    expect(sandbox.execute).toHaveBeenNthCalledWith(
      1,
      "cat '/home/sandbox/.fastgpt/skills/skill-creator/.fastgpt-builtin-manifest.json' 2>/dev/null || true"
    );
    expect(sandbox.execute).toHaveBeenNthCalledWith(
      2,
      "rm -rf '/home/sandbox/.fastgpt/skills/skill-creator' && mkdir -p '/home/sandbox/.fastgpt/skills/skill-creator'"
    );
    const writeEntries = sandbox.writeFiles.mock.calls[0][0];
    expect(writeEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/home/sandbox/.fastgpt/skills/skill-creator/SKILL.md',
          data: expect.any(Buffer)
        }),
        expect.objectContaining({
          path: '/home/sandbox/.fastgpt/skills/skill-creator/.fastgpt-builtin-manifest.json',
          data: expect.any(Buffer)
        })
      ])
    );
    expect(writeEntries.every((entry) => !entry.path.includes('/workspace/'))).toBe(true);
  });

  it('skips writing builtin skill when sandbox manifest etag is current', async () => {
    const sources = await getAvailableBuiltinSkillSources({ includeNames: ['skill-creator'] });
    const sandbox = {
      execute: vi.fn(async (command: string) => {
        if (command.startsWith('cat ')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              etag: await getSourceEtagForTest(sources[0].sourceDirectory)
            }),
            stderr: ''
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      }),
      writeFiles: vi.fn()
    };

    await syncBuiltinSkillsToSandbox({
      sandbox: sandbox as any,
      homeDirectory: '/home/sandbox',
      sources
    });

    expect(sandbox.writeFiles).not.toHaveBeenCalled();
    expect(sandbox.execute).toHaveBeenCalledTimes(1);
  });
});

async function getSourceEtagForTest(sourceDirectory: string) {
  const { promises: fs } = await import('fs');
  const { createHash } = await import('crypto');
  const path = await import('path');

  const collect = async (
    relativeBase = ''
  ): Promise<Array<{ relativePath: string; data: Buffer }>> => {
    const entries = await fs.readdir(path.join(sourceDirectory, relativeBase), {
      withFileTypes: true
    });
    const files: Array<{ relativePath: string; data: Buffer }> = [];
    for (const entry of entries) {
      const relativePath = relativeBase ? path.join(relativeBase, entry.name) : entry.name;
      if (entry.isDirectory()) {
        files.push(...(await collect(relativePath)));
      } else if (entry.isFile()) {
        files.push({
          relativePath: relativePath.split(path.sep).join('/'),
          data: await fs.readFile(path.join(sourceDirectory, relativePath))
        });
      }
    }
    return files;
  };

  const files = await collect();
  const fileEtags = files
    .map((file) => ({
      relativePath: file.relativePath,
      etag: createHash('sha256').update(file.data).digest('hex')
    }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const skillHash = createHash('sha256');
  fileEtags.forEach((file) => {
    skillHash.update(`${file.relativePath}:${file.etag}\n`);
  });
  return `sha256:${skillHash.digest('hex')}`;
}
