import { describe, expect, it } from 'vitest';
import { CreateSkillBodySchema } from '@fastgpt/global/core/ai/skill/api';

/**
 * 回归：创建技能时「名称」必须稳定拦截空字符串与纯空格。
 *
 * 关联 bug：CreateSkillModal 点确认时，空名称会「闪一下」（预建空白标签页开/关）且无错误提示，
 * 纯空格则因客户端 required 不 trim、绕到服务端才报错。这里把校验下沉到共享的配置源
 * CreateSkillBodySchema，确保空串 / 纯空格在 schema 层即被拒绝。
 */
describe('CreateSkillBodySchema - name validation', () => {
  it('rejects an empty name', () => {
    const result = CreateSkillBodySchema.safeParse({ parentId: null, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only name', () => {
    const result = CreateSkillBodySchema.safeParse({ parentId: null, name: '   ' });
    expect(result.success).toBe(false);
  });

  it('accepts a normal name (legal/regression)', () => {
    const result = CreateSkillBodySchema.safeParse({ parentId: null, name: 'My Skill' });
    expect(result.success).toBe(true);
  });

  it('trims surrounding whitespace and accepts an otherwise-valid name (regression)', () => {
    const result = CreateSkillBodySchema.safeParse({ parentId: null, name: '  My Skill  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('My Skill');
    }
  });
});
