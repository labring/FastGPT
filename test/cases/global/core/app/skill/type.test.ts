import { describe, it, expect } from 'vitest';
import {
  SkillTemplateSchema,
  SkillConfigSchema,
  SkillManifestSchema,
  SkillCategoryEnum
} from '@fastgpt/global/core/app/skill/type';
import {
  builtInSkillTemplates,
  getSkillTemplateById
} from '@fastgpt/global/core/app/skill/constants';

describe('Skill Type Validation', () => {
  describe('SkillTemplateSchema', () => {
    it('should validate valid skill template', () => {
      const validTemplate = {
        id: 'test-skill',
        name: 'Test Skill',
        description: 'A test skill',
        avatar: 'core/app/type/agentFill',
        author: 'Test Author',
        version: '1.0.0',
        tags: ['test'],
        category: SkillCategoryEnum.coding
      };

      const result = SkillTemplateSchema.safeParse(validTemplate);
      expect(result.success).toBe(true);
    });

    it('should fail on missing required fields', () => {
      const invalidTemplate = {
        id: 'test-skill',
        name: 'Test Skill'
      };

      const result = SkillTemplateSchema.safeParse(invalidTemplate);
      expect(result.success).toBe(false);
    });
  });

  describe('SkillConfigSchema', () => {
    it('should validate valid skill config', () => {
      const validConfig = {
        systemPrompt: 'You are a helpful assistant.',
        tools: ['tool-1', 'tool-2'],
        variables: [
          {
            key: 'name',
            label: 'Name',
            type: 'input' as const,
            required: false
          }
        ],
        datasetIds: ['dataset-1'],
        model: 'gpt-4',
        temperature: 0.7,
        maxHistories: 10
      };

      const result = SkillConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should accept minimal config', () => {
      const minimalConfig = {
        systemPrompt: 'You are a helpful assistant.'
      };

      const result = SkillConfigSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);
      expect(result.data?.tools).toEqual([]);
      expect(result.data?.variables).toEqual([]);
    });
  });

  describe('SkillManifestSchema', () => {
    it('should validate complete skill manifest', () => {
      const validManifest = {
        id: 'test-skill',
        name: 'Test Skill',
        description: 'A test skill',
        avatar: 'core/app/type/agentFill',
        author: 'Test Author',
        version: '1.0.0',
        tags: ['test'],
        category: SkillCategoryEnum.research,
        config: {
          systemPrompt: 'You are a helpful assistant.',
          tools: [],
          variables: []
        }
      };

      const result = SkillManifestSchema.safeParse(validManifest);
      expect(result.success).toBe(true);
    });
  });
});

describe('Built-in Skill Templates', () => {
  it('should have at least 3 built-in skills', () => {
    expect(builtInSkillTemplates.length).toBeGreaterThanOrEqual(3);
  });

  it('should have unique ids', () => {
    const ids = builtInSkillTemplates.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have coding assistant skill', () => {
    const skill = getSkillTemplateById('skill-coding-assistant');
    expect(skill).toBeDefined();
    expect(skill?.category).toBe(SkillCategoryEnum.coding);
    expect(skill?.config.variables.length).toBeGreaterThan(0);
  });

  it('should have doc-qa skill', () => {
    const skill = getSkillTemplateById('skill-doc-qa');
    expect(skill).toBeDefined();
    expect(skill?.category).toBe(SkillCategoryEnum.research);
  });

  it('should have customer service skill', () => {
    const skill = getSkillTemplateById('skill-customer-service');
    expect(skill).toBeDefined();
    expect(skill?.category).toBe(SkillCategoryEnum.customerService);
  });

  it('should return undefined for non-existent skill', () => {
    const skill = getSkillTemplateById('non-existent-skill');
    expect(skill).toBeUndefined();
  });
});

describe('SkillCategoryEnum', () => {
  it('should have all expected categories', () => {
    expect(SkillCategoryEnum.writing).toBe('writing');
    expect(SkillCategoryEnum.coding).toBe('coding');
    expect(SkillCategoryEnum.research).toBe('research');
    expect(SkillCategoryEnum.customerService).toBe('customer-service');
    expect(SkillCategoryEnum.dataAnalysis).toBe('data-analysis');
  });
});
