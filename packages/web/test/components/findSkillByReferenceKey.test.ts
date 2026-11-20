import { describe, expect, it } from 'vitest';
import { findSkillByReferenceKey } from '../../components/common/Textarea/PromptEditor/plugins/SkillLabelPlugin/match';

describe('findSkillByReferenceKey', () => {
  it('resolves a unique bare legacy key to the sourced tool identity', () => {
    const skills = [
      { id: 'system:systemTool-report', name: 'System Report' },
      { id: 'teamId:team-1:systemTool-other', name: 'Team Other' }
    ];

    expect(findSkillByReferenceKey(skills, 'systemTool-report')?.id).toBe(
      'system:systemTool-report'
    );
  });

  it('prefers an exact identity key match', () => {
    const skills = [
      { id: 'system:systemTool-report', name: 'System Report' },
      { id: 'teamId:team-1:systemTool-report', name: 'Team Report' }
    ];

    expect(findSkillByReferenceKey(skills, 'teamId:team-1:systemTool-report')?.id).toBe(
      'teamId:team-1:systemTool-report'
    );
  });

  it('does not guess when one bare key matches multiple sourced tools', () => {
    const skills = [
      { id: 'system:systemTool-report', name: 'System Report' },
      { id: 'teamId:team-1:systemTool-report', name: 'Team Report' }
    ];

    expect(findSkillByReferenceKey(skills, 'systemTool-report')).toBeUndefined();
    // 明确来源的引用仍各自命中对应来源。
    expect(findSkillByReferenceKey(skills, 'system:systemTool-report')?.id).toBe(
      'system:systemTool-report'
    );
    expect(findSkillByReferenceKey(skills, 'teamId:team-1:systemTool-report')?.id).toBe(
      'teamId:team-1:systemTool-report'
    );
  });

  it('does not let a bare key prefer a raw system id over a sourced team tool', () => {
    const skills = [
      { id: 'systemTool-report', pluginId: 'systemTool-report', name: 'System Report' },
      {
        id: 'teamId:team-1:systemTool-report',
        pluginId: 'systemTool-report',
        name: 'Team Report'
      }
    ];

    // 缺省 source 的裸 id 代表系统版；与团队版同 ID 时裸键必须视为歧义。
    expect(findSkillByReferenceKey(skills, 'systemTool-report')).toBeUndefined();
  });

  it('does not resolve a sourced reference to an unrelated bare-id tool', () => {
    const skills = [{ id: 'systemTool-report', name: 'Bare Report' }];

    expect(findSkillByReferenceKey(skills, 'system:systemTool-report')).toBeUndefined();
  });

  it('returns undefined for empty keys', () => {
    expect(findSkillByReferenceKey([{ id: 'system:tool-x' }], '   ')).toBeUndefined();
  });
});
