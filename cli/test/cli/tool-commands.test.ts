import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run';
import type { CliFetchFn } from '../../src/shared/types';

const FOLDER_ID = '68ad85a7463006c963799a10';
const MCP_ID = '68ad85a7463006c963799a11';
const HTTP_ID = '68ad85a7463006c963799a12';
const RAW_KEY = 'fastgpt-personal-key-1234567890abcdef123456';

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-tool-'));
  tempDirs.push(dir);
  return dir;
}

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify({ code: status >= 400 ? status : 200, data }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function execCli({
  argv,
  configDir,
  fetchFn
}: {
  argv: string[];
  configDir: string;
  fetchFn?: CliFetchFn;
}) {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const exitCode = await runCli({
    argv,
    env: {
      FASTGPT_CONFIG_DIR: configDir,
      FASTGPT_SECRET_STORE: 'file'
    },
    isTTY: false,
    fetchFn,
    stdout: (line) => stdoutLines.push(line),
    stderr: (line) => stderrLines.push(line)
  });

  return {
    exitCode,
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n')
  };
}

describe('Tool CLI Commands integration (tool folder / tool mcp / tool http)', () => {
  it('enforces token-only authModes and --yes destructive guard locally', async () => {
    const configDir = await makeTempDir();
    let calls = 0;

    const parseWithKey = await execCli({
      configDir,
      argv: [
        'tool',
        'mcp',
        'parse',
        'https://mcp.deepwiki.com/mcp',
        '--api-key',
        RAW_KEY,
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'json'
      ],
      fetchFn: async () => {
        calls += 1;
        return jsonResp([]);
      }
    });
    expect(parseWithKey.exitCode).toBe(3);
    expect(calls).toBe(0);

    const deleteNoYes = await execCli({
      configDir,
      argv: [
        'tool',
        'folder',
        'delete',
        FOLDER_ID,
        '--token',
        'session-token',
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'json'
      ],
      fetchFn: async () => {
        calls += 1;
        return jsonResp([]);
      }
    });
    expect(deleteNoYes.exitCode).toBe(2);
    expect(calls).toBe(0);
  });

  it('keeps --target-url separate from global --base-url on tool http run and create', async () => {
    const configDir = await makeTempDir();
    let seenReqUrl = '';
    let seenRunBody: any;

    const runRes = await execCli({
      configDir,
      argv: [
        'tool',
        'http',
        'run',
        '--base-url',
        'http://127.0.0.1:3000',
        '--token',
        'session-token',
        '--target-url',
        'https://httpbin.org',
        '--tool-path',
        '/get',
        '--method',
        'GET',
        '--params',
        '{"hello":"world"}',
        '--format',
        'json'
      ],
      fetchFn: async (input, init) => {
        const req = input instanceof Request ? input : new Request(input, init);
        seenReqUrl = req.url;
        seenRunBody = await req.clone().json();
        return jsonResp({ data: { args: { hello: 'world' } } });
      }
    });

    expect(runRes.exitCode).toBe(0);
    expect(seenReqUrl).toBe('http://127.0.0.1:3000/api/core/app/httpTools/runTool');
    expect(seenRunBody).toMatchObject({
      baseUrl: 'https://httpbin.org',
      toolPath: '/get',
      method: 'GET',
      params: { hello: 'world' }
    });
  });

  it('executes tool folder create, tool mcp create/update, and tool http create from --file', async () => {
    const configDir = await makeTempDir();
    const httpSpecFile = join(configDir, 'http-spec.json');
    await writeFile(
      httpSpecFile,
      JSON.stringify({
        name: 'HttpBin',
        createType: 'manual',
        baseUrl: 'https://httpbin.org',
        toolList: [{ name: 'echo_get', description: 'Echo', path: '/get', method: 'GET' }]
      }),
      'utf8'
    );

    const fetchFn: CliFetchFn = async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init);
      const path = new URL(req.url).pathname;
      if (path === '/api/core/app/create') return jsonResp(FOLDER_ID);
      if (path === '/api/core/app/mcpTools/getTools') {
        return jsonResp([{ name: 'search', description: 'Search' }]);
      }
      if (path === '/api/core/app/mcpTools/create') return jsonResp(MCP_ID);
      if (path === '/api/core/app/httpTools/create') return jsonResp(HTTP_ID);
      if (path === '/api/core/app/httpTools/update') return jsonResp(null);
      return jsonResp({}, 404);
    };

    const folderRes = await execCli({
      configDir,
      argv: [
        'tool',
        'folder',
        'create',
        '--name',
        'Integrations',
        '--token',
        'session-token',
        '--base-url',
        'http://127.0.0.1:3000',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(folderRes.exitCode).toBe(0);
    expect(JSON.parse(folderRes.stdout).data).toMatchObject({ folderId: FOLDER_ID });

    const mcpRes = await execCli({
      configDir,
      argv: [
        'tool',
        'mcp',
        'create',
        '--name',
        'DeepWiki',
        '--url',
        'https://mcp.deepwiki.com/mcp',
        '--parent-id',
        FOLDER_ID,
        '--token',
        'session-token',
        '--base-url',
        'http://127.0.0.1:3000',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(mcpRes.exitCode).toBe(0);
    expect(JSON.parse(mcpRes.stdout).data).toMatchObject({ appId: MCP_ID, toolCount: 1 });

    const httpRes = await execCli({
      configDir,
      argv: [
        'tool',
        'http',
        'create',
        '--file',
        httpSpecFile,
        '--parent-id',
        FOLDER_ID,
        '--token',
        'session-token',
        '--base-url',
        'http://127.0.0.1:3000',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(httpRes.exitCode).toBe(0);
    expect(JSON.parse(httpRes.stdout).data).toMatchObject({
      appId: HTTP_ID,
      configured: true,
      toolCount: 1
    });

    // tool mcp run --id & tool http run --id auto-load saved config
    const runByIdFetch: CliFetchFn = async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init);
      const path = new URL(req.url).pathname;
      if (path === '/api/core/app/detail') {
        const appId = new URL(req.url).searchParams.get('appId');
        if (appId === MCP_ID) {
          return jsonResp({
            _id: MCP_ID,
            type: 'toolSet',
            nodes: [
              {
                toolConfig: {
                  mcpToolSet: {
                    url: 'https://mcp.example.com/mcp',
                    headerSecret: { X: { value: '1' } }
                  }
                }
              }
            ]
          });
        }
        return jsonResp({
          _id: HTTP_ID,
          type: 'httpToolSet',
          nodes: [
            {
              toolConfig: {
                httpToolSet: { baseUrl: 'https://api.example.com', customHeaders: '{"X-App":"1"}' }
              }
            }
          ]
        });
      }
      if (path === '/api/core/app/mcpTools/runTool') {
        const body = await req.json();
        expect(body.url).toBe('https://mcp.example.com/mcp');
        return jsonResp({ ok: true });
      }
      if (path === '/api/core/app/httpTools/runTool') {
        const body = await req.json();
        expect(body.baseUrl).toBe('https://api.example.com');
        expect(body.customHeaders).toEqual({ 'X-App': '1' });
        return jsonResp({ ok: true });
      }
      return jsonResp({}, 404);
    };

    const mcpRunById = await execCli({
      configDir,
      argv: [
        'tool',
        'mcp',
        'run',
        '--id',
        MCP_ID,
        '--tool',
        'search',
        '--token',
        'session-token',
        '--base-url',
        'http://127.0.0.1:3000',
        '--format',
        'json'
      ],
      fetchFn: runByIdFetch
    });
    expect(mcpRunById.exitCode, mcpRunById.stderr).toBe(0);

    const httpRunById = await execCli({
      configDir,
      argv: [
        'tool',
        'http',
        'run',
        '--id',
        HTTP_ID,
        '--tool-path',
        '/ping',
        '--method',
        'GET',
        '--token',
        'session-token',
        '--base-url',
        'http://127.0.0.1:3000',
        '--format',
        'json'
      ],
      fetchFn: runByIdFetch
    });
    expect(httpRunById.exitCode, httpRunById.stderr).toBe(0);
  });
});
