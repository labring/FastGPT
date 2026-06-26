import { describe, expect, it } from 'vitest';
import { topAgentParamsSchema } from '@fastgpt/global/core/chat/helperBot/topAgent/type';

describe('topAgentParamsSchema', () => {
  it('should validate empty object', () => {
    const result = topAgentParamsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate full params', () => {
    const result = topAgentParamsSchema.safeParse({
      role: 'assistant',
      taskObject: 'Help user with coding',
      systemPrompt: 'You are a helpful assistant',
      selectedTools: ['tool1', 'tool2'],
      selectedDatasets: ['dataset1'],
      selectedAgentSkills: [
        {
          skillId: 'skill1',
          name: 'Research Skill',
          description: 'Research workflow',
          isDeleted: false
        }
      ],
      fileUpload: true
    });
    expect(result.success).toBe(true);
  });

  it('should validate partial params', () => {
    const result = topAgentParamsSchema.safeParse({
      role: 'assistant',
      fileUpload: false
    });
    expect(result.success).toBe(true);
  });

  it('should allow null values for optional fields', () => {
    const result = topAgentParamsSchema.safeParse({
      role: null,
      taskObject: null,
      systemPrompt: null,
      selectedTools: null,
      selectedDatasets: null,
      selectedAgentSkills: null,
      fileUpload: null
    });
    expect(result.success).toBe(true);
  });

  it('should validate selectedTools as string array', () => {
    const result = topAgentParamsSchema.safeParse({
      selectedTools: ['tool1', 'tool2', 'tool3']
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selectedTools).toHaveLength(3);
    }
  });

  it('should validate selectedDatasets as string array', () => {
    const result = topAgentParamsSchema.safeParse({
      selectedDatasets: ['dataset1', 'dataset2']
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selectedDatasets).toHaveLength(2);
    }
  });

  it('should validate selectedAgentSkills as selected skill item array', () => {
    const result = topAgentParamsSchema.safeParse({
      selectedAgentSkills: [
        {
          skillId: 'skill1',
          name: 'Research Skill',
          description: 'Research workflow'
        }
      ]
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selectedAgentSkills).toHaveLength(1);
      expect(result.data.selectedAgentSkills?.[0]?.isDeleted).toBe(false);
    }
  });

  it('should reject invalid selectedTools type', () => {
    const result = topAgentParamsSchema.safeParse({
      selectedTools: 'not-an-array'
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid selectedAgentSkills type', () => {
    const result = topAgentParamsSchema.safeParse({
      selectedAgentSkills: ['skill1']
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid fileUpload type', () => {
    const result = topAgentParamsSchema.safeParse({
      fileUpload: 'not-a-boolean'
    });
    expect(result.success).toBe(false);
  });
});
