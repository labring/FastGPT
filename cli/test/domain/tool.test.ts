import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import { describe, expect, it, vi } from 'vitest';
import { createHttpToolService } from '../../src/domain/tool/http-tool-service';
import { createMcpToolService } from '../../src/domain/tool/mcp-tool-service';
import { createToolFolderService } from '../../src/domain/tool/tool-folder-service';
import {
  createFastGptHttpClient,
  type FastGptHttpClient
} from '../../src/infra/http/fastgpt-http-client';
import { CliApiError, CliNetworkError } from '../../src/shared/errors';

const FOLDER_ID = '68ad85a7463006c963799a10';
const MCP_ID = '68ad85a7463006c963799a11';
const HTTP_ID = '68ad85a7463006c963799a12';

function createMockClient(handler: (params: any) => Promise<any>): FastGptHttpClient {
  return {
    baseUrl: 'https://cloud.fastgpt.cn/api',
    request: vi.fn(handler),
    requestRaw: vi.fn(),
    uploadMultipart: vi.fn(),
    uploadBinary: vi.fn(),
    putPresignedUrl: vi.fn(),
    streamSse: vi.fn()
  };
}

describe('Tool Domain Services (folder / mcp / http)', () => {
  const folderService = createToolFolderService();
  const mcpService = createMcpToolService();
  const httpService = createHttpToolService();

  it('ToolFolderService lists, creates with default FolderImgUrl, updates with type check, and deletes', async () => {
    const calls: Array<{ method: string; path: string; body?: any; query?: any }> = [];
    const client = createMockClient(async (params) => {
      calls.push({
        method: params.method,
        path: params.path,
        body: params.body,
        query: params.query
      });
      if (params.path === '/core/app/listV2') {
        return { total: 1, list: [{ _id: FOLDER_ID, name: 'Tools', type: 'toolFolder' }] };
      }
      if (params.path === '/core/app/create') {
        expect(params.body.type).toBe('toolFolder');
        expect(params.body.avatar).toBe(FolderImgUrl);
        return FOLDER_ID;
      }
      if (params.path === '/core/app/detail') {
        return {
          _id: params.query.appId,
          name: 'Tools',
          type: params.query.appId === FOLDER_ID ? 'toolFolder' : 'chatAgent'
        };
      }
      if (params.path === '/core/app/del') {
        return [FOLDER_ID];
      }
      return undefined;
    });

    const listed = await folderService.list({
      client,
      input: { searchKey: 'Tools', page: 1, pageSize: 10 }
    });
    expect(listed.meta).toEqual({ total: 1, page: 1, pageSize: 10, hasMore: false, count: 1 });

    const created = await folderService.create({ client, input: { name: 'Tools', intro: 'Dir' } });
    expect(created.changed).toBe(true);
    expect(created.data).toMatchObject({ folderId: FOLDER_ID, name: 'Tools' });

    await expect(
      folderService.update({ client, folderId: MCP_ID, input: { name: 'Bad' } })
    ).rejects.toThrow('expected tool folder');

    const updated = await folderService.update({
      client,
      folderId: FOLDER_ID,
      input: { name: 'Tools v2', parentId: null }
    });
    expect(updated.changed).toBe(true);

    const deleted = await folderService.delete({ client, folderId: FOLDER_ID });
    expect(deleted.changed).toBe(true);
    expect(deleted.data).toMatchObject({ deleted: true, folderId: FOLDER_ID });
  });

  it('McpToolService redacts secrets in dry-run, auto-parses tools on create, updates metadata+config with refresh, and runs/deletes', async () => {
    const parsedTools = [
      { name: 'ask_wiki', description: 'Ask wiki', inputSchema: { type: 'object', properties: {} } }
    ];
    let updatedMcpPayload: any;
    let updatedMetaPayload: any;

    const client = createMockClient(async ({ method, path, body, query }) => {
      if (path === '/core/app/listV2') {
        expect(body.type).toEqual(['toolSet']);
        return { total: 1, list: [{ _id: MCP_ID, name: 'DeepWiki', type: 'toolSet' }] };
      }
      if (path === '/core/app/mcpTools/getTools') {
        expect(body.headerSecret).toEqual({ Authorization: { value: 'Bearer secret-123' } });
        return parsedTools;
      }
      if (path === '/core/app/mcpTools/create') {
        expect(body.toolList).toEqual(parsedTools);
        return MCP_ID;
      }
      if (path === '/core/app/detail') {
        return {
          _id: query.appId,
          name: 'DeepWiki',
          type: query.appId === MCP_ID ? 'toolSet' : 'simple',
          nodes: [
            {
              toolConfig: {
                mcpToolSet: {
                  url: 'https://mcp.deepwiki.com/mcp',
                  headerSecret: { Authorization: { value: 'Bearer secret-123' } },
                  toolList: parsedTools
                }
              }
            }
          ]
        };
      }
      if (path === '/core/app/mcpTools/getChildren') {
        expect(query).toEqual({ id: MCP_ID, searchKey: 'ask' });
        return [{ id: `mcp-${MCP_ID}/ask_wiki`, name: 'ask_wiki', description: 'Ask', avatar: '' }];
      }
      if (path === '/core/app/update') {
        updatedMetaPayload = body;
        return undefined;
      }
      if (path === '/core/app/mcpTools/update') {
        expect(method).toBe('PUT');
        updatedMcpPayload = body;
        return undefined;
      }
      if (path === '/core/app/mcpTools/runTool') {
        return { content: [{ type: 'text', text: 'ok' }] };
      }
      if (path === '/core/app/del') {
        return [MCP_ID];
      }
      return undefined;
    });

    const dryCreate = await mcpService.create({
      client,
      input: {
        name: 'DeepWiki',
        url: 'https://mcp.deepwiki.com/mcp',
        headerSecret: { Authorization: 'Bearer secret-123' }
      },
      dryRun: true
    });
    expect(JSON.stringify(dryCreate)).not.toContain('secret-123');
    expect(dryCreate.data).toMatchObject({ dryRun: true, risk: 'write', autoParseTools: true });

    const created = await mcpService.create({
      client,
      input: {
        name: 'DeepWiki',
        url: 'https://mcp.deepwiki.com/mcp',
        headerSecret: { Authorization: 'Bearer secret-123' }
      }
    });
    expect(created.data).toMatchObject({ appId: MCP_ID, toolCount: 1 });

    const detail = await mcpService.getDetail({ client, appId: MCP_ID });
    expect(detail.data?.mcpConfig.url).toBe('https://mcp.deepwiki.com/mcp');

    const children = await mcpService.listChildren({ client, appId: MCP_ID, searchKey: 'ask' });
    expect(children.data).toHaveLength(1);

    const updated = await mcpService.update({
      client,
      appId: MCP_ID,
      metadata: { avatar: '/api/system/img/avatar/team/file/mcp.png' },
      config: { refresh: true }
    });
    expect(updated.changed).toBe(true);
    expect(updatedMetaPayload).toEqual({ avatar: '/api/system/img/avatar/team/file/mcp.png' });
    expect(updatedMcpPayload).toMatchObject({
      appId: MCP_ID,
      url: 'https://mcp.deepwiki.com/mcp',
      toolList: parsedTools
    });

    const runRes = await mcpService.run({
      client,
      input: {
        url: 'https://mcp.deepwiki.com/mcp',
        toolName: 'ask_wiki',
        params: { repoName: 'labring/FastGPT' }
      }
    });
    expect(runRes.changed).toBe(true);

    await expect(mcpService.delete({ client, appId: FOLDER_ID })).rejects.toThrow(
      'expected MCP toolset'
    );
    const deleted = await mcpService.delete({ client, appId: MCP_ID });
    expect(deleted.data).toMatchObject({ deleted: true, appId: MCP_ID });
  });

  it('HttpToolService handles list, parse, create with follow-up update, children pagination, update, run, and delete', async () => {
    let httpUpdateCalls = 0;
    const sampleTool = {
      name: 'get_weather',
      description: 'Get weather',
      path: '/weather',
      method: 'GET'
    };

    const client = createMockClient(async ({ method, path, body, query }) => {
      if (path === '/core/app/listV2') {
        expect(body.type).toEqual(['httpToolSet', 'httpPlugin']);
        return { total: 1, list: [{ _id: HTTP_ID, name: 'Weather', type: 'httpToolSet' }] };
      }
      if (path === '/core/app/httpTools/getApiSchemaByUrl') {
        return { openapi: '3.0.0', paths: { '/weather': {} } };
      }
      if (path === '/core/app/httpTools/create') {
        expect(body.createType).toBe('manual');
        return HTTP_ID;
      }
      if (path === '/core/app/httpTools/update') {
        expect(method).toBe('PUT');
        httpUpdateCalls += 1;
        return undefined;
      }
      if (path === '/core/app/toolSet/listV2') {
        expect(body.parentId).toBe(HTTP_ID);
        return { total: 1, list: [{ id: `http-${HTTP_ID}/get_weather`, name: 'get_weather' }] };
      }
      if (path === '/core/app/detail') {
        return {
          _id: query.appId,
          name: 'Weather',
          type: 'httpToolSet',
          nodes: [
            {
              toolConfig: {
                httpToolSet: {
                  baseUrl: 'https://api.example.com',
                  toolList: [sampleTool]
                }
              }
            }
          ]
        };
      }
      if (path === '/core/app/update') {
        return undefined;
      }
      if (path === '/core/app/httpTools/runTool') {
        expect(body.method).toBe('GET');
        return { data: { temp: 22 } };
      }
      if (path === '/core/app/del') {
        return [HTTP_ID];
      }
      return undefined;
    });

    const parsed = await httpService.parse({ client, url: 'https://api.example.com/openapi.json' });
    expect(parsed.data).toMatchObject({ openapi: '3.0.0' });

    const created = await httpService.create({
      client,
      input: { name: 'Weather' },
      config: {
        baseUrl: 'https://api.example.com',
        toolList: [sampleTool],
        headerSecret: { 'X-Api-Key': 'secret-http' }
      }
    });
    expect(created.data).toMatchObject({ appId: HTTP_ID, configured: true, toolCount: 1 });
    expect(httpUpdateCalls).toBe(1);

    const children = await httpService.listChildren({
      client,
      input: { appId: HTTP_ID, page: 1, pageSize: 10 }
    });
    expect(children.meta).toEqual({ total: 1, page: 1, pageSize: 10, hasMore: false, count: 1 });

    const updated = await httpService.update({
      client,
      appId: HTTP_ID,
      metadata: { name: 'Weather v2' },
      config: { baseUrl: 'https://v2.example.com' }
    });
    expect(updated.data).toMatchObject({
      updated: true,
      updatedMetadata: true,
      updatedConfig: true
    });
    expect(httpUpdateCalls).toBe(2);

    const runRes = await httpService.run({
      client,
      input: {
        baseUrl: 'https://api.example.com',
        toolPath: '/weather',
        method: 'get',
        params: { city: 'Hangzhou' }
      }
    });
    expect(runRes.data).toEqual({ data: { temp: 22 } });

    const delRes = await httpService.delete({ client, appId: HTTP_ID });
    expect(delRes.data).toMatchObject({ deleted: true, appId: HTTP_ID });
  });

  it('isolates saved credentials on URL override, redacts custom/child headers in previews, inherits child HTTP tool config, fails on tool business errors, and reports partial write recovery', async () => {
    const mcpService = createMcpToolService();
    const httpService = createHttpToolService();

    // 1. Field-level preview redaction (arbitrary custom header names + child tool headerSecret/staticHeaders)
    const dryHttpCreate = await httpService.create({
      client: createMockClient(async () => undefined),
      input: { name: 'RedactedHTTP' },
      config: {
        baseUrl: 'https://api.example.com',
        headerSecret: { 'X-Custom-Vault': 'vault-secret-999' },
        customHeaders: { 'X-Arbitrary-Auth': 'custom-secret-888' },
        toolList: [
          {
            name: 'search',
            description: 'Search endpoint',
            path: '/search',
            method: 'GET',
            headerSecret: { 'X-Child-Auth': { value: 'child-secret-777' } },
            staticHeaders: [{ key: 'X-Static-Key', value: 'static-secret-666' }]
          }
        ]
      },
      dryRun: true
    });
    const dryJson = JSON.stringify(dryHttpCreate);
    expect(dryJson).not.toContain('vault-secret-999');
    expect(dryJson).not.toContain('custom-secret-888');
    expect(dryJson).not.toContain('child-secret-777');
    expect(dryJson).not.toContain('static-secret-666');
    expect(dryJson).toContain('X-Arbitrary-Auth');
    expect(dryJson).toContain('X-Child-Auth');

    // 2. Credential isolation on MCP run & update --refresh when overriding URL
    const mcpClient = createMockClient(async ({ path }) => {
      if (path === '/core/app/detail') {
        return {
          _id: MCP_ID,
          name: 'AuthMCP',
          type: 'toolSet',
          nodes: [
            {
              toolConfig: {
                mcpToolSet: {
                  url: 'https://trusted.mcp.example/mcp',
                  headerSecret: { Authorization: { value: 'Bearer saved-mcp-secret' } },
                  toolList: []
                }
              }
            }
          ]
        };
      }
      if (path === '/core/app/mcpTools/runTool') {
        return { isError: true, content: [{ type: 'text', text: 'Remote MCP tool failed' }] };
      }
      return undefined;
    });

    await expect(
      mcpService.run({
        client: mcpClient,
        input: { appId: MCP_ID, url: 'https://evil.example/mcp', toolName: 'ping' }
      })
    ).rejects.toThrow(/Refusing to send saved headerSecret/);

    await expect(
      mcpService.update({
        client: mcpClient,
        appId: MCP_ID,
        metadata: { name: 'Changed' },
        config: { url: 'https://evil.example/mcp', refresh: true }
      })
    ).rejects.toThrow(/Refusing to forward saved headerSecret/);

    // 3. MCP business failure (isError: true) throws CliApiError
    await expect(
      mcpService.run({
        client: mcpClient,
        input: { appId: MCP_ID, toolName: 'ping' }
      })
    ).rejects.toThrow('Remote MCP tool failed');

    // 4. HTTP run --id inherits child tool method/headerSecret/staticParams/staticHeaders/staticBody,
    // blocks URL override credential leak & host-hijack toolPath, and throws on errorMsg.
    let capturedRunBody: any;
    let runMode: 'ok' | 'errorMsg' = 'ok';
    const httpClient = createMockClient(async ({ path, body }) => {
      if (path === '/core/app/detail') {
        return {
          _id: HTTP_ID,
          name: 'AuthHTTP',
          type: 'httpToolSet',
          nodes: [
            {
              toolConfig: {
                httpToolSet: {
                  baseUrl: 'https://trusted.api.example',
                  customHeaders: JSON.stringify({ 'X-Set-Header': 'set-secret' }),
                  headerSecret: { 'X-Set-Auth': { value: 'set-auth-secret' } },
                  toolList: [
                    {
                      name: 'get_item',
                      path: '/v1/items',
                      method: 'GET',
                      headerSecret: { 'X-Child-Token': { value: 'child-token-123' } },
                      staticParams: [{ key: 'env', value: 'prod' }],
                      staticHeaders: [{ key: 'X-Static', value: 'yes' }],
                      staticBody: { type: 'json', content: '{"fixed":"1"}' }
                    }
                  ]
                }
              }
            }
          ]
        };
      }
      if (path === '/core/app/httpTools/runTool') {
        capturedRunBody = body;
        return runMode === 'ok' ? { data: { ok: true } } : { errorMsg: 'Upstream 502 error' };
      }
      if (path === '/core/app/httpTools/create') {
        return HTTP_ID;
      }
      if (path === '/core/app/httpTools/update') {
        throw new CliApiError({
          message: 'config rejected by server',
          httpStatus: 400,
          serverCode: 400
        });
      }
      return undefined;
    });

    await expect(
      httpService.run({
        client: httpClient,
        input: { appId: HTTP_ID, baseUrl: 'https://evil.example', toolPath: '/v1/items' }
      })
    ).rejects.toThrow(/Refusing to send saved credentials/);

    await expect(
      httpService.run({
        client: httpClient,
        input: { appId: HTTP_ID, toolPath: 'https://evil.example/steal' }
      })
    ).rejects.toThrow(/Refusing to send saved credentials/);

    await expect(
      httpService.run({
        client: httpClient,
        input: { baseUrl: 'https://trusted.api.example', toolPath: 'https://evil.example/steal' }
      })
    ).rejects.toThrow(/Invalid HTTP tool path/);

    const okRun = await httpService.run({
      client: httpClient,
      input: { appId: HTTP_ID, toolPath: '/v1/items', params: { q: 'test' } }
    });
    expect(okRun.changed).toBe(true);
    expect(capturedRunBody).toMatchObject({
      baseUrl: 'https://trusted.api.example',
      toolPath: '/v1/items',
      method: 'GET',
      headerSecret: { 'X-Child-Token': { value: 'child-token-123' } },
      staticParams: [{ key: 'env', value: 'prod' }],
      staticHeaders: [{ key: 'X-Static', value: 'yes' }],
      staticBody: { type: 'json', content: '{"fixed":"1"}' }
    });

    runMode = 'errorMsg';
    await expect(
      httpService.run({
        client: httpClient,
        input: { appId: HTTP_ID, toolPath: '/v1/items' }
      })
    ).rejects.toThrow('Upstream 502 error');

    // 5. Partial failure recovery on HTTP create when follow-up configure fails (server reject vs network unknown)
    try {
      await httpService.create({
        client: httpClient,
        input: { name: 'PartialHTTP' },
        config: {
          baseUrl: 'https://trusted.api.example',
          toolList: [
            { name: 'get_item', description: 'Get item', path: '/v1/items', method: 'GET' }
          ]
        }
      });
      expect.unreachable('should fail');
    } catch (error: any) {
      expect(error.details).toMatchObject({
        partialSuccess: true,
        outcome: 'failed',
        appId: HTTP_ID,
        completedSteps: ['create'],
        failedStep: 'configure'
      });
      expect(error.hint).toContain(HTTP_ID);
    }

    const lostResponseClient = createMockClient(async ({ path }) => {
      if (path === '/core/app/httpTools/create') return HTTP_ID;
      if (path === '/core/app/httpTools/update') {
        throw new CliNetworkError('Socket hung up after write');
      }
      return undefined;
    });
    try {
      await httpService.create({
        client: lostResponseClient,
        input: { name: 'AmbiguousHTTP' },
        config: {
          baseUrl: 'https://trusted.api.example',
          toolList: [
            { name: 'get_item', description: 'Get item', path: '/v1/items', method: 'GET' }
          ]
        }
      });
      expect.unreachable('should fail with unknown outcome');
    } catch (error: any) {
      expect(error).toBeInstanceOf(CliNetworkError);
      expect(error.details).toMatchObject({
        partialSuccess: true,
        outcome: 'unknown',
        appId: HTTP_ID,
        completedSteps: ['create'],
        uncertainStep: 'configure'
      });
      expect(error.details.failedStep).toBeUndefined();
      expect(error.hint).toContain(`fastgpt tool http get ${HTTP_ID}`);
    }
  });

  it('guards sub-tool credentials on HTTP baseUrl change, supports manual full-URL tools, disambiguates multi-method paths, and narrows MCP/HTTP schema boundaries', async () => {
    // 1. Sub-tool credential isolation when updating toolset baseUrl without --tool-list
    const subToolCredClient = createMockClient(async ({ path }) => {
      if (path === '/core/app/detail') {
        return {
          _id: HTTP_ID,
          name: 'SubCredHTTP',
          type: 'httpToolSet',
          nodes: [
            {
              toolConfig: {
                httpToolSet: {
                  baseUrl: 'https://old.api.example',
                  toolList: [
                    {
                      name: 'secret_tool',
                      description: 'Uses sub-tool static header',
                      path: '/v1/secret',
                      method: 'GET',
                      staticHeaders: [{ key: 'X-Sub-Auth', value: 'sub-secret' }]
                    }
                  ]
                }
              }
            }
          ]
        };
      }
      return undefined;
    });

    await expect(
      httpService.update({
        client: subToolCredClient,
        appId: HTTP_ID,
        metadata: {},
        config: { baseUrl: 'https://new.api.example' }
      })
    ).rejects.toThrow(/Refusing to retain saved sub-tool headerSecret\/staticHeaders/);

    // 2. Manual HTTP toolset saved with full URL in tool.path and empty toolset baseUrl
    let manualCapturedBody: any;
    const manualClient = createMockClient(async ({ path, body }) => {
      if (path === '/core/app/detail') {
        return {
          _id: HTTP_ID,
          name: 'ManualHTTP',
          type: 'httpToolSet',
          nodes: [
            {
              toolConfig: {
                httpToolSet: {
                  baseUrl: '',
                  toolList: [
                    {
                      name: 'manual_hook',
                      description: 'Web manual tool',
                      path: 'https://manual.example.com/v1/hook',
                      method: 'get',
                      headerSecret: { Authorization: { value: 'Bearer manual-token' } }
                    }
                  ]
                }
              }
            }
          ]
        };
      }
      if (path === '/core/app/httpTools/runTool') {
        manualCapturedBody = body;
        return { data: { ok: true } };
      }
      return undefined;
    });

    const manualRes = await httpService.run({
      client: manualClient,
      input: { appId: HTTP_ID, toolPath: 'manual_hook' }
    });
    expect(manualRes.changed).toBe(true);
    expect(manualCapturedBody).toMatchObject({
      baseUrl: '',
      toolPath: 'https://manual.example.com/v1/hook',
      method: 'GET',
      headerSecret: { Authorization: { value: 'Bearer manual-token' } }
    });

    // Overriding manual tool target via --target-url blocks saved credentials, while explicit override extracts path cleanly
    await expect(
      httpService.run({
        client: manualClient,
        input: { appId: HTTP_ID, toolPath: 'manual_hook', baseUrl: 'https://evil.example.com' }
      })
    ).rejects.toThrow(/Refusing to send saved credentials/);

    await httpService.run({
      client: manualClient,
      input: {
        appId: HTTP_ID,
        toolPath: 'manual_hook',
        baseUrl: 'https://staging.example.com',
        headerSecret: { Authorization: 'Bearer staging-token' }
      }
    });
    expect(manualCapturedBody).toMatchObject({
      baseUrl: 'https://staging.example.com',
      toolPath: '/v1/hook',
      method: 'GET'
    });

    // 3. Multi-method same-path disambiguation: refuse ambiguity and mismatched method instead of borrowing first item
    let multiCapturedBody: any;
    const multiMethodClient = createMockClient(async ({ path, body }) => {
      if (path === '/core/app/detail') {
        return {
          _id: HTTP_ID,
          name: 'MultiMethodHTTP',
          type: 'httpToolSet',
          nodes: [
            {
              toolConfig: {
                httpToolSet: {
                  baseUrl: 'https://api.example.com',
                  toolList: [
                    { name: 'list_items', description: 'List', path: '/items', method: 'GET' },
                    {
                      name: 'create_item',
                      description: 'Create',
                      path: '/items',
                      method: 'POST',
                      staticHeaders: [{ key: 'X-Mode', value: 'create' }]
                    }
                  ]
                }
              }
            }
          ]
        };
      }
      if (path === '/core/app/httpTools/runTool') {
        multiCapturedBody = body;
        return { data: { created: true } };
      }
      return undefined;
    });

    await expect(
      httpService.run({
        client: multiMethodClient,
        input: { appId: HTTP_ID, toolPath: '/items' }
      })
    ).rejects.toThrow(/Multiple HTTP tools share path/);

    await expect(
      httpService.run({
        client: multiMethodClient,
        input: { appId: HTTP_ID, toolPath: '/items', method: 'DELETE' }
      })
    ).rejects.toThrow(/No HTTP tool matching path "\/items" uses method "DELETE"/);

    await httpService.run({
      client: multiMethodClient,
      input: { appId: HTTP_ID, toolPath: '/items', method: 'POST' }
    });
    expect(multiCapturedBody).toMatchObject({
      method: 'POST',
      staticHeaders: [{ key: 'X-Mode', value: 'create' }]
    });

    // 4. Malformed MCP error envelope (non-array content) fails cleanly without TypeError
    const malformedMcpClient = createMockClient(async ({ path }) => {
      if (path === '/core/app/mcpTools/runTool') {
        return { isError: true, content: 'non-array-error-payload' };
      }
      return undefined;
    });
    await expect(
      mcpService.run({
        client: malformedMcpClient,
        input: { url: 'https://mcp.example.com/mcp', toolName: 'broken' }
      })
    ).rejects.toThrow('MCP tool execution failed');

    // 5. HTTP update dry-run validates toolList against UpdateHttpToolsBodySchema instead of blind casting
    await expect(
      httpService.update({
        client: createMockClient(async () => undefined),
        appId: HTTP_ID,
        metadata: {},
        config: { toolList: [{ invalid: true }] },
        dryRun: true
      })
    ).rejects.toThrow();

    // 6. Axios path-prefix outbound URL parity: changing /v1 -> /v2 on relative tool /search must refuse inherited sub-tool credentials
    const prefixClient = createMockClient(async ({ path }) => {
      if (path === '/core/app/detail') {
        return {
          _id: HTTP_ID,
          name: 'PrefixHTTP',
          type: 'httpToolSet',
          nodes: [
            {
              toolConfig: {
                httpToolSet: {
                  baseUrl: 'https://api.example.com/v1',
                  toolList: [
                    {
                      name: 'search',
                      description: 'Search',
                      path: '/search',
                      method: 'GET',
                      headerSecret: { Authorization: { value: 'Bearer v1-token' } }
                    }
                  ]
                }
              }
            }
          ]
        };
      }
      return undefined;
    });

    await expect(
      httpService.update({
        client: prefixClient,
        appId: HTTP_ID,
        metadata: {},
        config: { baseUrl: 'https://api.example.com/v2' }
      })
    ).rejects.toThrow(/Refusing to retain saved sub-tool headerSecret\/staticHeaders/);

    await expect(
      httpService.run({
        client: prefixClient,
        input: { appId: HTTP_ID, baseUrl: 'https://api.example.com/v2', toolPath: '/search' }
      })
    ).rejects.toThrow(/Refusing to send saved credentials/);

    await expect(
      httpService.run({
        client: prefixClient,
        input: { appId: HTTP_ID, toolPath: '/../v2/admin' }
      })
    ).rejects.toThrow(/Invalid HTTP tool path/);

    // 7. Create rejects null/invalid resource ID without issuing follow-up write; standalone & multi-step writes preserve outcome: unknown + get hint
    let nullCreateFollowUpCalled = false;
    const nullCreateClient = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: async (input) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/core/app/httpTools/update')) {
          nullCreateFollowUpCalled = true;
        }
        return new Response(JSON.stringify({ code: 200, statusText: '', data: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
    });

    await expect(
      httpService.create({
        client: nullCreateClient,
        input: { name: 'NullIdHTTP' },
        config: { baseUrl: 'https://api.example.com/v1', toolList: [] }
      })
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      details: expect.objectContaining({ outcome: 'unknown', phase: 'invalid_response' })
    });
    expect(nullCreateFollowUpCalled).toBe(false);

    const gateway502Client = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: async (input) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/core/app/httpTools/create')) {
          return new Response(JSON.stringify({ code: 200, data: HTTP_ID }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        if (url.includes('/core/app/detail')) {
          const isMcp = url.includes(MCP_ID);
          return new Response(
            JSON.stringify({
              code: 200,
              data: isMcp
                ? {
                    _id: MCP_ID,
                    name: 'DemoMCP',
                    type: 'toolSet',
                    nodes: [
                      {
                        toolConfig: {
                          mcpToolSet: { url: 'https://mcp.example.com/mcp', toolList: [] }
                        }
                      }
                    ]
                  }
                : {
                    _id: HTTP_ID,
                    name: 'DemoHTTP',
                    type: 'httpToolSet',
                    nodes: [
                      {
                        toolConfig: {
                          httpToolSet: { baseUrl: 'https://api.example.com/v1', toolList: [] }
                        }
                      }
                    ]
                  }
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ code: 502, message: 'Bad Gateway' }), {
          status: 502,
          headers: { 'content-type': 'application/json' }
        });
      }
    });

    await expect(
      httpService.create({
        client: gateway502Client,
        input: { name: 'Gateway502HTTP' },
        config: { baseUrl: 'https://api.example.com/v1', toolList: [] }
      })
    ).rejects.toMatchObject({
      httpStatus: 502,
      hint: expect.stringContaining(`fastgpt tool http get ${HTTP_ID}`),
      details: expect.objectContaining({
        partialSuccess: true,
        outcome: 'unknown',
        appId: HTTP_ID,
        completedSteps: ['create'],
        uncertainStep: 'configure'
      })
    });

    await expect(
      httpService.update({
        client: gateway502Client,
        appId: HTTP_ID,
        metadata: {},
        config: { headerSecret: { 'X-Key': 'v1' } }
      })
    ).rejects.toMatchObject({
      httpStatus: 502,
      hint: expect.stringContaining(`fastgpt tool http get ${HTTP_ID}`),
      details: expect.objectContaining({
        outcome: 'unknown',
        appId: HTTP_ID,
        uncertainStep: 'config'
      })
    });

    await expect(
      mcpService.update({
        client: gateway502Client,
        appId: MCP_ID,
        metadata: {},
        config: { headerSecret: { 'X-Key': 'v1' } }
      })
    ).rejects.toMatchObject({
      httpStatus: 502,
      hint: expect.stringContaining(`fastgpt tool mcp get ${MCP_ID}`),
      details: expect.objectContaining({
        outcome: 'unknown',
        appId: MCP_ID,
        uncertainStep: 'config'
      })
    });

    // 8. Legacy scheme-less host:port baseUrl (e.g. api.example.com:8443/v1) works for both run and header-only update,
    // while changing port still enforces credential isolation.
    let legacyPortRunBody: any;
    let legacyPortUpdateBody: any;
    const legacyPortClient = createMockClient(async ({ path, body }) => {
      if (path === '/core/app/detail') {
        return {
          _id: HTTP_ID,
          name: 'LegacyPortHTTP',
          type: 'httpToolSet',
          nodes: [
            {
              toolConfig: {
                httpToolSet: {
                  baseUrl: 'api.example.com:8443/v1',
                  toolList: [
                    {
                      name: 'search',
                      description: 'Search',
                      path: '/search',
                      method: 'GET',
                      headerSecret: { Authorization: { value: 'Bearer port-token' } }
                    }
                  ]
                }
              }
            }
          ]
        };
      }
      if (path === '/core/app/httpTools/runTool') {
        legacyPortRunBody = body;
        return { data: { ok: true } };
      }
      if (path === '/core/app/httpTools/update') {
        legacyPortUpdateBody = body;
        return null;
      }
      return undefined;
    });

    const portRun = await httpService.run({
      client: legacyPortClient,
      input: { appId: HTTP_ID, toolPath: '/search' }
    });
    expect(portRun.changed).toBe(true);
    expect(legacyPortRunBody).toMatchObject({
      baseUrl: 'https://api.example.com:8443/v1',
      toolPath: '/search',
      method: 'GET'
    });

    const portHeaderUpdate = await httpService.update({
      client: legacyPortClient,
      appId: HTTP_ID,
      metadata: {},
      config: { headerSecret: { 'X-Extra': 'new-val' } }
    });
    expect(portHeaderUpdate.changed).toBe(true);
    expect(legacyPortUpdateBody).toMatchObject({
      baseUrl: 'api.example.com:8443/v1',
      headerSecret: { 'X-Extra': { value: 'new-val' } }
    });

    await expect(
      httpService.update({
        client: legacyPortClient,
        appId: HTTP_ID,
        metadata: {},
        config: { baseUrl: 'https://api.example.com:9443/v1' }
      })
    ).rejects.toThrow(/Refusing to retain saved sub-tool headerSecret\/staticHeaders/);
  });
});
