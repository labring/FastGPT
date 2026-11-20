import { describe, expect, it } from 'vitest';
import {
  createToolReferenceRegExp,
  getTeamPluginSource,
  getToolIdentityKey,
  getToolNameCandidates,
  getToolRawId,
  getToolReferenceKeyCandidates,
  getToolSetChildDescription,
  hasDebugToolInNodes,
  hasDebugToolInSelectedTools,
  isSourcedToolReferenceKey,
  isTeamPluginSource,
  mergeToolSetChildDescriptions,
  normalizeToolReferenceBraces,
  parseDebugToolSource,
  parseTeamPluginSource,
  parseToolReferenceKey,
  parseToolsetToolId,
  shouldUseLegacyToolDescriptionFallback,
  splitCombineToolId,
  splitToolsetToolPluginId
} from '@fastgpt/global/core/app/tool/utils';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

describe('tool set child descriptions', () => {
  it('uses definitions for falsy values except an explicitly empty description', () => {
    expect(getToolSetChildDescription(undefined, 'Definition description')).toBe(
      'Definition description'
    );
    expect(getToolSetChildDescription(null, 'Definition description')).toBe(
      'Definition description'
    );
    expect(getToolSetChildDescription(false, 'Definition description')).toBe(
      'Definition description'
    );
    expect(getToolSetChildDescription(0, 'Definition description')).toBe('Definition description');
    expect(getToolSetChildDescription('', 'Definition description')).toBe('');
    expect(getToolSetChildDescription('  ', 'Definition description')).toBe('  ');
    expect(getToolSetChildDescription(' Custom description ', 'Definition description')).toBe(
      ' Custom description '
    );
  });

  it('preserves saved system descriptions by tool id and external descriptions by name', () => {
    const savedToolConfig = {
      systemToolSet: {
        toolId: 'system-tool-set',
        toolList: [
          { toolId: 'search', name: 'Old search', description: 'Custom system description' },
          { toolId: 'removed', name: 'Removed', description: 'Removed description' }
        ]
      },
      mcpToolSet: {
        url: 'https://example.com/mcp',
        toolList: [
          { name: 'search', description: 'Custom MCP description' },
          { name: 'blank', description: '  ' }
        ]
      },
      httpToolSet: {
        toolList: [
          { name: 'search', description: 'Custom HTTP description' },
          { name: 'blank', description: '' }
        ]
      }
    } as any;
    const templateToolConfig = {
      systemToolSet: {
        toolId: 'system-tool-set',
        toolList: [
          { toolId: 'search', name: 'New search', description: 'System default' },
          { toolId: 'new', name: 'New', description: 'New system default' }
        ]
      },
      mcpToolSet: {
        url: 'https://example.com/mcp',
        toolList: [
          { name: 'search', description: 'MCP default' },
          { name: 'blank', description: 'Blank MCP default' },
          { name: 'new', description: 'New MCP default' }
        ]
      },
      httpToolSet: {
        toolList: [
          { name: 'search', description: 'HTTP default' },
          { name: 'blank', description: 'Blank HTTP default' },
          { name: 'new', description: 'New HTTP default' }
        ]
      }
    } as any;

    expect(mergeToolSetChildDescriptions({ savedToolConfig, templateToolConfig })).toMatchObject({
      systemToolSet: {
        toolList: [
          { toolId: 'search', description: 'Custom system description' },
          { toolId: 'new', description: 'New system default' }
        ]
      },
      mcpToolSet: {
        toolList: [
          { name: 'search', description: 'Custom MCP description' },
          { name: 'blank', description: '  ' },
          { name: 'new', description: 'New MCP default' }
        ]
      },
      httpToolSet: {
        toolList: [
          { name: 'search', description: 'Custom HTTP description' },
          { name: 'blank', description: '' },
          { name: 'new', description: 'New HTTP default' }
        ]
      }
    });
  });
});

