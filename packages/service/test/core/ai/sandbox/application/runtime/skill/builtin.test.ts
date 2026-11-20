import { describe, expect, it, vi } from 'vitest';
import { syncBuiltinSkillsToSandbox } from '@fastgpt/service/core/ai/sandbox/application/runtime/skill/builtin';
import { buildRuntimeHash } from '@fastgpt/service/core/ai/sandbox/utils';

describe('builtin skill runtime', () => {
  it('injects builtin skill files into runtime directory instead of user workspace', async () => {
    const skillCreatorSource = {
      name: 'skill-creator',
      files: createBuiltinSkillSourceFiles()
    };
    const targetDirectory = '/var/lib/fastgpt-runtime/skills/skill-creator';

    const sandbox = {
      createDirectories: vi.fn(async () => undefined),
      listDirectory: vi.fn(async () => [
        {
          name: 'skill-creator',
          path: targetDirectory,
          isDirectory: true,
          isFile: false
        }
      ]),
      deleteDirectories: vi.fn(async () => undefined),
      deleteFiles: vi.fn(),
      readFiles: vi.fn(async (paths: string[]) =>
        paths.map((path) => ({
          path,
          content: Buffer.from(''),
          error: Object.assign(new Error('not found'), { code: 'ENOENT' })
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
      sources: [skillCreatorSource!]
    });

    expect(sandbox.deleteDirectories).toHaveBeenCalledWith([targetDirectory]);
    expect(sandbox.createDirectories).toHaveBeenCalledWith([targetDirectory]);
    const writeEntries = sandbox.writeFiles.mock.calls[0][0];
    expect(writeEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/var/lib/fastgpt-runtime/skills/skill-creator/SKILL.md',
          data: expect.any(Buffer)
        })
      ])
    );
    expect(writeEntries.every((entry) => !entry.path.includes('/workspace/'))).toBe(true);
    expect(sandbox.writeFiles.mock.calls[1][0]).toEqual([
      expect.objectContaining({
        path: '/var/lib/fastgpt-runtime/state.json',
        data: expect.stringContaining('"values"')
      })
    ]);
    expect(sandbox.writeFiles.mock.calls[1][0][0].data).toContain('builtinSkill:skill-creator');
  });

  it('skips writing builtin skill when runtime state is current', async () => {
    const sources = [
      {
        name: 'skill-creator',
        files: createBuiltinSkillSourceFiles()
      }
    ];
    const currentEtag = getSourceEtagForTest(sources[0].files);
    const sandbox = {
      readFiles: vi.fn(async (paths: string[]) =>
        paths.map((path) => ({
          path,
          content: Buffer.from(
            JSON.stringify({
              values: {
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
      sources
    });

    expect(sandbox.writeFiles).not.toHaveBeenCalled();
    expect(sandbox.readFiles).toHaveBeenCalledWith(['/var/lib/fastgpt-runtime/state.json']);
  });

  it('reinjects builtin skills after Sandbox recreation clears HOME and runtime state', async () => {
    const sources = [
      {
        name: 'skill-creator',
        files: createBuiltinSkillSourceFiles()
      }
    ];
    const files = new Map<string, Buffer>();
    const sandbox = {
      readFiles: vi.fn(async (paths: string[]) =>
        paths.map((path) => {
          const content = files.get(path);
          return content
            ? { path, content, error: null }
            : {
                path,
                content: Buffer.alloc(0),
                error: Object.assign(new Error('not found'), { code: 'ENOENT' })
              };
        })
      ),
      createDirectories: vi.fn(async () => undefined),
      listDirectory: vi.fn(async () => []),
      deleteDirectories: vi.fn(async () => undefined),
      deleteFiles: vi.fn(async () => []),
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer | string }>) =>
        entries.map((entry) => {
          const content = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
          files.set(entry.path, content);
          return { path: entry.path, bytesWritten: content.byteLength, error: null };
        })
      )
    };
    const skillPath = '/var/lib/fastgpt-runtime/skills/skill-creator/SKILL.md';
    const runtimeStatePath = '/var/lib/fastgpt-runtime/state.json';

    await syncBuiltinSkillsToSandbox({
      sandbox: sandbox as any,
      sources
    });
    expect(files.has(skillPath)).toBe(true);
    expect(files.has(runtimeStatePath)).toBe(true);

    // OpenSandbox 只持久化 workspace；容器重建会同时清空 HOME Skill 和 runtime state。
    files.clear();

    await syncBuiltinSkillsToSandbox({
      sandbox: sandbox as any,
      sources
    });

    expect(files.has(skillPath)).toBe(true);
    expect(files.has(runtimeStatePath)).toBe(true);
    expect(
      sandbox.writeFiles.mock.calls.filter(([entries]) =>
        entries.some((entry) => entry.path === skillPath)
      )
    ).toHaveLength(2);
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
