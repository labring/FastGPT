import { describe, expect, it } from 'vitest';
import { splitCombineToolId, getToolRawId } from '@fastgpt/global/core/app/tool/utils';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';

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
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
    });
  });

  describe('commercial tools', () => {
    it('should parse commercial-xxx format correctly', () => {
      const result = splitCombineToolId('commercial-507f1f77bcf86cd799439011');

      expect(result.source).toBe(AppToolSourceEnum.commercial);
      expect(result.pluginId).toBe('commercial-507f1f77bcf86cd799439011');
    });

    it('should convert commercial-dalle3 to systemTool', () => {
      const result = splitCombineToolId('commercial-dalle3');

      expect(result.source).toBe(AppToolSourceEnum.systemTool);
      expect(result.pluginId).toBe('systemTool-dalle3');
    });
  });

  describe('systemTool tools', () => {
    it('should parse systemTool-xxx format correctly', () => {
      const result = splitCombineToolId('systemTool-websearch');

      expect(result.source).toBe(AppToolSourceEnum.systemTool);
      expect(result.pluginId).toBe('systemTool-websearch');
    });

    it('should handle systemTool with complex id', () => {
      const result = splitCombineToolId('systemTool-code-interpreter');

      expect(result.source).toBe(AppToolSourceEnum.systemTool);
      expect(result.pluginId).toBe('systemTool-code-interpreter');
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
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
    });

    it('should parse http-parentId/toolName format correctly', () => {
      const result = splitCombineToolId('http-507f1f77bcf86cd799439011/apiTool');

      expect(result.source).toBe(AppToolSourceEnum.http);
      expect(result.pluginId).toBe('507f1f77bcf86cd799439011/apiTool');
      expect(result.parentId).toBe('507f1f77bcf86cd799439011');
    });
  });

  describe('deprecated community tools', () => {
    it('should convert community-xxx to systemTool', () => {
      const result = splitCombineToolId('community-oldPlugin');

      expect(result.source).toBe(AppToolSourceEnum.systemTool);
      expect(result.pluginId).toBe('systemTool-oldPlugin');
    });
  });

  describe('error handling', () => {
    it('should throw error when pluginId is empty after split', () => {
      expect(() => splitCombineToolId('commercial-')).toThrow('pluginId not found');
    });
  });
});

describe('getToolRawId', () => {
  it('should return pluginId for pure ObjectId', () => {
    const result = getToolRawId('507f1f77bcf86cd799439011');
    expect(result).toBe('507f1f77bcf86cd799439011');
  });

  it('should return pluginId for commercial tool', () => {
    const result = getToolRawId('commercial-507f1f77bcf86cd799439011');
    expect(result).toBe('commercial-507f1f77bcf86cd799439011');
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
    expect(result).toBe('systemTool-websearch');
  });

  it('should handle personal tool with prefix', () => {
    const result = getToolRawId('personal-507f1f77bcf86cd799439011');
    expect(result).toBe('507f1f77bcf86cd799439011');
  });

  it('should handle converted community tool', () => {
    const result = getToolRawId('community-oldPlugin');
    expect(result).toBe('systemTool-oldPlugin');
  });
});