describe('shouldUseLegacyToolDescriptionFallback', () => {
  it('only enables fallback for workflow, system and commercial tools', () => {
    expect(
      shouldUseLegacyToolDescriptionFallback({
        toolId: 'personal-tool',
        flowNodeType: FlowNodeTypeEnum.pluginModule
      })
    ).toBe(true);
    expect(shouldUseLegacyToolDescriptionFallback({ toolId: 'systemTool-search' })).toBe(true);
    expect(shouldUseLegacyToolDescriptionFallback({ toolId: 'commercial-search' })).toBe(true);
    expect(shouldUseLegacyToolDescriptionFallback({ toolId: 'mcp-app/search' })).toBe(false);
    expect(shouldUseLegacyToolDescriptionFallback({ toolId: 'http-app/search' })).toBe(false);
  });
});

describe('splitCombineToolId', () => {
  describe('personal tools (pure ObjectId)', () => {
    it('should parse pure ObjectId as personal tool', () => {
      const result = splitCombineToolId('507f1f77bcf86cd799439011');

      expect(result.source).toBe(AppToolSourceEnum.personal);
      expect(result.pluginId).toBe('507f1f77bcf86cd799439011');
    });

    it('should handle short ObjectId', () => {
      const result = splitCombineToolId('abc123');

      expect(result.source).toBe(AppToolSourceEnum.personal);
      expect(result.pluginId).toBe('abc123');
    });
  });

  describe('personal tools with prefix', () => {
    it('should parse personal-xxx format correctly', () => {
      const result = splitCombineToolId('personal-507f1f77bcf86cd799439011');

      expect(result.source).toBe(AppToolSourceEnum.personal);
      expect(result.pluginId).toBe('507f1f77bcf86cd799439011');
    });
  });

  describe('commercial tools', () => {
    it('should parse commercial-xxx format correctly', () => {
      const result = splitCombineToolId('commercial-507f1f77bcf86cd799439011');

      expect(result.source).toBe(AppToolSourceEnum.commercial);
      expect(result.pluginId).toBe('507f1f77bcf86cd799439011');
    });

    it('should convert commercial-dalle3 to systemTool(Adapt)', () => {
      const result = splitCombineToolId('commercial-dalle3');

      expect(result.source).toBe(AppToolSourceEnum.systemTool);
      expect(result.pluginId).toBe('dalle3');
    });
  });

  describe('systemTool tools', () => {
    it('should parse systemTool-xxx format correctly', () => {
      const result = splitCombineToolId('systemTool-websearch');

      expect(result.source).toBe(AppToolSourceEnum.systemTool);
      expect(result.pluginId).toBe('websearch');
    });

    it('should handle systemTool with complex id', () => {
      const result = splitCombineToolId('systemTool-code-interpreter');

      expect(result.source).toBe(AppToolSourceEnum.systemTool);
      expect(result.pluginId).toBe('code-interpreter');
    });
  });

  describe('mcp tools', () => {
    it('should parse mcp-appId format correctly', () => {
      const result = splitCombineToolId('mcp-507f1f77bcf86cd799439011');

      expect(result.source).toBe(AppToolSourceEnum.mcp);
      expect(result.pluginId).toBe('507f1f77bcf86cd799439011');
      expect(result.authAppId).toBe('507f1f77bcf86cd799439011');
    });

    it('should parse mcp-appId/toolName format correctly', () => {
      const result = splitCombineToolId('mcp-507f1f77bcf86cd799439011/searchTool');

      expect(result.source).toBe(AppToolSourceEnum.mcp);
      expect(result.pluginId).toBe('507f1f77bcf86cd799439011/searchTool');
      expect(result.authAppId).toBe('507f1f77bcf86cd799439011');
    });
  });

  describe('http tools', () => {
    it('should parse http-parentId format correctly', () => {
      const result = splitCombineToolId('http-507f1f77bcf86cd799439011');

      expect(result.source).toBe(AppToolSourceEnum.http);
      expect(result.pluginId).toBe('507f1f77bcf86cd799439011');
      expect(result.authAppId).toBe('507f1f77bcf86cd799439011');
    });

    it('should parse http-parentId/toolName format correctly', () => {
      const result = splitCombineToolId('http-507f1f77bcf86cd799439011/apiTool');

      expect(result.source).toBe(AppToolSourceEnum.http);
      expect(result.pluginId).toBe('507f1f77bcf86cd799439011/apiTool');
    });
  });

  describe('deprecated community tools', () => {
    it('should convert community-xxx to systemTool', () => {
      const result = splitCombineToolId('community-oldPlugin');

      expect(result.source).toBe(AppToolSourceEnum.systemTool);
      expect(result.pluginId).toBe('oldPlugin');
    });
  });

  describe('error handling', () => {
    it('should throw error when pluginId is empty after split', () => {
      expect(() => splitCombineToolId('commercial-')).toThrow('toolId not found');
    });
  });
});

