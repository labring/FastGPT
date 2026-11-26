import { describe, expect, it } from 'vitest';
import {
  HttpToolSetNodeConfigSchema,
  HttpToolSetRuntimeConfigSchema,
  McpToolSetNodeConfigSchema,
  McpToolSetRuntimeConfigSchema
} from '@fastgpt/global/core/workflow/type/node';

const toolList = [{ name: 'search', description: 'Search' }];

describe('node-local toolset config', () => {
  it('accepts URL values without adding node-only credential checks', () => {
    const mcpUrl = 'https://user:pass@mcp.example.com/sse?accessToken=secret';
    const apiSchemaUrl = 'https://user:pass@api.example.com/openapi.json?api_key=secret';
    const baseUrl = 'https://gateway.example.com/v2';

    expect(McpToolSetNodeConfigSchema.parse({ url: mcpUrl, toolList })).toMatchObject({
      url: mcpUrl,
      toolList
    });
    expect(HttpToolSetNodeConfigSchema.parse({ apiSchemaUrl, toolList })).toMatchObject({
      apiSchemaUrl,
      toolList
    });
    expect(McpToolSetNodeConfigSchema.safeParse({ url: '', toolList: [] }).success).toBe(true);
    expect(HttpToolSetNodeConfigSchema.safeParse({ toolList: [] }).success).toBe(true);
    expect(HttpToolSetNodeConfigSchema.parse({ apiSchemaUrl, baseUrl, toolList })).toMatchObject({
      apiSchemaUrl,
      baseUrl,
      toolList
    });
  });

  it('keeps complete toolset App runtime schemas unchanged', () => {
    expect(
      McpToolSetRuntimeConfigSchema.safeParse({
        url: 'user:pass@host?accessToken=secret',
        toolList: []
      }).success
    ).toBe(true);
    expect(
      HttpToolSetRuntimeConfigSchema.safeParse({
        baseUrl: 'custom:opaque@host',
        apiSchemaStr: '',
        toolList: []
      }).success
    ).toBe(true);
  });
});
