import { describe, expect, it } from 'vitest';
import {
  buildSkillMd,
  extractSkillNameFromSkillMd,
  parseSkillMarkdown,
  parseGitignoreRules
} from '@fastgpt/service/core/ai/skill/utils';

describe('skillMd utilities', () => {
  // ==================== buildSkillMd ====================
  describe('buildSkillMd', () => {
    it('should generate valid SKILL.md with frontmatter', () => {
      const result = buildSkillMd({
        name: 'my-skill',
        description: 'A test skill description'
      });

      // Should contain frontmatter
      expect(result).toMatch(/^---\n/);
      expect(result).toContain('name: my-skill');
      expect(result).toContain('description: A test skill description');
      expect(result).toMatch(/---$/);
    });

    it('should escape special characters in YAML frontmatter', () => {
      const result = buildSkillMd({
        name: 'test-skill',
        description: 'Description with "quotes" and [brackets]'
      });

      expect(result).toContain('description: "Description with \\"quotes\\" and [brackets]"');
    });

    it('should handle multi-line description', () => {
      const result = buildSkillMd({
        name: 'test-skill',
        description: 'Line 1\nLine 2\nLine 3'
      });

      // Multi-line strings should use YAML literal block
      expect(result).toContain('description: |');
      expect(result).toContain('  Line 1');
      expect(result).toContain('  Line 2');
      expect(result).toContain('  Line 3');
    });

    it('should handle empty description', () => {
      const result = buildSkillMd({
        name: 'test-skill',
        description: ''
      });

      expect(result).toContain('description: ""');
    });

    it('should only contain frontmatter without body', () => {
      const result = buildSkillMd({
        name: 'test-skill',
        description: 'Test'
      });

      // Result should be just frontmatter, no body content
      expect(result).toMatch(/^---\n[\s\S]+\n---$/);
      expect(result).toBe('---\nname: test-skill\ndescription: Test\n---');
    });
  });

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
      expect(result.frontmatter.description).toBe('A description');
      expect(result.frontmatter.metadata).toEqual({
        tags: ['test', 'skill'],
        author: 'FastGPT'
      });
      expect(result.frontmatter.version).toBe('1.0.0');
      expect(result.content.trim()).toBe('# Body content');
    });
  });

  // ==================== extractSkillNameFromSkillMd ====================
  describe('extractSkillNameFromSkillMd', () => {
    it('should extract name from valid frontmatter', () => {
      const content = '---\nname: my-skill\ndescription: A skill\n---\n\n# Overview';
      expect(extractSkillNameFromSkillMd(content)).toBe('my-skill');
    });

    it('should fall back to first heading when frontmatter is missing', () => {
      const content = '# My Skill Heading\n\nSome content here.';
      expect(extractSkillNameFromSkillMd(content)).toBe('my-skill-heading');
    });

    it('should return "unnamed-skill" when no frontmatter and no heading', () => {
      const content = 'Just plain text with no structure.';
      expect(extractSkillNameFromSkillMd(content)).toBe('unnamed-skill');
    });
  });

  // ==================== parseGitignoreRules ====================
  describe('parseGitignoreRules', () => {
    it('should handle empty gitignore lists', () => {
      const result = parseGitignoreRules([]);
      expect(result.customExcludes).toEqual([]);
      expect(result.pruneClause).toBe('');
    });

    it('should ignore comments and empty lines', () => {
      const gitignore = `
        # This is a comment
        
        # Another comment
      `;
      const result = parseGitignoreRules([gitignore]);
      expect(result.customExcludes).toEqual([]);
      expect(result.pruneClause).toBe('');
    });

    it('should parse directory pattern and generate find -name prune clauses', () => {
      const gitignore = `
        node_modules/
        dist
      `;
      const result = parseGitignoreRules([gitignore]);

      expect(result.customExcludes).toContain('node_modules/*');
      expect(result.customExcludes).toContain('*/node_modules/*');
      expect(result.customExcludes).toContain('dist/*');
      expect(result.customExcludes).toContain('*/dist/*');

      // Linux find prune command segment verification
      expect(result.pruneClause).toBe("-name 'node_modules' -o -name 'dist'");
    });

    it('should parse compound sub-path pattern and generate find -path prune clauses', () => {
      const gitignore = `
        packages/service/dist/
        packages/service/tmp/
      `;
      const result = parseGitignoreRules([gitignore]);

      expect(result.customExcludes).toContain('packages/service/dist/*');
      expect(result.customExcludes).toContain('packages/service/tmp/*');

      expect(result.pruneClause).toBe(
        "-path './packages/service/dist' -o -path './packages/service/tmp'"
      );
    });

    it('should parse standard files without path prunes', () => {
      const gitignore = `
        .env
        secrets.json
      `;
      const result = parseGitignoreRules([gitignore]);

      expect(result.customExcludes).toContain('.env');
      expect(result.customExcludes).toContain('*/.env');
      expect(result.customExcludes).toContain('secrets.json');
      expect(result.customExcludes).toContain('*/secrets.json');

      // Standard file matchings shouldn't be put into find's -prune directories list
      expect(result.pruneClause).toBe('');
    });
  });
});