describe('parseDebugToolSource', () => {
  it('should parse stable tmb debug source', () => {
    expect(parseDebugToolSource('debug:tmbId:tmb-1')).toEqual({
      tmbId: 'tmb-1'
    });
  });

  it('should ignore invalid debug source', () => {
    expect(parseDebugToolSource('debug:invalid')).toBeUndefined();
    expect(parseDebugToolSource('debug:tmbId:tmb-1:session:dbg-1')).toBeUndefined();
    expect(parseDebugToolSource('system')).toBeUndefined();
  });

  it('does not parse debug source from combined tool id', () => {
    expect(() => splitCombineToolId('debug:tmbId:tmb-1|weather')).toThrow('Invalid tool id');
  });
});

describe('team plugin source', () => {
  it('builds and parses a stable team source', () => {
    const source = getTeamPluginSource('team-1');

    expect(source).toBe('teamId:team-1');
    expect(isTeamPluginSource(source)).toBe(true);
    expect(parseTeamPluginSource(source)).toEqual({ teamId: 'team-1' });
  });

  it('rejects malformed team sources', () => {
    expect(parseTeamPluginSource('team')).toBeUndefined();
    expect(parseTeamPluginSource('teamId:team-1:extra')).toBeUndefined();
    expect(parseTeamPluginSource('system')).toBeUndefined();
  });
});

describe('getToolIdentityKey', () => {
  it('keeps system and team tools with the same id distinct', () => {
    const id = 'systemTool-weather';
    const systemKey = getToolIdentityKey(id, 'system');
    const teamKey = getToolIdentityKey(id, 'teamId:team-1');

    expect(systemKey).not.toBe(teamKey);
  });

  it('treats missing source as system source', () => {
    expect(getToolIdentityKey('systemTool-weather', undefined)).toBe(
      getToolIdentityKey('systemTool-weather', 'system')
    );
  });
});

describe('debug tool detection', () => {
  it('detects explicit debug source in selected tools', () => {
    expect(
      hasDebugToolInSelectedTools([
        {
          id: 'node-id',
          pluginId: 'systemTool-weather',
          source: 'debug:tmbId:tmb-1'
        } as any
      ])
    ).toBe(true);
  });

  it('ignores debug-looking ids without explicit debug source', () => {
    expect(
      hasDebugToolInSelectedTools([
        {
          id: 'debug:tmbId:tmb-1|node-id',
          pluginId: 'debug:tmbId:tmb-1|weather'
        } as any
      ])
    ).toBe(false);
  });

  it('detects explicit debug source in workflow nodes', () => {
    expect(
      hasDebugToolInNodes([
        {
          pluginId: 'systemTool-weather',
          source: 'debug:tmbId:tmb-1',
          inputs: []
        } as any
      ])
    ).toBe(true);
  });
});

