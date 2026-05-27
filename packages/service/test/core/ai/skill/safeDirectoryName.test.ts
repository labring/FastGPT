import { describe, expect, it } from 'vitest';
import { getSafeSkillDirectoryName } from '@fastgpt/service/core/ai/skill/utils';

describe('getSafeSkillDirectoryName', () => {
  it('should format normal English and Chinese names with spaces correctly', () => {
    expect(getSafeSkillDirectoryName('  My Test Skill  ')).toBe('My-Test-Skill');
    expect(getSafeSkillDirectoryName('测试技能 123')).toBe('测试技能-123');
    expect(getSafeSkillDirectoryName('微信_助手-App')).toBe('微信_助手-App');
  });

  it('should sanitize dangerous Shell characters', () => {
    expect(getSafeSkillDirectoryName('test; rm -rf /')).toBe('test-rm-rf');
    expect(getSafeSkillDirectoryName('skill$(whoami)')).toBe('skill-whoami');
    expect(getSafeSkillDirectoryName('name`id`test')).toBe('name-id-test');
    expect(getSafeSkillDirectoryName('my|pipe&run')).toBe('my-pipe-run');
  });

  it('should prevent path traversal escape', () => {
    expect(getSafeSkillDirectoryName('../../etc')).toBe('etc');
    expect(getSafeSkillDirectoryName('./local/dir/')).toBe('local-dir');
    expect(getSafeSkillDirectoryName('..')).toBe('skill');
    expect(getSafeSkillDirectoryName('.')).toBe('skill');
  });

  it('should merge consecutive delimiters and trim them from boundaries', () => {
    expect(getSafeSkillDirectoryName('---my__skill---')).toBe('my_skill');
    expect(getSafeSkillDirectoryName('my---skill___name')).toBe('my-skill_name');
  });

  it('should truncate the name to 50 characters', () => {
    const longName = 'a'.repeat(100);
    const result = getSafeSkillDirectoryName(longName);
    expect(result.length).toBe(50);
    expect(result).toBe('a'.repeat(50));
  });

  it('should fallback to default when sanitization results in empty string', () => {
    expect(getSafeSkillDirectoryName('   ')).toBe('skill');
    expect(getSafeSkillDirectoryName('!@#$%^&*()_+{}|:"<>?~`')).toBe('skill');
  });
});
