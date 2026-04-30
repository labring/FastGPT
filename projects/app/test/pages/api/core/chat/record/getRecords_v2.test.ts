import { describe, it, expect } from 'vitest';
import { reorderAIResponseValue } from '@/pages/api/core/chat/record/getRecords_v2';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

// Helper to create a tool item with required fields
const createTool = (id: string, toolName: string) => ({
  id,
  toolName,
  toolAvatar: '',
  params: '',
  functionName: toolName,
  response: ''
});

describe('reorderAIResponseValue', () => {
  it('should return empty array for empty input', () => {
    const result = reorderAIResponseValue([]);
    expect(result).toEqual([]);
  });

  it('should return original array when no skill items exist', () => {
    const input: AIChatItemValueItemType[] = [
      { text: { content: 'Hello' } },
      { tools: [createTool('tool1', 'test')] }
    ];
    const result = reorderAIResponseValue(input);
    expect(result).toEqual(input);
  });

  it('should insert skill after matching tool', () => {
    const toolItem: AIChatItemValueItemType = {
      tools: [createTool('tool-call-1', 'readFile')]
    };
    const skillItem: AIChatItemValueItemType = {
      skills: [
        {
          id: 'tool-call-1',
          skillName: 'MySkill',
          skillAvatar: '',
          description: 'A skill',
          skillMdPath: '/work/skill/SKILL.md'
        }
      ]
    };
    const textItem: AIChatItemValueItemType = { text: { content: 'Result' } };

    const input = [toolItem, textItem, skillItem];
    const result = reorderAIResponseValue(input);

    // Skill should be inserted right after the matching tool
    expect(result).toEqual([toolItem, skillItem, textItem]);
  });

  it('should handle multiple tools and skills with correct matching', () => {
    const tool1: AIChatItemValueItemType = {
      tools: [createTool('call-1', 'tool1')]
    };
    const tool2: AIChatItemValueItemType = {
      tools: [createTool('call-2', 'tool2')]
    };
    const skill1: AIChatItemValueItemType = {
      skills: [
        {
          id: 'call-1',
          skillName: 'Skill1',
          skillAvatar: '',
          description: '',
          skillMdPath: '/skill1/SKILL.md'
        }
      ]
    };
    const skill2: AIChatItemValueItemType = {
      skills: [
        {
          id: 'call-2',
          skillName: 'Skill2',
          skillAvatar: '',
          description: '',
          skillMdPath: '/skill2/SKILL.md'
        }
      ]
    };

    const input = [tool1, tool2, skill1, skill2];
    const result = reorderAIResponseValue(input);

    // Each skill should follow its matching tool
    expect(result).toEqual([tool1, skill1, tool2, skill2]);
  });

  it('should append unmatched skills at the end', () => {
    const toolItem: AIChatItemValueItemType = {
      tools: [createTool('tool-1', 'test')]
    };
    const unmatchedSkill: AIChatItemValueItemType = {
      skills: [
        {
          id: 'no-match',
          skillName: 'OrphanSkill',
          skillAvatar: '',
          description: '',
          skillMdPath: '/orphan/SKILL.md'
        }
      ]
    };

    const input = [toolItem, unmatchedSkill];
    const result = reorderAIResponseValue(input);

    // Unmatched skill should be at the end
    expect(result).toEqual([toolItem, unmatchedSkill]);
  });

  it('should handle tool with multiple tool calls in one item', () => {
    const multiToolItem: AIChatItemValueItemType = {
      tools: [createTool('call-a', 'toolA'), createTool('call-b', 'toolB')]
    };
    const skillA: AIChatItemValueItemType = {
      skills: [
        {
          id: 'call-a',
          skillName: 'SkillA',
          skillAvatar: '',
          description: '',
          skillMdPath: '/a/SKILL.md'
        }
      ]
    };
    const skillB: AIChatItemValueItemType = {
      skills: [
        {
          id: 'call-b',
          skillName: 'SkillB',
          skillAvatar: '',
          description: '',
          skillMdPath: '/b/SKILL.md'
        }
      ]
    };

    const input = [multiToolItem, skillA, skillB];
    const result = reorderAIResponseValue(input);

    // Both skills should be inserted after the multi-tool item
    expect(result).toEqual([multiToolItem, skillA, skillB]);
  });

  it('should not duplicate skills when same id appears multiple times', () => {
    const tool1: AIChatItemValueItemType = {
      tools: [createTool('same-id', 'tool1')]
    };
    const tool2: AIChatItemValueItemType = {
      tools: [createTool('same-id', 'tool2')]
    };
    const skill: AIChatItemValueItemType = {
      skills: [
        {
          id: 'same-id',
          skillName: 'Skill',
          skillAvatar: '',
          description: '',
          skillMdPath: '/skill/SKILL.md'
        }
      ]
    };

    const input = [tool1, tool2, skill];
    const result = reorderAIResponseValue(input);

    // Skill should only appear once, after the first matching tool
    expect(result).toEqual([tool1, skill, tool2]);
  });

  it('should preserve non-tool non-skill items in order', () => {
    const text1: AIChatItemValueItemType = { text: { content: 'First' } };
    const reasoning: AIChatItemValueItemType = { reasoning: { content: 'Thinking...' } };
    const tool: AIChatItemValueItemType = {
      tools: [createTool('tool-1', 'test')]
    };
    const skill: AIChatItemValueItemType = {
      skills: [
        {
          id: 'tool-1',
          skillName: 'Skill',
          skillAvatar: '',
          description: '',
          skillMdPath: '/skill/SKILL.md'
        }
      ]
    };
    const text2: AIChatItemValueItemType = { text: { content: 'Last' } };

    const input = [text1, reasoning, tool, text2, skill];
    const result = reorderAIResponseValue(input);

    expect(result).toEqual([text1, reasoning, tool, skill, text2]);
  });

  it('should handle skill item with empty skills array as non-skill', () => {
    const itemWithEmptySkills: AIChatItemValueItemType = { skills: [] };
    const textItem: AIChatItemValueItemType = { text: { content: 'Hello' } };

    const input = [itemWithEmptySkills, textItem];
    const result = reorderAIResponseValue(input);

    // Empty skills array should be treated as non-skill item
    expect(result).toEqual(input);
  });

  it('should handle skill without id gracefully', () => {
    const tool: AIChatItemValueItemType = {
      tools: [createTool('tool-1', 'test')]
    };
    const skillWithoutId: AIChatItemValueItemType = {
      skills: [
        {
          id: '',
          skillName: 'NoIdSkill',
          skillAvatar: '',
          description: '',
          skillMdPath: '/skill/SKILL.md'
        }
      ]
    };

    const input = [tool, skillWithoutId];
    const result = reorderAIResponseValue(input);

    // Skill with empty id is not added to the map, so it won't be matched
    // and won't be appended at the end either (since skillId is falsy)
    expect(result).toEqual([tool]);
  });
});