describe('getToolRawId', () => {
  it('should return pluginId for pure ObjectId', () => {
    const result = getToolRawId('507f1f77bcf86cd799439011');
    expect(result).toBe('507f1f77bcf86cd799439011');
  });

  it('should return pluginId for commercial tool', () => {
    const result = getToolRawId('commercial-507f1f77bcf86cd799439011');
    expect(result).toBe('507f1f77bcf86cd799439011');
  });

  it('should return parentId for mcp tool with toolName', () => {
    const result = getToolRawId('mcp-507f1f77bcf86cd799439011/searchTool');
    expect(result).toBe('507f1f77bcf86cd799439011');
  });

  it('should return parentId for http tool with toolName', () => {
    const result = getToolRawId('http-507f1f77bcf86cd799439011/apiTool');
    expect(result).toBe('507f1f77bcf86cd799439011');
  });

  it('should handle systemTool correctly', () => {
    const result = getToolRawId('systemTool-websearch');
    expect(result).toBe('websearch');
  });

  it('should handle personal tool with prefix', () => {
    const result = getToolRawId('personal-507f1f77bcf86cd799439011');
    expect(result).toBe('507f1f77bcf86cd799439011');
  });

  it('should handle converted community tool', () => {
    const result = getToolRawId('community-oldPlugin');
    expect(result).toBe('oldPlugin');
  });
});

describe('splitToolsetToolPluginId', () => {
  it('should preserve slashes inside tool name', () => {
    const result = splitToolsetToolPluginId('toolset-abc/namespace/nestedTool');

    expect(result).toEqual({
      parentId: 'toolset-abc',
      toolName: 'namespace/nestedTool'
    });
  });

  it('should preserve leading slash in tool name', () => {
    const result = splitToolsetToolPluginId('69e20f48dbec7c6ece77556b//test');

    expect(result).toEqual({
      parentId: '69e20f48dbec7c6ece77556b',
      toolName: '/test'
    });
  });
});

describe('parseToolsetToolId', () => {
  it('should parse combined HTTP tool id and preserve leading slash in tool name', () => {
    const result = parseToolsetToolId('http-69e20f48dbec7c6ece77556b//test');

    expect(result).toEqual({
      parentId: '69e20f48dbec7c6ece77556b',
      toolName: '/test'
    });
  });
});

describe('getToolNameCandidates', () => {
  it('should prefer full tool name and fallback to last segment for legacy ids', () => {
    expect(getToolNameCandidates('toolset/tool')).toEqual(['toolset/tool', 'tool']);
  });

  it('should preserve leading slash name before fallback', () => {
    expect(getToolNameCandidates('/test')).toEqual(['/test', 'test']);
  });
});

describe('parseToolReferenceKey', () => {
  it('parses explicit sources', () => {
    expect(parseToolReferenceKey('system:systemTool-report')).toEqual({
      source: 'system',
      id: 'systemTool-report'
    });
    expect(parseToolReferenceKey('teamId:team-1:systemTool-report')).toEqual({
      source: 'teamId:team-1',
      id: 'systemTool-report'
    });
    expect(parseToolReferenceKey('debug:tmbId:tmb-1:systemTool-report')).toEqual({
      source: 'debug:tmbId:tmb-1',
      id: 'systemTool-report'
    });
  });

  it('keeps combined and bare ids without a source', () => {
    expect(parseToolReferenceKey('mcp-app_1/search')).toEqual({ id: 'mcp-app_1/search' });
    expect(parseToolReferenceKey('6afff3db9958f5358f796e8b')).toEqual({
      id: '6afff3db9958f5358f796e8b'
    });
    expect(parseToolReferenceKey('systemTool-report')).toEqual({ id: 'systemTool-report' });
  });

  it('does not treat unrelated colon segments as a source', () => {
    expect(parseToolReferenceKey('mcp:app_1')).toEqual({ id: 'mcp:app_1' });
    expect(parseToolReferenceKey('')).toEqual({ id: '' });
  });
});

