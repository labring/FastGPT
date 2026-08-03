import { describe, expect, it } from 'vitest';
import { CreateSkillBodySchema } from '@fastgpt/global/core/ai/skill/api';

describe('CreateSkillBodySchema - name validation', () => {
  it('rejects an empty name', () => {
    const result = CreateSkillBodySchema.safeParse({ parentId: null, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only name', () => {
    const result = CreateSkillBodySchema.safeParse({ parentId: null, name: '   ' });
    expect(result.success).toBe(false);
  });

  it('accepts a normal name', () => {
    const result = CreateSkillBodySchema.safeParse({ parentId: null, name: 'My Skill' });
    expect(result.success).toBe(true);
  });

  it('trims surrounding whitespace from a valid name', () => {
    const result = CreateSkillBodySchema.safeParse({ parentId: null, name: '  My Skill  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('My Skill');
    }
  });
});
