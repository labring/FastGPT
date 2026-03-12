import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildSkillMd,
  generateFrontmatter,
  validateSkillName,
  escapeYaml,
  sanitizeSkillNameForFile,
  parseFrontmatter,
  unescapeYaml,
  extractSkillNameFromSkillMd,
  extractDescriptionFromSkillMd,
  getSkillGuidance,
  generateSkillMd
} from '@fastgpt/service/core/agentSkills/skillMdBuilder';

// Mock createLLMResponse to avoid real LLM calls
vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: vi.fn()
}));

import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
const mockCreateLLMResponse = vi.mocked(createLLMResponse);

describe('skillMdBuilder', () => {
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

  // ==================== parseFrontmatter ====================
  describe('parseFrontmatter', () => {
    it('should parse valid frontmatter and body', () => {
      const content =
        '---\nname: my-skill\ndescription: A test skill\n---\n\n# Overview\nSome content.';
      const result = parseFrontmatter(content);

      expect(result.name).toBe('my-skill');
      expect(result.description).toBe('A test skill');
      expect(result.body).toBe('# Overview\nSome content.');
    });

    it('should parse frontmatter with no body', () => {
      const content = '---\nname: simple-skill\ndescription: Just a skill\n---\n';
      const result = parseFrontmatter(content);

      expect(result.name).toBe('simple-skill');
      expect(result.description).toBe('Just a skill');
      expect(result.body).toBe('');
    });

    it('should unescape quoted values in frontmatter', () => {
      const content = '---\nname: test-skill\ndescription: "Value with \\"quotes\\""\n---\n';
      const result = parseFrontmatter(content);

      expect(result.description).toBe('Value with "quotes"');
    });

    it('should throw on missing frontmatter', () => {
      const content = '# Just a markdown document\nNo frontmatter here.';
      expect(() => parseFrontmatter(content)).toThrow(
        'Invalid SKILL.md format: missing frontmatter'
      );
    });
  });

  // ==================== unescapeYaml ====================
  describe('unescapeYaml', () => {
    it('should return plain strings unchanged', () => {
      expect(unescapeYaml('plain-value')).toBe('plain-value');
    });

    it('should unescape double-quoted strings', () => {
      expect(unescapeYaml('"hello world"')).toBe('hello world');
    });

    it('should unescape escaped double quotes inside double-quoted strings', () => {
      expect(unescapeYaml('"say \\"hello\\""')).toBe('say "hello"');
    });

    it('should unescape single-quoted strings', () => {
      expect(unescapeYaml("'single quoted'")).toBe('single quoted');
    });

    it('should handle empty double-quoted string', () => {
      expect(unescapeYaml('""')).toBe('');
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

  // ==================== extractDescriptionFromSkillMd ====================
  describe('extractDescriptionFromSkillMd', () => {
    it('should extract description from valid frontmatter', () => {
      const content = '---\nname: my-skill\ndescription: A useful skill\n---\n';
      expect(extractDescriptionFromSkillMd(content)).toBe('A useful skill');
    });

    it('should return empty string when frontmatter is missing', () => {
      const content = '# No Frontmatter\n\nJust content.';
      expect(extractDescriptionFromSkillMd(content)).toBe('');
    });

    it('should return empty string when description field is absent', () => {
      const content = '---\nname: my-skill\n---\n';
      expect(extractDescriptionFromSkillMd(content)).toBe('');
    });
  });

  // ==================== getSkillGuidance ====================
  describe('getSkillGuidance', () => {
    beforeEach(() => {
      mockCreateLLMResponse.mockReset();
    });

    it('should parse structured JSON response from LLM', async () => {
      mockCreateLLMResponse.mockResolvedValue({
        answerText:
          '{"goal":"Summarize documents","workflow":"1. Read input\\n2. Summarize","requirements":"Max 200 words","examples":"Summarize this PDF"}',
        usage: { inputTokens: 100, outputTokens: 50 }
      } as any);

      const result = await getSkillGuidance(
        'summarize-doc',
        'Summarize documents',
        'Create a skill that summarizes documents into 200 words max',
        'gpt-4o'
      );

      expect(result.guidance.goal).toBe('Summarize documents');
      expect(result.guidance.workflow).toBe('1. Read input\n2. Summarize');
      expect(result.guidance.requirements).toBe('Max 200 words');
      expect(result.guidance.examples).toBe('Summarize this PDF');
      expect(result.usage.inputTokens).toBe(100);
      expect(result.usage.outputTokens).toBe(50);
    });

    it('should use description as goal fallback when LLM omits goal field', async () => {
      mockCreateLLMResponse.mockResolvedValue({
        answerText: '{"workflow":"Step 1"}',
        usage: { inputTokens: 80, outputTokens: 20 }
      } as any);

      const result = await getSkillGuidance(
        'test-skill',
        'My description',
        'Some requirements',
        'gpt-4o'
      );

      expect(result.guidance.goal).toBe('My description');
      expect(result.guidance.workflow).toBe('Step 1');
    });

    it('should fall back to name when description and goal are absent', async () => {
      mockCreateLLMResponse.mockResolvedValue({
        answerText: '{}',
        usage: { inputTokens: 50, outputTokens: 10 }
      } as any);

      const result = await getSkillGuidance('fallback-skill', '', 'Some requirements', 'gpt-4o');

      expect(result.guidance.goal).toBe('fallback-skill');
    });

    it('should handle JSON parse failure with graceful fallback', async () => {
      mockCreateLLMResponse.mockResolvedValue({
        answerText: 'This is not valid JSON at all!',
        usage: { inputTokens: 60, outputTokens: 15 }
      } as any);

      const result = await getSkillGuidance(
        'test-skill',
        'Test description',
        'Test requirements',
        'gpt-4o'
      );

      // Falls back to using description as goal, and keeps requirements
      expect(result.guidance.goal).toBe('Test description');
      expect(result.guidance.requirements).toBe('Test requirements');
      expect(result.usage.inputTokens).toBe(60);
    });

    it('should omit undefined optional fields from guidance', async () => {
      mockCreateLLMResponse.mockResolvedValue({
        answerText: '{"goal":"Only goal"}',
        usage: { inputTokens: 40, outputTokens: 10 }
      } as any);

      const result = await getSkillGuidance('skill', 'desc', 'reqs', 'gpt-4o');

      expect(result.guidance.goal).toBe('Only goal');
      expect(result.guidance.workflow).toBeUndefined();
      expect(result.guidance.requirements).toBeUndefined();
      expect(result.guidance.examples).toBeUndefined();
    });
  });

  // ==================== generateSkillMd ====================
  describe('generateSkillMd', () => {
    beforeEach(() => {
      mockCreateLLMResponse.mockReset();
    });

    it('should call LLM twice and return merged usage', async () => {
      // First call: getSkillGuidance
      mockCreateLLMResponse.mockResolvedValueOnce({
        answerText: '{"goal":"A code review skill","workflow":"1. Analyze\\n2. Comment"}',
        usage: { inputTokens: 200, outputTokens: 80 }
      } as any);

      // Second call: generateSkillMd
      const skillMdContent = `---\nname: code-review\ndescription: Review code and provide feedback\n---\n\n# Overview\nThis skill reviews code.\n\n# Instructions\n1. Analyze the code\n2. Provide feedback\n\n# Examples\nReview this function for bugs.`;
      mockCreateLLMResponse.mockResolvedValueOnce({
        answerText: skillMdContent,
        usage: { inputTokens: 500, outputTokens: 300 }
      } as any);

      const [content, usage] = await generateSkillMd({
        name: 'code-review',
        description: 'Review code',
        requirements: 'Analyze code quality and suggest improvements',
        model: 'gpt-4o'
      });

      expect(content).toBe(skillMdContent);
      // Usage should be sum of both LLM calls
      expect(usage.inputTokens).toBe(200 + 500);
      expect(usage.outputTokens).toBe(80 + 300);
      expect(mockCreateLLMResponse).toHaveBeenCalledTimes(2);
    });

    it('should pass skill name, description and requirements to guidance step', async () => {
      mockCreateLLMResponse.mockResolvedValueOnce({
        answerText: '{"goal":"Test goal"}',
        usage: { inputTokens: 100, outputTokens: 30 }
      } as any);
      mockCreateLLMResponse.mockResolvedValueOnce({
        answerText: '---\nname: test\ndescription: test\n---\n',
        usage: { inputTokens: 200, outputTokens: 100 }
      } as any);

      await generateSkillMd({
        name: 'test-skill',
        description: 'Test description',
        requirements: 'Test requirements',
        model: 'gpt-4o'
      });

      // First call is getSkillGuidance — verify messages include skill name/description/requirements
      const firstCallArgs = mockCreateLLMResponse.mock.calls[0][0];
      const userMessage = firstCallArgs.body.messages.find((m: any) => m.role === 'user') as
        | { content: string }
        | undefined;
      expect(userMessage?.content).toContain('test-skill');
      expect(userMessage?.content).toContain('Test description');
      expect(userMessage?.content).toContain('Test requirements');
    });

    it('should use gpt-4o model for both LLM calls', async () => {
      mockCreateLLMResponse.mockResolvedValueOnce({
        answerText: '{"goal":"Goal"}',
        usage: { inputTokens: 50, outputTokens: 20 }
      } as any);
      mockCreateLLMResponse.mockResolvedValueOnce({
        answerText: '---\nname: x\ndescription: x\n---\n',
        usage: { inputTokens: 100, outputTokens: 50 }
      } as any);

      await generateSkillMd({
        name: 'test',
        description: '',
        requirements: 'reqs',
        model: 'gpt-4o'
      });

      expect(mockCreateLLMResponse.mock.calls[0][0].body.model).toBe('gpt-4o');
      expect(mockCreateLLMResponse.mock.calls[1][0].body.model).toBe('gpt-4o');
    });

    it('should not include response_format in LLM request body', async () => {
      mockCreateLLMResponse.mockResolvedValueOnce({
        answerText: '{"goal":"Goal"}',
        usage: { inputTokens: 50, outputTokens: 20 }
      } as any);
      mockCreateLLMResponse.mockResolvedValueOnce({
        answerText: '---\nname: x\ndescription: x\n---\n',
        usage: { inputTokens: 100, outputTokens: 50 }
      } as any);

      await generateSkillMd({
        name: 'test',
        description: '',
        requirements: 'reqs',
        model: 'any-model'
      });

      // Neither call should use response_format (not all models support it)
      expect(mockCreateLLMResponse.mock.calls[0][0].body.response_format).toBeUndefined();
      expect(mockCreateLLMResponse.mock.calls[1][0].body.response_format).toBeUndefined();
    });
  });
});
