import { describe, expect, it } from 'vitest';
import {
  buildSkillMd,
  generateFrontmatter,
  validateSkillName,
  escapeYaml,
  sanitizeSkillNameForFile
} from '@fastgpt/service/core/agentSkill/skillMdBuilder';

describe('skillMdBuilder', () => {
  // ==================== buildSkillMd ====================
  describe('buildSkillMd', () => {
    it('should generate valid SKILL.md with frontmatter and body', () => {
      const result = buildSkillMd({
        name: 'my-skill',
        description: 'A test skill description',
        markdown: '# Introduction\n\nThis is the skill documentation.'
      });

      // Should contain frontmatter
      expect(result).toMatch(/^---\n/);
      expect(result).toContain('name: my-skill');
      expect(result).toContain('description: A test skill description');
      expect(result).toContain('---\n\n');

      // Should contain markdown body
      expect(result).toContain('# Introduction');
      expect(result).toContain('This is the skill documentation.');
    });

    it('should escape special characters in YAML frontmatter', () => {
      const result = buildSkillMd({
        name: 'test-skill',
        description: 'Description with "quotes" and [brackets]',
        markdown: '# Test'
      });

      expect(result).toContain('description: "Description with \\"quotes\\" and [brackets]"');
    });

    it('should handle multi-line description', () => {
      const result = buildSkillMd({
        name: 'test-skill',
        description: 'Line 1\nLine 2\nLine 3',
        markdown: '# Test'
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
        description: '',
        markdown: '# Test'
      });

      expect(result).toContain('description: ""');
    });

    it('should preserve markdown formatting in body', () => {
      const markdown = `# Heading 1

## Heading 2

- List item 1
- List item 2

\`\`\`typescript
const x = 1;
\`\`\`

> Blockquote`;

      const result = buildSkillMd({
        name: 'test-skill',
        description: 'Test',
        markdown
      });

      expect(result).toContain('# Heading 1');
      expect(result).toContain('## Heading 2');
      expect(result).toContain('- List item 1');
      expect(result).toContain('```typescript');
      expect(result).toContain('> Blockquote');
    });
  });

  // ==================== generateFrontmatter ====================
  describe('generateFrontmatter', () => {
    it('should generate valid YAML frontmatter', () => {
      const result = generateFrontmatter('my-skill', 'A description');

      expect(result).toBe('---\nname: my-skill\ndescription: A description\n---');
    });

    it('should handle special characters in name', () => {
      const result = generateFrontmatter('skill-with-123', 'Test');
      expect(result).toContain('name: skill-with-123');
    });
  });

  // ==================== validateSkillName ====================
  describe('validateSkillName', () => {
    it('should return true for valid names', () => {
      expect(validateSkillName('my-skill')).toBe(true);
      expect(validateSkillName('skill123')).toBe(true);
      expect(validateSkillName('a')).toBe(true);
      expect(validateSkillName('skill-with-many-words')).toBe(true);
    });

    it('should return false for names with uppercase', () => {
      expect(validateSkillName('MySkill')).toBe(false);
      expect(validateSkillName('mySkill')).toBe(false);
    });

    it('should return false for names starting with hyphen', () => {
      expect(validateSkillName('-skill')).toBe(false);
    });

    it('should return false for names ending with hyphen', () => {
      expect(validateSkillName('skill-')).toBe(false);
    });

    it('should return false for names with consecutive hyphens', () => {
      expect(validateSkillName('skill--name')).toBe(false);
    });

    it('should return false for names with special characters', () => {
      expect(validateSkillName('skill@name')).toBe(false);
      expect(validateSkillName('skill_name')).toBe(false);
      expect(validateSkillName('skill.name')).toBe(false);
      expect(validateSkillName('skill/name')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(validateSkillName('')).toBe(false);
    });

    it('should return false for names longer than 64 characters', () => {
      expect(validateSkillName('a'.repeat(65))).toBe(false);
      expect(validateSkillName('a'.repeat(64))).toBe(true);
    });
  });

  // ==================== escapeYaml ====================
  describe('escapeYaml', () => {
    it('should return simple strings as-is', () => {
      expect(escapeYaml('simple')).toBe('simple');
      expect(escapeYaml('hello world')).toBe('hello world');
    });

    it('should escape double quotes', () => {
      expect(escapeYaml('say "hello"')).toBe('"say \\"hello\\""');
    });

    it('should wrap strings with special characters in double quotes', () => {
      expect(escapeYaml('value: with colon')).toBe('"value: with colon"');
      expect(escapeYaml('value#with hash')).toBe('"value#with hash"');
      expect(escapeYaml('{brackets}')).toBe('"{brackets}"');
    });

    it('should handle empty string', () => {
      expect(escapeYaml('')).toBe('""');
    });

    it('should handle strings with newlines', () => {
      expect(escapeYaml('line1\nline2')).toBe('|\n  line1\n  line2');
    });
  });

  // ==================== sanitizeSkillNameForFile ====================
  describe('sanitizeSkillNameForFile', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeSkillNameForFile('MySkill')).toBe('myskill');
    });

    it('should replace spaces with hyphens', () => {
      expect(sanitizeSkillNameForFile('my skill name')).toBe('my-skill-name');
    });

    it('should replace underscores with hyphens', () => {
      expect(sanitizeSkillNameForFile('my_skill_name')).toBe('my-skill-name');
    });

    it('should remove invalid characters', () => {
      expect(sanitizeSkillNameForFile('skill@#$%^&*()name')).toBe('skillname');
    });

    it('should collapse multiple hyphens', () => {
      expect(sanitizeSkillNameForFile('skill---name')).toBe('skill-name');
    });

    it('should trim leading and trailing hyphens', () => {
      expect(sanitizeSkillNameForFile('-skill-name-')).toBe('skill-name');
    });

    it('should limit to 64 characters', () => {
      const longName = 'a'.repeat(100);
      expect(sanitizeSkillNameForFile(longName).length).toBe(64);
    });
  });
});
