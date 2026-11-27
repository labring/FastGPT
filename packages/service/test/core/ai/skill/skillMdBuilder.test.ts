import { describe, expect, it } from 'vitest';
import {
  extractSkillMetadataFromMarkdown,
  findSkillMdEntries,
  parseSkillMarkdown
} from '@fastgpt/service/core/ai/skill/utils';

describe('skillMd utilities', () => {
  // ==================== parseSkillMarkdown ====================
  describe('parseSkillMarkdown', () => {
    it('should parse nested fields and handle pop stack correctly on indent change', () => {
      const content = `---
name: my-skill
description: "A description"
metadata:
  tags: [test, skill]
  author: "FastGPT"
version: "1.0.0"
---
# Body content`;

      const result = parseSkillMarkdown(content);
      expect(result.error).toBeUndefined();
      expect(result.frontmatter.name).toBe('my-skill');
      expect(result.frontmatter.description).toBe('"A description"');
      expect(result.frontmatter.metadata).toEqual({
        tags: '[test, skill]',
        author: '"FastGPT"'
      });
      expect(result.frontmatter.version).toBe('"1.0.0"');
      expect(result.content.trim()).toBe('# Body content');
    });

    it('should keep numeric-looking skill metadata as strings without requiring quotes', () => {
      const content = `---
name: 212
description: 123
---`;

      const result = parseSkillMarkdown(content);

      expect(result.error).toBeUndefined();
      expect(result.frontmatter.name).toBe('212');
      expect(result.frontmatter.description).toBe('123');
    });
  });
  // ==================== extractSkillMetadataFromMarkdown ====================
  describe('extractSkillMetadataFromMarkdown', () => {
    it('should extract trimmed name and optional description', () => {
      expect(
        extractSkillMetadataFromMarkdown(
          '---\nname:   writer  \ndescription:   Write docs  \n---\n# Body'
        )
      ).toEqual({ valid: true, name: 'writer', description: 'Write docs' });

      expect(extractSkillMetadataFromMarkdown('---\nname: minimal\n---\n')).toEqual({
        valid: true,
        name: 'minimal',
        description: ''
      });
    });

    it('should fail when frontmatter is missing or name is blank', () => {
      expect(extractSkillMetadataFromMarkdown('# No frontmatter')).toMatchObject({ valid: false });
      expect(extractSkillMetadataFromMarkdown('---\nname:   \ndescription: Desc\n---\n')).toEqual({
        valid: false,
        error: 'frontmatter name is required'
      });
    });
  });

  // ==================== findSkillMdEntries ====================
  describe('findSkillMdEntries', () => {
    it('should match SKILL.md recursively across depths, normalize ./, deduplicate, and sort', () => {
      const result = findSkillMdEntries([
        { path: 'skills/writer/helpers/review/SKILL.md', isDir: false, tag: 'deep' },
        { path: './SKILL.md', isDir: false, tag: 'root-first' },
        { path: 'SKILL.md', isDir: false, tag: 'root-dup' },
        { path: 'foo/skill.md', isDir: false, tag: 'lower' },
        { path: 'SKILLS/upper/SKILL.MD', isDir: false, tag: 'upper' },
        { path: 'README.md', isDir: false, tag: 'other' }
      ]);

      expect(result).toEqual([
        { path: 'foo/skill.md', isDir: false, tag: 'lower' },
        { path: 'SKILL.md', isDir: false, tag: 'root-first' },
        { path: 'SKILLS/upper/SKILL.MD', isDir: false, tag: 'upper' },
        { path: 'skills/writer/helpers/review/SKILL.md', isDir: false, tag: 'deep' }
      ]);
    });

    it('should skip pruned directories, directory entries, and literal backslash names', () => {
      const result = findSkillMdEntries([
        { path: 'node_modules/a/SKILL.md', isDir: false },
        { path: 'pkg/.venv/b/SKILL.md', isDir: false },
        { path: 'venv/c/SKILL.md', isDir: false },
        { path: 'skills/example/SKILL.md', isDir: true },
        { path: 'skills/trailing/SKILL.md/', isDir: false },
        { path: 'notes\\SKILL.md', isDir: false },
        { path: 'kept/SKILL.md', isDir: false }
      ]);

      expect(result.map((entry) => entry.path)).toEqual(['kept/SKILL.md']);
    });
  });
});
