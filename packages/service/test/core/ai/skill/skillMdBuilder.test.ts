import { describe, expect, it } from 'vitest';
import { parseSkillMarkdown } from '@fastgpt/service/core/ai/skill/utils';

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
});
