import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  getAvailableBuiltinSkillSources,
  getBuiltinSkillsRootPath,
  syncBuiltinSkillsToSandbox
} from '@fastgpt/service/core/ai/skill/runtime/builtin';
import { buildRuntimeHash } from '@fastgpt/service/core/ai/sandbox/runtime/utils';

describe('builtin skill runtime', () => {
  const originalFeConfigs = global.feConfigs;
  let tempDirs: string[] = [];

  beforeEach(() => {
    global.feConfigs = {
      ...originalFeConfigs,
      isPlus: true
    };
  });

  afterEach(async () => {
    global.feConfigs = originalFeConfigs;
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs = [];
  });

  it('discovers pro builtin skill sources without exposing them in workspace', async () => {
    const builtinRoot = await createTempBuiltinSkillRoot();
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(builtinRoot);

    try {
      const sources = await getAvailableBuiltinSkillSources();

      expect(sources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'skill-creator',
            sourceDirectory: path.join(
              builtinRoot,
              'pro/admin/src/service/core/ai/skill/builtin/skill-creator'
            )
          })
        ])
      );
    } finally {
      cwdSpy.mockRestore();
    }
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
    const builtinRoot = await createTempBuiltinSkillRoot();
    const skillCreatorSource = {
      name: 'skill-creator',
      sourceDirectory: path.join(
        builtinRoot,
        'pro/admin/src/service/core/ai/skill/builtin/skill-creator'
      )
    };

    const sandbox = {
      execute: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
      readFiles: vi.fn(async (paths: string[]) =>
        paths.map((path) => ({
          path,
          content: Buffer.from(''),
          error: new Error('not found')
        }))
      ),
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer | string }>) =>
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
      "mkdir -p '/home/sandbox/.fastgpt/runtime'",
      {
        maxOutputBytes: 1024,
        timeoutMs: 5000
      }
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
        })
      ])
    );
    expect(writeEntries.every((entry) => !entry.path.includes('/workspace/'))).toBe(true);
    expect(sandbox.writeFiles.mock.calls[1][0]).toEqual([
      expect.objectContaining({
        path: '/home/sandbox/.fastgpt/runtime/state.json',
        data: expect.stringContaining('builtinSkill:skill-creator')
      })
    ]);
  });

  it('skips writing builtin skill when runtime state etag is current', async () => {
    const builtinRoot = await createTempBuiltinSkillRoot();
    const sources = [
      {
        name: 'skill-creator',
        sourceDirectory: path.join(
          builtinRoot,
          'pro/admin/src/service/core/ai/skill/builtin/skill-creator'
        )
      }
    ];
    const currentEtag = await getSourceEtagForTest(sources[0].sourceDirectory);
    const sandbox = {
      execute: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
      readFiles: vi.fn(async (paths: string[]) =>
        paths.map((path) => ({
          path,
          content: Buffer.from(
            JSON.stringify({
              hashes: {
                'builtinSkill:skill-creator': currentEtag
              }
            })
          ),
          error: null
        }))
      ),
      writeFiles: vi.fn()
    };

    await syncBuiltinSkillsToSandbox({
      sandbox: sandbox as any,
      homeDirectory: '/home/sandbox',
      sources
    });

    expect(sandbox.writeFiles).not.toHaveBeenCalled();
    expect(sandbox.execute).toHaveBeenCalledTimes(1);
    expect(sandbox.readFiles).toHaveBeenCalledWith(['/home/sandbox/.fastgpt/runtime/state.json']);
  });

  async function createTempBuiltinSkillRoot() {
    const root = await mkdtemp(path.join(os.tmpdir(), 'fastgpt-builtin-skill-'));
    tempDirs.push(root);

    const skillDir = path.join(root, 'pro/admin/src/service/core/ai/skill/builtin/skill-creator');
    await mkdir(path.join(skillDir, 'scripts'), { recursive: true });
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---
name: skill-creator
description: Create FastGPT skills.
---

# Skill Creator
`
    );
    await writeFile(path.join(skillDir, 'scripts/init_skill.py'), 'print("init")\n');

    return root;
  }
});

async function getSourceEtagForTest(sourceDirectory: string) {
  const { promises: fs } = await import('fs');
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
      etag: buildRuntimeHash(file.data)
    }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return buildRuntimeHash(fileEtags.map((file) => `${file.relativePath}:${file.etag}\n`).join(''));
}
