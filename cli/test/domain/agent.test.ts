import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { describe, expect, it, vi } from 'vitest';
import { createAgentLogsService } from '../../src/domain/agent/agent-logs-service';
import { createAgentService } from '../../src/domain/agent/agent-service';
import { createAgentVersionService } from '../../src/domain/agent/agent-version-service';
import type { FastGptHttpClient } from '../../src/infra/http/fastgpt-http-client';
import { CliArgumentError } from '../../src/shared/errors';

const AGENT_ID = '68ad85a7463006c963799a05';
const FOLDER_ID = '68ad85a7463006c963799a06';
const VERSION_ID = '68ad85a7463006c963799a07';
const TOOL_ID = '68ad85a7463006c963799a08';

function createMockClient(
  handler: (params: { method: string; path: string; query?: unknown; body?: unknown }) => unknown
): FastGptHttpClient {
  return {
    baseUrl: 'http://localhost:3005/api',
    request: vi.fn(async (params) => handler(params)) as any,
    requestRaw: vi.fn() as any,
    uploadMultipart: vi.fn() as any,
    uploadBinary: vi.fn() as any,
    putPresignedUrl: vi.fn() as any,
    streamSse: vi.fn() as any
  };
}

describe('Agent Domain Services (agent / folder / version / logs)', () => {
  it('scopes agent list strictly to the Agent tree and rejects workflow/tool types', async () => {
    const agentService = createAgentService();
    let seenBody: unknown;
    const client = createMockClient(({ body }) => {
      seenBody = body;
      return { total: 1, list: [{ _id: AGENT_ID, name: 'Bot', type: AppTypeEnum.chatAgent }] };
    });

    const listRes = await agentService.list({ client, input: { page: 1, pageSize: 10 } });
    expect(seenBody).toMatchObject({
      type: [AppTypeEnum.chatAgent, AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.folder],
      pageNum: 1,
      pageSize: 10
    });
    expect(listRes.meta).toMatchObject({ total: 1, count: 1, hasMore: false });

    await expect(
      agentService.list({ client, input: { type: ['workflow'] } })
    ).rejects.toMatchObject({
      hint: expect.stringContaining('--type advanced')
    });
    await expect(
      agentService.list({ client, input: { type: [AppTypeEnum.mcpToolSet] } })
    ).rejects.toBeInstanceOf(CliArgumentError);
  });

  it('guards agent create against raw workflow.json, folder, workflow alias, and tool types', async () => {
    const agentService = createAgentService();
    const client = createMockClient(() => AGENT_ID);

    await expect(
      agentService.create({
        client,
        input: { schemaVersion: 'fastgpt-workflow/v1', name: 'Flow', type: 'advanced' }
      })
    ).rejects.toMatchObject({
      hint: expect.stringContaining('fastgpt workflow-build build')
    });

    await expect(
      agentService.create({ client, input: { name: 'F', type: 'workflow' } })
    ).rejects.toMatchObject({
      hint: expect.stringContaining('--type advanced')
    });

    await expect(
      agentService.create({ client, input: { name: 'Folder', type: AppTypeEnum.folder } })
    ).rejects.toMatchObject({
      hint: expect.stringContaining('agent folder create')
    });

    await expect(
      agentService.create({ client, input: { name: 'MCP', type: AppTypeEnum.mcpToolSet } })
    ).rejects.toMatchObject({
      hint: expect.stringContaining('fastgpt tool')
    });

    const dryRun = await agentService.create({
      client,
      input: { name: 'Support Bot', type: AppTypeEnum.chatAgent, intro: 'Helper' },
      dryRun: true
    });
    expect(dryRun.changed).toBe(false);
    expect(dryRun.data).toMatchObject({ dryRun: true, operation: 'agent create', risk: 'write' });
    expect(client.request).not.toHaveBeenCalled();

    const created = await agentService.create({
      client,
      input: { name: 'Support Bot' }
    });
    expect(created.changed).toBe(true);
    expect(created.data).toMatchObject({
      agentId: AGENT_ID,
      name: 'Support Bot',
      type: AppTypeEnum.chatAgent
    });

    const createdAutoAdv = await agentService.create({
      client,
      input: {
        name: 'Auto Flow',
        nodes: [
          { nodeId: 'start', name: 'Start', flowNodeType: 'workflowStart', inputs: [], outputs: [] }
        ]
      },
      dryRun: true
    });
    expect((createdAutoAdv.data as any).payload.type).toBe(AppTypeEnum.workflow);
  });

  it('enforces resource type guards on getDetail, update, delete, and folder operations', async () => {
    const agentService = createAgentService();
    const client = createMockClient(({ method, path, query }) => {
      const appId = (query as { appId?: string } | undefined)?.appId;
      if (method === 'GET' && path === '/core/app/detail') {
        if (appId === FOLDER_ID) return { _id: FOLDER_ID, type: AppTypeEnum.folder, name: 'Dir' };
        if (appId === TOOL_ID) return { _id: TOOL_ID, type: AppTypeEnum.mcpToolSet, name: 'MCP' };
        return { _id: AGENT_ID, type: AppTypeEnum.simple, name: 'Agent' };
      }
      if (method === 'POST' && path === '/core/app/create') return FOLDER_ID;
      if (method === 'DELETE' && path === '/core/app/del') return [appId];
      return undefined;
    });

    await expect(agentService.getDetail({ client, agentId: FOLDER_ID })).rejects.toBeInstanceOf(
      CliArgumentError
    );
    await expect(
      agentService.update({ client, agentId: TOOL_ID, input: { name: 'Wrong' } })
    ).rejects.toBeInstanceOf(CliArgumentError);
    await expect(
      agentService.updateFolder({ client, folderId: AGENT_ID, input: { name: 'Wrong' } })
    ).rejects.toBeInstanceOf(CliArgumentError);
    await expect(agentService.deleteFolder({ client, folderId: TOOL_ID })).rejects.toBeInstanceOf(
      CliArgumentError
    );

    const detail = await agentService.getDetail({ client, agentId: AGENT_ID });
    expect(detail.data?._id).toBe(AGENT_ID);

    const updated = await agentService.update({
      client,
      agentId: AGENT_ID,
      input: { name: 'Renamed' }
    });
    expect(updated.changed).toBe(true);

    const deleted = await agentService.delete({ client, agentId: AGENT_ID });
    expect(deleted.data).toMatchObject({ deleted: true, agentId: AGENT_ID });

    const createdFolder = await agentService.createFolder({
      client,
      input: { name: 'Root Folder' }
    });
    expect(createdFolder.data).toMatchObject({ folderId: FOLDER_ID, name: 'Root Folder' });

    const deletedFolder = await agentService.deleteFolder({ client, folderId: FOLDER_ID });
    expect(deletedFolder.data).toMatchObject({ deleted: true, folderId: FOLDER_ID });
  });

  it('handles agent version list, latest vs specific detail, and version rename', async () => {
    const versionService = createAgentVersionService();
    const seen: Array<{ method: string; path: string; query?: unknown; body?: unknown }> = [];
    const client = createMockClient((req) => {
      seen.push(req);
      if (req.path === '/core/app/version/list') {
        return { total: 2, list: [{ _id: VERSION_ID, versionName: 'v1' }] };
      }
      if (req.path === '/core/app/version/latest') {
        return { versionId: VERSION_ID, versionName: 'v1', nodes: [], edges: [] };
      }
      if (req.path === '/core/app/version/detail') {
        return { _id: VERSION_ID, appId: AGENT_ID, versionName: 'v1', nodes: [], edges: [] };
      }
      return undefined;
    });

    const listRes = await versionService.list({
      client,
      input: { appId: AGENT_ID, isPublish: true, page: 1, pageSize: 1 }
    });
    expect(listRes.meta).toMatchObject({ total: 2, count: 1, hasMore: true });

    const latestRes = await versionService.getDetail({ client, appId: AGENT_ID });
    expect(latestRes.data).toMatchObject({ versionId: VERSION_ID });

    const specificRes = await versionService.getDetail({
      client,
      appId: AGENT_ID,
      versionId: VERSION_ID
    });
    expect(specificRes.data).toMatchObject({ _id: VERSION_ID });

    const updateRes = await versionService.update({
      client,
      input: { appId: AGENT_ID, versionId: VERSION_ID, versionName: 'v2-stable' }
    });
    expect(updateRes.changed).toBe(true);
    expect(seen.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /core/app/version/list',
      'GET /core/app/version/latest',
      'GET /core/app/version/detail',
      'PUT /core/app/version/update'
    ]);
  });

  it('handles agent logs cursor pagination, default 7-day window, and appKey binding guards', async () => {
    const logsService = createAgentLogsService();
    const seenBodies: Array<Record<string, unknown>> = [];
    const client = createMockClient(({ path, body }) => {
      seenBodies.push(body as Record<string, unknown>);
      if (path === '/core/app/logs/search') {
        return {
          list: [{ _id: AGENT_ID, chatId: 'c1', title: 'Hello' }],
          nextCursor: { timestamp: 1735689600000, id: AGENT_ID }
        };
      }
      return { total: 1, list: [{ outLinkUid: null, tmbId: 't1', name: 'root', count: 3 }] };
    });

    // Session/personalKey requires explicit appId
    await expect(
      logsService.list({
        client,
        credential: { kind: 'token' },
        input: {}
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    // App API key allows omitting appId and rejects mismatching appId
    await expect(
      logsService.list({
        client,
        credential: { kind: 'appKey', boundAppId: AGENT_ID },
        input: { appId: FOLDER_ID }
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    const appKeyRes = await logsService.list({
      client,
      credential: { kind: 'appKey', boundAppId: AGENT_ID },
      input: { errorFilter: 'has_error', feedbackType: 'bad', unreadOnly: true }
    });
    expect(appKeyRes.meta).toEqual({
      count: 1,
      hasMore: true,
      nextCursor: { timestamp: 1735689600000, id: AGENT_ID }
    });
    expect(seenBodies[0]).not.toHaveProperty('appId');
    expect(typeof seenBodies[0].dateStart).toBe('string');
    expect(typeof seenBodies[0].dateEnd).toBe('string');

    const usersRes = await logsService.listUsers({
      client,
      credential: { kind: 'token' },
      input: { appId: AGENT_ID, searchKey: 'root', sources: ['online'], page: 1, pageSize: 20 }
    });
    expect(usersRes.meta).toMatchObject({ total: 1, count: 1, hasMore: false });
    expect(seenBodies[1]).toMatchObject({
      appId: AGENT_ID,
      searchKey: 'root',
      sources: ['online']
    });
  });
});
