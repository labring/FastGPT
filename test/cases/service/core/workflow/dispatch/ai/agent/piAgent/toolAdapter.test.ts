import { describe, it, expect } from 'vitest';
import { resolveSkillDisplayName } from '@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent/toolAdapter';

describe('resolveSkillDisplayName', () => {
  it('should return undefined when skillPathMap is undefined', () => {
    const result = resolveSkillDisplayName({ paths: ['/work/skill/SKILL.md'] }, undefined);
    expect(result).toBeUndefined();
  });

  it('should return undefined when args.paths is undefined', () => {
    const result = resolveSkillDisplayName({ paths: undefined }, { '/work/skill/': 'TestSkill' });
    expect(result).toBeUndefined();
  });

  it('should return undefined when args.paths is empty', () => {
    const result = resolveSkillDisplayName({ paths: [] }, { '/work/skill/': 'TestSkill' });
    expect(result).toBeUndefined();
  });

  it('should return undefined when no path ends with /SKILL.md', () => {
    const result = resolveSkillDisplayName(
      { paths: ['/work/skill/README.md', '/work/skill/index.ts'] },
      { '/work/skill/': 'TestSkill' }
    );
    expect(result).toBeUndefined();
  });

  it('should skip non-string path entries', () => {
    const result = resolveSkillDisplayName(
      { paths: [123, null, undefined, '/work/skill/SKILL.md'] },
      { '/work/skill/SKILL.md': 'TestSkill' }
    );
    expect(result).toBe('加载 TestSkill 技能');
  });

  it('should skip paths containing path traversal characters', () => {
    const result = resolveSkillDisplayName(
      { paths: ['../../../etc/passwd/SKILL.md', '/work/skill/SKILL.md'] },
      { '/work/skill/SKILL.md': 'TestSkill' }
    );
    expect(result).toBe('加载 TestSkill 技能');
  });

  it('should return correct display name for exact SKILL.md match', () => {
    const result = resolveSkillDisplayName(
      { paths: ['/work/skill/SKILL.md'] },
      { '/work/skill/SKILL.md': 'TestSkill' }
    );
    expect(result).toBe('加载 TestSkill 技能');
  });

  it('should return correct display name for directory prefix match', () => {
    const result = resolveSkillDisplayName(
      { paths: ['/work/skill/subdir/SKILL.md'] },
      { '/work/skill/': 'TestSkill' }
    );
    expect(result).toBe('加载 TestSkill 技能');
  });

  it('should select the longest matching prefix when multiple keys match', () => {
    const skillPathMap = {
      '/work/skill-a/': 'SkillA',
      '/work/skill-a/sub-plugin/': 'SkillB'
    };
    const result = resolveSkillDisplayName(
      { paths: ['/work/skill-a/sub-plugin/SKILL.md'] },
      skillPathMap
    );
    // Should only match SkillB (the more specific/nested skill), not both
    expect(result).toBe('加载 SkillB 技能');
  });

  it('should select the longest matching prefix for deeply nested paths', () => {
    const skillPathMap = {
      '/work/base/': 'Base',
      '/work/base/level1/': 'Level1',
      '/work/base/level1/level2/': 'Level2'
    };
    const result = resolveSkillDisplayName(
      { paths: ['/work/base/level1/level2/SKILL.md'] },
      skillPathMap
    );
    expect(result).toBe('加载 Level2 技能');
  });

  it('should deduplicate skill names when multiple paths resolve to the same skill', () => {
    const result = resolveSkillDisplayName(
      { paths: ['/work/skill/SKILL.md', '/work/skill/sub/SKILL.md'] },
      { '/work/skill/SKILL.md': 'TestSkill', '/work/skill/': 'TestSkill' }
    );
    expect(result).toBe('加载 TestSkill 技能');
  });

  it('should join multiple distinct skill names with Chinese comma', () => {
    const result = resolveSkillDisplayName(
      { paths: ['/work/skill1/SKILL.md', '/work/skill2/SKILL.md'] },
      { '/work/skill1/SKILL.md': 'Skill1', '/work/skill2/SKILL.md': 'Skill2' }
    );
    expect(result).toBe('加载 Skill1，Skill2 技能');
  });

  it('should return undefined when no SKILL.md path matches any key', () => {
    const result = resolveSkillDisplayName(
      { paths: ['/work/unknown/SKILL.md'] },
      { '/work/skill/': 'TestSkill' }
    );
    expect(result).toBeUndefined();
  });
});
