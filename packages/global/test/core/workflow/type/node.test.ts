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

  it('keeps OAuth fields out of inline node config (strict regression guard)', () => {
    const base = { url: 'https://mcp.example.com/mcp', toolList: [] };

    expect(McpToolSetNodeConfigSchema.safeParse({ ...base, authMode: 'oauth' }).success).toBe(
      false
    );
    expect(
      McpToolSetNodeConfigSchema.safeParse({
        ...base,
        oauth: { schemaVersion: 1, clientMode: 'auto', credentialSeq: 0 }
      }).success
    ).toBe(false);
    // 上游摘要语义保持不变：合法字段仍可通过。
    expect(McpToolSetNodeConfigSchema.safeParse(base).success).toBe(true);
  });

  it('accepts and preserves authMode/oauth on runtime config only', () => {
    // 设计 §2.1 护栏：RuntimeConfig.strict() 必须接受 OAuth 根配置。
    expect(
      McpToolSetRuntimeConfigSchema.strict().safeParse({
        url: 'https://mcp.example.com/mcp',
        toolList: [],
        authMode: 'oauth',
        oauth: {}
      }).success
    ).toBe(true);

    const runtime = McpToolSetRuntimeConfigSchema.strict().parse({
      url: 'https://mcp.example.com/mcp',
      headerSecret: { Authorization: { value: 'token' } },
      toolList: [],
      authMode: 'oauth',
      oauth: {
        schemaVersion: 1,
        clientMode: 'manual',
        scope: 'mcp.read',
        credentialSeq: 0
      }
    });

    expect(runtime.authMode).toBe('oauth');
    expect(runtime.oauth).toMatchObject({
      schemaVersion: 1,
      clientMode: 'manual',
      scope: 'mcp.read',
      credentialSeq: 0
    });
    expect(McpToolSetRuntimeConfigSchema.parse({ url: 'https://mcp.example.com', toolList: [] }))
      .toMatchObject({ authMode: 'headers' });
  });

  it('rejects undeclared OAuth aliases on runtime config', () => {
    expect(
      McpToolSetRuntimeConfigSchema.strict().safeParse({
        url: 'https://mcp.example.com/mcp',
        toolList: [],
        mode: 'oauth'
      }).success
    ).toBe(false);
  });
});
