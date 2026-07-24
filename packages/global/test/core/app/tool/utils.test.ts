import { describe, expect, it } from 'vitest';
import {
  getToolNameCandidates,
  getToolRawId,
  hasDebugToolInNodes,
  hasDebugToolInSelectedTools,
  parseDebugToolSource,
  parseToolsetToolId,
  shouldUseLegacyToolDescriptionFallback,
  splitCombineToolId,
  splitToolsetToolPluginId
} from '@fastgpt/global/core/app/tool/utils';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

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
