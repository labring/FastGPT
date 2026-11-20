import { describe, expect, it } from 'vitest';
import { readTarZstEntries } from '@test/utils/tarZst';
import {
  extractRuntimeSkillsFromSkillMdFiles,
  isRuntimeSkillMdPath
} from '@fastgpt/service/core/ai/skill/package/runtimeMetadata';
import {
  createBlankSkillWorkspacePackage,
  validateDeployableSkillWorkspacePaths
} from '@fastgpt/service/core/ai/skill/package/workspace';

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
      expect(files.some((file) => /^skills\/[^/]+\/SKILL\.md$/i.test(file))).toBe(false);
    });
  });

  describe('extractRuntimeSkillsFromSkillMdFiles', () => {
    it('should extract sorted runtime skills from workspace SKILL.md entries', () => {
      const result = extractRuntimeSkillsFromSkillMdFiles([
        {
          path: 'skills/data-cleaning/SKILL.md',
          content: '---\nname: data-cleaning\ndescription: Clean table data\n---\n'
        },
        {
          path: 'skills/chart-reporting/SKILL.md',
          content: '---\nname: chart-reporting\ndescription: Build chart reports\n---\n'
        }
      ]);

      expect(result).toEqual([
        {
          name: 'chart-reporting',
          description: 'Build chart reports',
          path: 'skills/chart-reporting/SKILL.md'
        },
        {
          name: 'data-cleaning',
          description: 'Clean table data',
          path: 'skills/data-cleaning/SKILL.md'
        }
      ]);
    });

    it('should map legacy single skill package path and match candidate SKILL.md paths', () => {
      expect(isRuntimeSkillMdPath('skills/demo/SKILL.md')).toBe(true);
      expect(isRuntimeSkillMdPath('legacy-skill/SKILL.MD')).toBe(true);
      expect(isRuntimeSkillMdPath('SKILL.md')).toBe(true);
      expect(isRuntimeSkillMdPath('skills/a/b/SKILL.md')).toBe(false);

      const result = extractRuntimeSkillsFromSkillMdFiles([
        {
          path: 'legacy-skill/SKILL.MD',
          content: '---\nname: legacy-skill\n---\n'
        }
      ]);

      expect(result).toEqual([
        {
          name: 'legacy-skill',
          description: '',
          path: 'skills/legacy-skill/SKILL.md'
        }
      ]);
    });

    it('should reject duplicate runtime skill names and missing frontmatter name', () => {
      expect(() =>
        extractRuntimeSkillsFromSkillMdFiles([
          { path: 'skills/a/SKILL.md', content: '---\nname: same\n---\n' },
          { path: 'skills/b/SKILL.md', content: '---\nname: same\n---\n' }
        ])
      ).toThrow('Duplicate runtime skill name: same');

      expect(() =>
        extractRuntimeSkillsFromSkillMdFiles([
          { path: 'skills/a/SKILL.md', content: '---\ndescription: Missing name\n---\n' }
        ])
      ).toThrow('frontmatter name is required');
    });

    it('should ignore fallback non-workspace SKILL.md when skills/<dir>/SKILL.md exists and support allowEmpty', () => {
      const result = extractRuntimeSkillsFromSkillMdFiles([
        { path: 'skills/lowercase-entry/skill.md', content: '---\nname: lowercase-entry\n---\n' },
        { path: 'UPPERCASE/SKILL.MD', content: '---\nname: uppercase-entry\n---\n' }
      ]);

      expect(result).toEqual([
        {
          name: 'lowercase-entry',
          description: '',
          path: 'skills/lowercase-entry/skill.md'
        }
      ]);

      expect(extractRuntimeSkillsFromSkillMdFiles([], { allowEmpty: true })).toEqual([]);
    });
  });

  describe('validateDeployableSkillWorkspacePaths', () => {
    it('should reject blank initial workspace during publish validation', async () => {
      const buffer = await createBlankSkillWorkspacePackage();
      const entries = await readTarZstEntries(buffer);
      const result = validateDeployableSkillWorkspacePaths(entries.map((entry) => entry.path));

      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least one first-level skill folder');
    });

    it('should accept a workspace with at least one first-level skill folder containing SKILL.md', () => {
      const result = validateDeployableSkillWorkspacePaths([
        '.gitignore',
        'skills/seo-title-generator/SKILL.md',
        'skills/seo-title-generator/examples/input.md'
      ]);

      expect(result.valid).toBe(true);
    });

    it('should accept case-insensitive SKILL.md for deployable skill folders', () => {
      const result = validateDeployableSkillWorkspacePaths(['skills/lowercase-entry/skill.md']);
      expect(result.valid).toBe(true);
    });

    it('should reject when any first-level skill folder misses SKILL.md', () => {
      const result = validateDeployableSkillWorkspacePaths([
        'skills/valid-skill/',
        'skills/valid-skill/SKILL.md',
        'skills/missing-entry/',
        'skills/missing-entry/README.md'
      ]);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing-entry');
    });
  });
});