describe('getToolReferenceKeyCandidates', () => {
  const toolId = '6afff3db9958f5358f796e8b';

  it('keeps bare ids and ignores empty keys', () => {
    expect(getToolReferenceKeyCandidates(toolId)).toEqual([toolId]);
    expect(getToolReferenceKeyCandidates('')).toEqual([]);
    expect(getToolReferenceKeyCandidates('   ')).toEqual([]);
  });

  it('does not emit bare candidates for a sourced key', () => {
    const systemKey = 'system:systemTool-report';
    const systemCandidates = getToolReferenceKeyCandidates(systemKey);
    expect(systemCandidates[0]).toBe(systemKey);
    expect(systemCandidates).not.toContain('systemTool-report');
    expect(systemCandidates.every((candidate) => candidate.startsWith('system:'))).toBe(true);

    const teamKey = `teamId:68ad85a7463006c963799a07:${toolId}`;
    expect(getToolReferenceKeyCandidates(teamKey)).toEqual([teamKey]);
  });

  it('does not emit sourced candidates for a bare key', () => {
    const candidates = getToolReferenceKeyCandidates('systemTool-report');
    expect(candidates[0]).toBe('systemTool-report');
    expect(candidates.every((candidate) => !candidate.includes(':'))).toBe(true);
  });

  it('keeps the identity key for combined tool ids without breaking slashed plugin ids', () => {
    const candidates = getToolReferenceKeyCandidates(`mcp-${toolId}/search`);

    expect(candidates[0]).toBe(`mcp-${toolId}/search`);
    expect(candidates).toContain(`${toolId}/search`);
    expect(candidates).toContain(toolId + 'search');
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it('reports whether the reference key is sourced', () => {
    expect(isSourcedToolReferenceKey('system:systemTool-report')).toBe(true);
    expect(isSourcedToolReferenceKey('teamId:team-1:systemTool-report')).toBe(true);
    expect(isSourcedToolReferenceKey('debug:tmbId:tmb-1:systemTool-report')).toBe(true);
    expect(isSourcedToolReferenceKey('systemTool-report')).toBe(false);
    expect(isSourcedToolReferenceKey(`mcp-${toolId}/search`)).toBe(false);
  });
});

describe('normalizeToolReferenceBraces', () => {
  it('folds multi-layer braces into a single layer', () => {
    expect(normalizeToolReferenceBraces('use {{{{@6afff3db9958f5358f796e8b@}}}} now')).toBe(
      'use {{@6afff3db9958f5358f796e8b@}} now'
    );
  });

  it('keeps single-layer references and plain text unchanged', () => {
    expect(normalizeToolReferenceBraces('use {{@tool_1@}}')).toBe('use {{@tool_1@}}');
    expect(normalizeToolReferenceBraces('no reference')).toBe('no reference');
  });

  it('folds every occurrence in the text', () => {
    expect(normalizeToolReferenceBraces('{{{{@a@}}}} and {{{{@b@}}}}')).toBe('{{@a@}} and {{@b@}}');
  });
});

describe('TOOL_REFERENCE_REGEX_SOURCE / createToolReferenceRegExp', () => {
  const matchKey = (text: string) => {
    const matches = createToolReferenceRegExp().exec(text);
    return matches ? { matched: matches[0], key: matches[3] } : null;
  };

  it('matches single and multi-layer references with the key in capture group 3', () => {
    expect(matchKey('{{@id@}}')).toEqual({ matched: '{{@id@}}', key: 'id' });
    expect(matchKey('{{{{@tool_1@}}}}')).toEqual({ matched: '{{{{@tool_1@}}}}', key: 'tool_1' });
  });

  it('consumes asymmetric brace layers the same way for both sides', () => {
    // 三层左、两层右：整段被消费，键仍在捕获组 3。
    expect(matchKey('{{{@id@}}')).toEqual({ matched: '{{{@id@}}', key: 'id' });
    // 两层左、三层右。
    expect(matchKey('{{@id@}}}')).toEqual({ matched: '{{@id@}}}', key: 'id' });
    expect(matchKey('{{{@id@}}}')).toEqual({ matched: '{{{@id@}}}', key: 'id' });
  });

  it('requires at least two brace layers and a brace/@-free key', () => {
    expect(matchKey('{@id@}')).toBeNull();
    expect(matchKey('{{@a{b@}}')).toBeNull();
    expect(matchKey('{{@a@b@}}')).toBeNull();
  });

  it('finds every reference with the global flag', () => {
    const keys = Array.from('{{@a@}} {{@b@}}'.matchAll(createToolReferenceRegExp())).map(
      (matches) => matches[3]
    );
    expect(keys).toEqual(['a', 'b']);
  });
});
