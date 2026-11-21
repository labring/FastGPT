import {
  buildPromptToolReferenceInfoMap,
  replaceAgentPromptToolReferences
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/adapter/prompt';
import { describe, expect, it } from 'vitest';

describe('replaceAgentPromptToolReferences', () => {
  it('resolves PromptEditor combined tool ids to readable names', () => {
    expect(
      replaceAgentPromptToolReferences({
        text: 'Use {{@mcp-app_1/search@}} first, keep {{@missing@}} unchanged.',
        resolveName: (id) => (id === 'app_1/search' ? 'Search documentation' : undefined)
      })
    ).toBe('Use {{Search documentation}} first, keep {{@missing@}} unchanged.');
  });

  it('folds multi-layer braces and only replaces the inner reference', () => {
    expect(
      replaceAgentPromptToolReferences({
        text: 'Use {{{{@mcp-app_1/search@}}}} first.',
        resolveName: (id) => (id === 'app_1/search' ? 'Search documentation' : undefined)
      })
    ).toBe('Use {{Search documentation}} first.');
  });

  it('folds multi-layer braces even when the tool is unknown', () => {
    expect(
      replaceAgentPromptToolReferences({
        text: 'Keep {{{{@missing@}}}} as a single layer.',
        resolveName: () => undefined
      })
    ).toBe('Keep {{@missing@}} as a single layer.');
  });

  it('resolves identity keys with a source prefix', () => {
    expect(
      replaceAgentPromptToolReferences({
        text: 'Use {{@mcp:app_1@}}.',
        resolveName: (id) => (id === 'mcp:app_1' ? 'MCP search' : undefined)
      })
    ).toBe('Use {{MCP search}}.');
  });

  it('keeps unknown single-layer references untouched', () => {
    expect(
      replaceAgentPromptToolReferences({
        text: 'Keep {{@missing@}} unchanged.',
        resolveName: () => undefined
      })
    ).toBe('Keep {{@missing@}} unchanged.');
  });
});

describe('buildPromptToolReferenceInfoMap', () => {
  it('keeps identity keys independent for the same id across sources', () => {
    const { referenceInfoMap: map, ambiguousLegacyIds } = buildPromptToolReferenceInfoMap([
      { promptReference: { id: 'system:tool-x', legacyId: 'tool-x', name: 'System X' } },
      { promptReference: { id: 'teamId:team-1:tool-x', legacyId: 'tool-x', name: 'Team X' } }
    ]);

    expect(map.get('system:tool-x')).toBe('System X');
    expect(map.get('teamId:team-1:tool-x')).toBe('Team X');
    // 同一裸 id 对应多个来源时不做猜测，保留原文。
    expect(map.has('tool-x')).toBe(false);
    expect(ambiguousLegacyIds.has('tool-x')).toBe(true);
    expect(
      replaceAgentPromptToolReferences({
        text: '{{@tool-x@}} and {{@system:tool-x@}}',
        resolveName: (id) => map.get(id),
        isAmbiguousReference: (id) => ambiguousLegacyIds.has(id)
      })
    ).toBe('{{@tool-x@}} and {{System X}}');
  });

  it('resolves a legacy bare id when it is globally unique', () => {
    const { referenceInfoMap: map, ambiguousLegacyIds } = buildPromptToolReferenceInfoMap([
      { promptReference: { id: 'teamId:team-1:tool-x', legacyId: 'tool-x', name: 'Team X' } }
    ]);

    expect(map.get('tool-x')).toBe('Team X');
    expect(ambiguousLegacyIds.size).toBe(0);
    expect(
      replaceAgentPromptToolReferences({
        text: '{{@tool-x@}}',
        resolveName: (id) => map.get(id),
        isAmbiguousReference: (id) => ambiguousLegacyIds.has(id)
      })
    ).toBe('{{Team X}}');
  });

  it('does not resolve a sourced reference through a bare-id tool', () => {
    const { referenceInfoMap: map, ambiguousLegacyIds } = buildPromptToolReferenceInfoMap([
      { promptReference: { id: 'tool-x', legacyId: 'tool-x', name: 'Bare X' } }
    ]);

    expect(
      replaceAgentPromptToolReferences({
        text: '{{@system:tool-x@}}',
        resolveName: (id) => map.get(id),
        isAmbiguousReference: (id) => ambiguousLegacyIds.has(id)
      })
    ).toBe('{{@system:tool-x@}}');
  });

  it('does not treat expanded toolset children sharing one parent reference as ambiguous', () => {
    // 工具集展开后每个子工具记录都携带同一个父级 promptReference（同 id / legacyId）。
    const toolsetReference = {
      id: 'system:team-toolset',
      legacyId: 'team-toolset',
      name: 'Team toolset'
    };
    const { referenceInfoMap: map, ambiguousLegacyIds } = buildPromptToolReferenceInfoMap([
      { promptReference: toolsetReference },
      { promptReference: { ...toolsetReference } }
    ]);

    expect(ambiguousLegacyIds.size).toBe(0);
    expect(map.get('system:team-toolset')).toBe('Team toolset');
    expect(map.get('team-toolset')).toBe('Team toolset');
    expect(
      replaceAgentPromptToolReferences({
        text: '{{@team-toolset@}}',
        resolveName: (id) => map.get(id),
        isAmbiguousReference: (id) => ambiguousLegacyIds.has(id)
      })
    ).toBe('{{Team toolset}}');
  });

  it('does not fall back to derived candidates for an ambiguous legacy key', () => {
    const { referenceInfoMap: map, ambiguousLegacyIds } = buildPromptToolReferenceInfoMap([
      {
        promptReference: {
          id: 'system:systemTool-report',
          legacyId: 'systemTool-report',
          name: 'System Report'
        }
      },
      {
        promptReference: {
          id: 'teamId:team-1:systemTool-report',
          legacyId: 'systemTool-report',
          name: 'Team Report'
        }
      }
    ]);

    expect(map.has('systemTool-report')).toBe(false);
    expect(ambiguousLegacyIds.has('systemTool-report')).toBe(true);

    const resolvedCandidates: string[] = [];
    const result = replaceAgentPromptToolReferences({
      text: '{{@systemTool-report@}}',
      isAmbiguousReference: (id) => ambiguousLegacyIds.has(id),
      // 模拟 `agent/index.ts` 的 getSubAppInfo 兜底：派生候选 `report` 能命中系统版运行时 ID。
      resolveName: (id) => {
        resolvedCandidates.push(id);
        return id === 'report' ? 'System Report Runtime' : map.get(id);
      }
    });

    // 歧义裸键直接保留原文，且不会继续尝试派生候选。
    expect(result).toBe('{{@systemTool-report@}}');
    expect(resolvedCandidates).not.toContain('report');
    expect(resolvedCandidates).toHaveLength(0);
  });

  it('normalizes padded reference keys before the ambiguity check', () => {
    const { referenceInfoMap: map, ambiguousLegacyIds } = buildPromptToolReferenceInfoMap([
      {
        promptReference: {
          id: 'system:systemTool-report',
          legacyId: 'systemTool-report',
          name: 'System Report'
        }
      },
      {
        promptReference: {
          id: 'teamId:team-1:systemTool-report',
          legacyId: 'systemTool-report',
          name: 'Team Report'
        }
      }
    ]);

    const resolvedCandidates: string[] = [];
    const result = replaceAgentPromptToolReferences({
      text: '{{@ systemTool-report @}}',
      isAmbiguousReference: (id) => ambiguousLegacyIds.has(id),
      resolveName: (id) => {
        resolvedCandidates.push(id);
        return id === 'report' ? 'System Report Runtime' : map.get(id);
      }
    });

    // 带空格的引用键同样命中歧义集合，原样保留且不生成派生候选。
    expect(result).toBe('{{@ systemTool-report @}}');
    expect(resolvedCandidates).toHaveLength(0);
  });

  it('still resolves a bare reference when only the system tool exists', () => {
    const withLegacyId = buildPromptToolReferenceInfoMap([
      {
        promptReference: {
          id: 'system:systemTool-report',
          legacyId: 'systemTool-report',
          name: 'System Report'
        }
      }
    ]);
    expect(withLegacyId.ambiguousLegacyIds.size).toBe(0);
    expect(
      replaceAgentPromptToolReferences({
        text: '{{@systemTool-report@}}',
        resolveName: (id) => withLegacyId.referenceInfoMap.get(id),
        isAmbiguousReference: (id) => withLegacyId.ambiguousLegacyIds.has(id)
      })
    ).toBe('{{System Report}}');
  });
});
