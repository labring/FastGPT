import { describe, expect, it } from 'vitest';
import { readTarZstEntries } from '@test/utils/tarZst';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import { extractRuntimeSkillsFromSkillMdFiles } from '@fastgpt/service/core/ai/skill/package/runtimeMetadata';
import { createBlankSkillWorkspacePackage } from '@fastgpt/service/core/ai/skill/package/workspace';

describe('skill package helpers', () => {
  describe('createBlankSkillWorkspacePackage', () => {
    it('should create an initial blank .tar.zst workspace with .gitignore and empty skills directory', async () => {
      const packageBuffer = await createBlankSkillWorkspacePackage();

      expect(Buffer.isBuffer(packageBuffer)).toBe(true);
      const entries = await readTarZstEntries(packageBuffer);
      const files = entries.map((entry) => entry.path);

      expect(files).toContain('.gitignore');
      expect(files).toContain('skills/');
      expect(files).not.toContain('skills/SKILL.md');
    });
  });

  describe('extractRuntimeSkillsFromSkillMdFiles', () => {
    it('should extract sorted runtime skills at any depth while keeping real paths and duplicate names', () => {
      const result = extractRuntimeSkillsFromSkillMdFiles([
        {
          path: 'skills/data-cleaning/SKILL.md',
          content: '---\nname: shared\ndescription: Clean table data\n---\n'
        },
        {
          path: './SKILL.md',
          content: '---\nname: root-skill\n---\n'
        },
        {
          path: 'nested/deep/chart-reporting/skill.md',
          content: '---\nname: shared\ndescription: Build chart reports\n---\n'
        },
        {
          path: 'node_modules/pkg/SKILL.md',
          content: '---\nname: ignored\n---\n'
        },
        {
          path: '.venv/pkg/SKILL.md',
          content: '---\nname: ignored-venv\n---\n'
        }
      ]);

      expect(result).toEqual([
        {
          name: 'shared',
          description: 'Build chart reports',
          path: 'nested/deep/chart-reporting/skill.md'
        },
        {
          name: 'root-skill',
          description: '',
          path: 'SKILL.md'
        },
        {
          name: 'shared',
          description: 'Clean table data',
          path: 'skills/data-cleaning/SKILL.md'
        }
      ]);
    });

    it('skips invalid SKILL.md entries when valid ones exist and fails with noValidSkillMd when none are valid', () => {
      expect(
        extractRuntimeSkillsFromSkillMdFiles([
          { path: 'examples/broken/SKILL.md', content: '---\ndescription: Missing name\n---\n' },
          { path: 'tool/SKILL.md', content: '---\nname: valid-tool\n---\n' }
        ])
      ).toEqual([
        {
          name: 'valid-tool',
          description: '',
          path: 'tool/SKILL.md'
        }
      ]);

      let caught: unknown;
      try {
        extractRuntimeSkillsFromSkillMdFiles([
          { path: 'a/SKILL.md', content: '---\ndescription: Missing name\n---\n' },
          { path: 'b/SKILL.md', content: '', error: 'SKILL.md exceeds maximum metadata size' }
        ]);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(UserError);
      expect((caught as UserError).message).toBe(SkillErrEnum.noValidSkillMd);
    });

    it('rejects missing SKILL.md collections', () => {
      expect(() =>
        extractRuntimeSkillsFromSkillMdFiles([{ path: 'node_modules/a/SKILL.md', content: '' }])
      ).toThrow(SkillErrEnum.missingSkillMd);
    });
  });
});
