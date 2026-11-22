import { describe, expect, it } from 'vitest';
import {
  HttpToolSetNodeConfigSchema,
  HttpToolSetRuntimeConfigSchema,
  McpToolSetNodeConfigSchema,
  McpToolSetRuntimeConfigSchema
} from '@fastgpt/global/core/workflow/type/node';
import { LegacyStoreNodeItemSchema, LegacyMcpToolSetRuntimeConfigSchema } from '@fastgpt/global/core/workflow/migration/legacy/schema';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

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

  it('parses a persisted OAuth toolset node whose server metadata contains null optionals', () => {
    // 回归（Stage K3）：Mongo 中 `oauth.server.clientIdMetadataDocumentSupported = null`
    // 曾使 LegacyStoreNodeItemSchema 拒绝整节点，detail 返回 500。
    const parsed = LegacyStoreNodeItemSchema.parse({
      nodeId: 'oauth-toolset-node',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      name: 'OAuth tool set',
      inputs: [],
      outputs: [],
      toolConfig: {
        mcpToolSet: {
          url: 'https://mcp.example.com/mcp',
          authMode: 'oauth',
          toolList: [],
          oauth: {
            schemaVersion: 1,
            clientMode: 'dcr',
            credentialSeq: 7,
            issuer: 'https://as.example.org/',
            resource: 'https://mcp.example.com/mcp',
            server: {
              issuer: 'https://as.example.org/',
              authorizationEndpoint: 'https://as.example.org/authorize',
              tokenEndpoint: 'https://as.example.org/token',
              registrationEndpoint: null,
              revocationEndpoint: null,
              tokenEndpointAuthMethodsSupported: null,
              codeChallengeMethodsSupported: null,
              clientIdMetadataDocumentSupported: null,
              scopesSupported: null,
              source: 'discovered',
              fetchedAt: 1
            },
            refreshLease: null
          }
        }
      }
    });

    const mcpToolSet = parsed.toolConfig?.mcpToolSet as {
      authMode?: string;
      oauth?: { server?: Record<string, unknown> };
    };
    expect(mcpToolSet.authMode).toBe('oauth');
    // 读侧容忍 null（不报错）；写路径由 discovery 归一，历史数据原样保留。
    expect(mcpToolSet.oauth?.server?.clientIdMetadataDocumentSupported).toBeNull();
    expect(mcpToolSet.oauth?.server?.issuer).toBe('https://as.example.org/');
  });

  it('parses a persisted OAuth toolset node whose optional oauth fields are null', () => {
    // 回归（Stage K10）：Mongo 中 `oauth.clientSource = null`（旧版 client reset 写入 null）
    // 曾使 LegacyMcpToolSetRuntimeConfigSchema 解析失败，节点落入 legacy 摘要校验并报
    // 「节点内工具集必须使用名称和描述摘要」，detail 返回 500。
    const toolSet = {
      url: 'http://172.17.0.34:18101/mcp',
      authMode: 'oauth',
      toolList: [{ name: 'whoami', description: 'who', inputSchema: { type: 'object' } }],
      oauth: {
        schemaVersion: 1,
        clientMode: 'manual',
        credentialSeq: 4,
        clientSource: null,
        issuer: null,
        resource: 'http://172.17.0.34:18101/mcp',
        scope: null,
        server: null,
        client: null,
        token: null,
        authorizedAt: null,
        authorizedBy: null,
        lastError: null,
        refreshLease: null,
        revokeLease: null
      }
    };

    // toolList 带 inputSchema → 只有 runtime schema 能解析（当前节点摘要 schema 不适用）。
    const runtime = LegacyMcpToolSetRuntimeConfigSchema.safeParse(toolSet);
    expect(runtime.success, JSON.stringify(runtime.error?.issues)).toBe(true);
    if (runtime.success) {
      expect(runtime.data.oauth?.clientSource).toBeNull();
      expect(runtime.data.oauth?.issuer).toBeNull();
      expect(runtime.data.oauth?.authorizedAt).toBeNull();
    }

    const parsed = LegacyStoreNodeItemSchema.parse({
      nodeId: 'oauth-null-optionals',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      name: 'OAuth tool set',
      inputs: [],
      outputs: [],
      toolConfig: { mcpToolSet: toolSet }
    });
    const mcpToolSet = parsed.toolConfig?.mcpToolSet as {
      authMode?: string;
      oauth?: Record<string, unknown>;
    };
    expect(mcpToolSet.authMode).toBe('oauth');
    expect(mcpToolSet.oauth?.clientSource).toBeNull();
    expect(mcpToolSet.oauth?.resource).toBe('http://172.17.0.34:18101/mcp');
  });

  it('still rejects unknown clientSource values', () => {
    expect(
      McpToolSetRuntimeConfigSchema.strict().safeParse({
        url: 'https://mcp.example.com/mcp',
        toolList: [],
        authMode: 'oauth',
        oauth: { clientSource: 'bogus' }
      }).success
    ).toBe(false);
  });
});
