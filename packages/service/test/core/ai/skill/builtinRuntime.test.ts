import { describe, expect, it, vi } from 'vitest';
import {
  getBuiltinSkillsRootPath,
  syncBuiltinSkillsToSandbox
} from '@fastgpt/service/core/ai/skill/runtime/builtin';
import { buildRuntimeHash } from '@fastgpt/service/core/ai/sandbox/runtime/utils';

describe('builtin skill runtime', () => {
  it('injects builtin skill files into runtime directory instead of user workspace', async () => {
    const skillCreatorSource = {
      name: 'skill-creator',
      files: createBuiltinSkillSourceFiles()
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
        data: expect.stringContaining('"values"')
      })
    ]);
    expect(sandbox.writeFiles.mock.calls[1][0][0].data).toContain('builtinSkill:skill-creator');
  });

  it('skips writing builtin skill when legacy runtime hash state is current', async () => {
    const sources = [
      {
        name: 'skill-creator',
        files: createBuiltinSkillSourceFiles()
      }
    ];
    const currentEtag = getSourceEtagForTest(sources[0].files);
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
});

function createBuiltinSkillSourceFiles() {
  return [
    {
      relativePath: 'SKILL.md',
      content: Buffer.from(`---
name: skill-creator
description: Create FastGPT skills.
---

# Skill Creator
`)
    },
    {
      relativePath: 'scripts/init_skill.py',
      content: Buffer.from('print("init")\n')
    }
  ];
}

function getSourceEtagForTest(files: Array<{ relativePath: string; content: Buffer }>) {
  const fileEtags = files
    .map((file) => ({
      relativePath: file.relativePath,
      etag: buildRuntimeHash(file.content)
    }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return buildRuntimeHash(fileEtags.map((file) => `${file.relativePath}:${file.etag}\n`).join(''));
}
