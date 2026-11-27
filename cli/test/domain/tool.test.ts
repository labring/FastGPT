import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import { describe, expect, it, vi } from 'vitest';
import { createHttpToolService } from '../../src/domain/tool/http-tool-service';
import { createMcpToolService } from '../../src/domain/tool/mcp-tool-service';
import { createToolFolderService } from '../../src/domain/tool/tool-folder-service';
import type { FastGptHttpClient } from '../../src/infra/http/fastgpt-http-client';

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
});
