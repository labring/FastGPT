import { describe, expect, it } from 'vitest';
import {
  validateSkillPackage,
  parseSkillPackage,
  sanitizeSkillName,
  createSkillTemplate
} from '@fastgpt/service/core/agentSkills/utils';
import { AgentSkillCategoryEnum } from '@fastgpt/global/core/agentSkills/constants';

describe('AgentSkill Utils', () => {
  // ==================== validateSkillPackage ====================
  describe('validateSkillPackage', () => {
    it('should validate valid package', () => {
      const packageData = {
        skill: {
          name: 'Test Skill',
          description: 'A test skill',
          category: [AgentSkillCategoryEnum.tool],
          config: { test: true }
        },
        markdown: '# Test Skill\n\nDescription'
      };

      const result = validateSkillPackage(packageData);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid package format', () => {
      const result = validateSkillPackage(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid package format');
    });

    it('should reject missing skill metadata', () => {
      const result = validateSkillPackage({ markdown: '# Test' });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing skill metadata');
    });

    it('should reject missing skill name', () => {
      const result = validateSkillPackage({
        skill: { description: 'A skill' },
        markdown: '# Test'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Skill name is required');
    });

    it('should reject empty skill name', () => {
      const result = validateSkillPackage({
        skill: { name: '   ' },
        markdown: '# Test'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Skill name is required');
    });

    it('should reject skill name exceeding 50 characters', () => {
      const result = validateSkillPackage({
        skill: { name: 'a'.repeat(51) },
        markdown: '# Test'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Skill name must be less than 50 characters');
    });

    it('should accept package without markdown field', () => {
      // markdown is not part of SkillPackageType, so it's not validated
      const result = validateSkillPackage({
        skill: { name: 'Test Skill' }
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept package with any extra fields', () => {
      // validateSkillPackage only checks skill.* fields, not additional fields
      const result = validateSkillPackage({
        skill: { name: 'Test Skill' },
        extraField: 'anything'
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject description exceeding 500 characters', () => {
      const result = validateSkillPackage({
        skill: {
          name: 'Test Skill',
          description: 'a'.repeat(501)
        },
        markdown: '# Test'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Description must be less than 500 characters');
    });

    it('should reject non-array category', () => {
      const result = validateSkillPackage({
        skill: {
          name: 'Test Skill',
          category: 'tool'
        },
        markdown: '# Test'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Category must be an array');
    });

    it('should reject invalid categories', () => {
      const result = validateSkillPackage({
        skill: {
          name: 'Test Skill',
          category: ['invalid_category', 'tool']
        },
        markdown: '# Test'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid categories');
      expect(result.error).toContain('invalid_category');
    });

    it('should accept valid categories', () => {
      const result = validateSkillPackage({
        skill: {
          name: 'Test Skill',
          category: [
            AgentSkillCategoryEnum.tool,
            AgentSkillCategoryEnum.search,
            AgentSkillCategoryEnum.coding
          ]
        },
        markdown: '# Test'
      });
      expect(result.valid).toBe(true);
    });

    it('should reject non-object config', () => {
      const result = validateSkillPackage({
        skill: {
          name: 'Test Skill',
          config: 'invalid'
        },
        markdown: '# Test'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Config must be an object');
    });
  });

  // ==================== parseSkillPackage ====================
  describe('parseSkillPackage', () => {
    it('should parse valid JSON string', () => {
      const packageData = {
        skill: {
          name: 'Test Skill',
          description: 'A test skill',
          category: [],
          config: {}
        },
        markdown: '# Test'
      };

      const result = parseSkillPackage(JSON.stringify(packageData));
      expect(result.success).toBe(true);
      expect(result.package).toEqual(packageData);
    });

    it('should parse valid object', () => {
      const packageData = {
        skill: {
          name: 'Test Skill',
          description: 'A test skill',
          category: [],
          config: {}
        },
        markdown: '# Test'
      };

      const result = parseSkillPackage(packageData);
      expect(result.success).toBe(true);
      expect(result.package).toEqual(packageData);
    });

    it('should return error for invalid JSON', () => {
      const result = parseSkillPackage('not valid json');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse skill package');
    });

    it('should return error for invalid package structure', () => {
      const result = parseSkillPackage({ skill: {}, markdown: '' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ==================== sanitizeSkillName ====================
  describe('sanitizeSkillName', () => {
    it('should trim whitespace', () => {
      expect(sanitizeSkillName('  Test Skill  ')).toBe('test_skill');
    });

    it('should convert to lowercase', () => {
      expect(sanitizeSkillName('TestSKILL')).toBe('testskill');
    });

    it('should replace special characters with underscore', () => {
      expect(sanitizeSkillName('test@skill#123')).toBe('test_skill_123');
    });

    it('should replace spaces with underscore', () => {
      expect(sanitizeSkillName('test skill name')).toBe('test_skill_name');
    });

    it('should collapse multiple underscores', () => {
      expect(sanitizeSkillName('test___skill')).toBe('test_skill');
    });

    it('should limit to 50 characters', () => {
      const longName = 'a'.repeat(60);
      expect(sanitizeSkillName(longName).length).toBe(50);
    });

    it('should preserve Chinese characters', () => {
      expect(sanitizeSkillName('测试技能')).toBe('测试技能');
    });

    it('should handle mixed Chinese and English', () => {
      expect(sanitizeSkillName('Test 技能 @ Name')).toBe('test_技能_name');
    });
  });

  // ==================== createSkillTemplate ====================
  describe('createSkillTemplate', () => {
    it('should create template with provided name', () => {
      const template = createSkillTemplate('My Skill');
      expect(template.skill.name).toBe('My Skill');
    });

    it('should create template with default name when empty', () => {
      const template = createSkillTemplate('');
      expect(template.skill.name).toBe('New Skill');
    });

    it('should have required structure', () => {
      const template = createSkillTemplate('Test');
      expect(template.skill.description).toBeDefined();
      expect(template.skill.category).toEqual(['other']);
      expect(template.skill.config).toEqual({});
    });
  });
});
