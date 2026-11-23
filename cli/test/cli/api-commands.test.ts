import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCliCommandSpecs } from '../../src/cli/registry';
import { runCli } from '../../src/cli/run';
import { createNonTtyPrompter, type Prompter } from '../../src/infra/ui/prompter';
import type { CliFetchFn } from '../../src/shared/types';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-api-cmd-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function createOpenApiDocument() {
  return {
    openapi: '3.1.0',
    paths: {
      '/core/dataset/detail': {
        get: {
          summary: 'Get dataset detail',
          tags: ['知识库管理'],
          parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
          responses: {
            200: {
              description: 'Dataset object',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Dataset' }
                }
              }
            }
          }
        }
      },
      '/core/dataset/create': {
        post: {
          summary: 'Create dataset',
          tags: ['知识库管理'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    intro: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: { 200: { description: 'Dataset ID' } }
        }
      },
      '/core/dataset/update': {
        put: {
          summary: 'Update dataset',
          tags: ['知识库管理'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id'],
                  properties: { id: { type: 'string' }, name: { type: 'string' } }
                }
              }
            }
          },
          responses: { 200: { description: 'Updated' } }
        }
      },
      '/core/dataset/delete': {
        delete: {
          summary: 'Delete dataset',
          tags: ['知识库管理'],
          parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Deleted' } }
        }
      },
      '/core/app/del': {
        post: {
          summary: 'Delete app',
          tags: ['应用管理'],
          parameters: [{ name: 'appId', in: 'query', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Deleted' } }
        }
      },
      '/proApi/admin/user/list': {
        get: {
          summary: 'List all users (admin)',
          tags: ['管理员'],
          responses: { 200: { description: 'Users' } }
        }
      }
    },
    components: {
      schemas: {
        Dataset: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' }
          }
        }
      }
    }
  };
}

async function execCli({
  argv,
  configDir,
  cwd,
  isTTY = false,
  fetchFn,
  prompter,
  readStdin
}: {
  argv: string[];
  configDir: string;
  cwd?: string;
  isTTY?: boolean;
  fetchFn?: CliFetchFn;
  prompter?: Prompter;
  readStdin?: () => Promise<string>;
}) {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  const exitCode = await runCli({
    argv,
    cwd: cwd ?? configDir,
    env: {
      FASTGPT_CONFIG_DIR: configDir,
      FASTGPT_SECRET_STORE: 'file'
    },
    isTTY,
    fetchFn,
    prompter,
    readStdin,
    stdout: (line) => stdoutLines.push(line),
    stderr: (line) => stderrLines.push(line)
  });

  return {
    exitCode,
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n')
  };
}

describe('API CLI Commands integration (cli/src/cli/commands/api.ts)', () => {
  it('registers all 6 api commands with accurate metadata and auth modes', () => {
    const apiSpecs = getCliCommandSpecs().filter((spec) => spec.path[0] === 'api');
    expect(apiSpecs.map((spec) => spec.path.join(' '))).toEqual([
      'api schema',
      'api get',
      'api post',
      'api put',
      'api delete',
      'api call'
    ]);
    expect(apiSpecs.every((spec) => spec.authModes.includes('appKey'))).toBe(true);
    expect(apiSpecs.find((spec) => spec.path[1] === 'schema')?.skipAuth?.({ offline: true })).toBe(
      true
    );
    expect(apiSpecs.find((spec) => spec.path[1] === 'delete')?.risk).toBe('destructive');
  });

  it('supports api schema discovery, $ref expansion, caching, and --offline mode', async () => {
    const dir = await makeTempDir();
    const doc = createOpenApiDocument();
    let apidocHits = 0;

    const fetchFn: CliFetchFn = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === 'https://cloud.fastgpt.cn/api/apidoc/systemopenapi.json') {
        apidocHits += 1;
        return new Response(JSON.stringify(doc), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ code: 404, message: 'Not Found' }), { status: 404 });
    };

    // 1. 离线缺缓存时无需凭据即报错 exitCode 2
    const offlineMissing = await execCli({
      configDir: dir,
      argv: ['api', 'schema', '--offline', '--format', 'json'],
      fetchFn
    });
    expect(offlineMissing.exitCode).toBe(2);
    expect(apidocHits).toBe(0);

    // 2. 在线查询并写入本地缓存
    const onlineSearch = await execCli({
      configDir: dir,
      argv: [
        'api',
        'schema',
        '--search',
        'dataset',
        '--method',
        'get',
        '--api-key',
        'fastgpt-test-key',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(onlineSearch.exitCode).toBe(0);
    expect(apidocHits).toBe(1);
    const searchJson = JSON.parse(onlineSearch.stdout);
    expect(searchJson.data.endpoints).toHaveLength(1);
    expect(searchJson.data.endpoints[0].path).toBe('/core/dataset/detail');

    // 3. 离线读取单个路径详情（无需 --token / --api-key），且 /api 前缀自动去重并展开 $ref
    const offlineDetail = await execCli({
      configDir: dir,
      argv: ['api', 'schema', '/api/core/dataset/detail', '--offline', '--format', 'json'],
      fetchFn
    });
    expect(offlineDetail.exitCode).toBe(0);
    expect(apidocHits).toBe(1);
    const detailJson = JSON.parse(offlineDetail.stdout);
    expect(detailJson.data.mode).toBe('detail');
    expect(
      detailJson.data.operations[0].responses['200'].content['application/json'].schema
    ).toEqual(doc.components.schemas.Dataset);
  });

  it('supports repeatable --query/--header, /api dedup, --file/--stdin, and admin warnings', async () => {
    const dir = await makeTempDir();
    const doc = createOpenApiDocument();
    const capturedRequests: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: unknown;
    }> = [];

    const fetchFn: CliFetchFn = async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init);
      if (req.url.endsWith('/api/apidoc/systemopenapi.json')) {
        return new Response(JSON.stringify(doc), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      const headers: Record<string, string> = {};
      req.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const body =
        req.method === 'GET' ? undefined : JSON.parse((await req.clone().text()) || 'null');
      capturedRequests.push({ url: req.url, method: req.method, headers, body });
      return new Response(JSON.stringify({ code: 200, data: { received: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    const getRes = await execCli({
      configDir: dir,
      argv: [
        'api',
        'get',
        '/api/core/dataset/detail',
        '--query',
        'id=ds-1',
        '--query',
        'extra=a=b',
        '--header',
        'X-Custom-One: v1',
        '--header',
        'X-Custom-Two: v2',
        '--token',
        'sess-123',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(getRes.exitCode).toBe(0);
    expect(capturedRequests[0].url).toBe(
      'https://cloud.fastgpt.cn/api/core/dataset/detail?id=ds-1&extra=a%3Db'
    );
    expect(capturedRequests[0].headers['x-custom-one']).toBe('v1');
    expect(capturedRequests[0].headers['x-custom-two']).toBe('v2');
    expect(capturedRequests[0].headers.token).toBe('sess-123');

    // 验证 --file 与 PUT 调用
    const bodyFile = join(dir, 'update.json');
    await writeFile(bodyFile, JSON.stringify({ id: 'ds-1', name: 'Renamed' }));
    const putRes = await execCli({
      configDir: dir,
      argv: [
        'api',
        'call',
        'PUT',
        '/core/dataset/update',
        '--file',
        bodyFile,
        '--token',
        'sess-123',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(putRes.exitCode).toBe(0);
    expect(JSON.parse(putRes.stdout).changed).toBe(true);
    expect(capturedRequests[1].method).toBe('PUT');
    expect(capturedRequests[1].body).toEqual({ id: 'ds-1', name: 'Renamed' });

    // 验证 --stdin 与 POST 调用
    const postRes = await execCli({
      configDir: dir,
      argv: [
        'api',
        'post',
        '/core/dataset/create',
        '--stdin',
        '--token',
        'sess-123',
        '--format',
        'json'
      ],
      readStdin: async () => JSON.stringify({ name: 'From Stdin' }),
      fetchFn
    });
    expect(postRes.exitCode).toBe(0);
    expect(capturedRequests[2].body).toEqual({ name: 'From Stdin' });

    // 验证 /proApi/admin/... 输出管理员告警
    const adminRes = await execCli({
      configDir: dir,
      argv: ['api', 'get', '/proApi/admin/user/list', '--token', 'root-sess', '--format', 'json'],
      fetchFn
    });
    expect(adminRes.exitCode).toBe(0);
    expect(JSON.parse(adminRes.stdout).warnings).toContain(
      'Admin endpoint requested; requires root/admin token.'
    );
  });

  it('rejects SSRF paths, blocked auth headers, and enforces destructive --yes / TTY confirm', async () => {
    const dir = await makeTempDir();
    const doc = createOpenApiDocument();
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/api/apidoc/systemopenapi.json')) {
        return new Response(JSON.stringify(doc), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ code: 200, data: { deleted: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    // 1. SSRF / 路径穿越 / 认证头覆盖全部在发包前以 exitCode 2 拦截
    for (const badArgs of [
      ['api', 'get', 'https://evil.com/core/app/list'],
      ['api', 'get', '//evil.com/steal'],
      ['api', 'get', '/core/%2e%2e/secret'],
      ['api', 'get', '/core/dataset/detail?id=1'],
      [
        'api',
        'get',
        '/core/dataset/detail',
        '--query',
        'id=1',
        '--header',
        'Authorization: Bearer bad'
      ]
    ]) {
      const res = await execCli({
        configDir: dir,
        argv: [...badArgs, '--token', 'sess', '--format', 'json'],
        fetchFn: fetchSpy
      });
      expect(res.exitCode).toBe(2);
    }
    expect(fetchSpy).not.toHaveBeenCalled();

    // 2. POST /core/app/del 在非 TTY 未传 --yes 时返回退出码 2 且不发任何 HTTP 请求
    const blockedPost = await execCli({
      configDir: dir,
      argv: [
        'api',
        'post',
        '/core/app/del',
        '--query',
        'appId=app-1',
        '--token',
        'sess',
        '--format',
        'json'
      ],
      fetchFn: fetchSpy
    });
    expect(blockedPost.exitCode).toBe(2);
    expect(JSON.parse(blockedPost.stderr).error.hint).toContain('--yes');
    expect(fetchSpy).not.toHaveBeenCalled();

    // 3. TTY 交互取消时不发任何 HTTP 请求
    const ttyDenyPrompter: Prompter = {
      ...createNonTtyPrompter(),
      isInteractive: true,
      confirm: vi.fn(async () => false)
    };
    const ttyDenied = await execCli({
      configDir: dir,
      isTTY: true,
      prompter: ttyDenyPrompter,
      argv: ['api', 'post', '/core/app/del', '--query', 'appId=app-1', '--token', 'sess'],
      fetchFn: fetchSpy
    });
    expect(ttyDenied.exitCode).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();

    // 4. POST /core/app/del 传 --yes 正常执行并返回 0
    const allowedPost = await execCli({
      configDir: dir,
      argv: [
        'api',
        'post',
        '/core/app/del',
        '--query',
        'appId=app-1',
        '--yes',
        '--token',
        'sess',
        '--format',
        'json'
      ],
      fetchFn: fetchSpy
    });
    expect(allowedPost.exitCode).toBe(0);
    expect(JSON.parse(allowedPost.stdout).changed).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('supports --dry-run, --no-validate on 404 apidoc, and --raw --output with --overwrite', async () => {
    const dir = await makeTempDir();
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/api/apidoc/systemopenapi.json')) {
        return new Response(JSON.stringify({ code: 404, message: 'Not Found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url.endsWith('/api/custom/binary')) {
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' }
        });
      }
      return new Response(JSON.stringify({ code: 200, data: { custom: 'ok' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    // 1. --dry-run 不触发网络请求
    const dryRun = await execCli({
      configDir: dir,
      argv: [
        'api',
        'post',
        '/core/app/del',
        '--query',
        'appId=app-1',
        '--body',
        '{"secret":"my-secret"}',
        '--dry-run',
        '--token',
        'sess',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(dryRun.exitCode).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(JSON.parse(dryRun.stdout)).toMatchObject({
      changed: false,
      data: {
        dryRun: true,
        risk: 'destructive',
        method: 'POST',
        path: '/core/app/del',
        validated: false,
        body: { secret: '******cret' }
      }
    });

    // 2. 服务端 apidoc 404 时，未传 --no-validate 返回 4，传 --no-validate 放行
    const withoutBypass = await execCli({
      configDir: dir,
      argv: ['api', 'get', '/custom/ping', '--token', 'sess', '--format', 'json'],
      fetchFn
    });
    expect(withoutBypass.exitCode).toBe(4);
    expect(JSON.parse(withoutBypass.stderr).error.hint).toContain('--no-validate');

    const withBypass = await execCli({
      configDir: dir,
      argv: ['api', 'get', '/custom/ping', '--no-validate', '--token', 'sess', '--format', 'json'],
      fetchFn
    });
    expect(withBypass.exitCode).toBe(0);
    expect(JSON.parse(withBypass.stdout).data).toEqual({ custom: 'ok' });

    // 3. --raw --output 写入二进制文件并保护已有文件，--overwrite 允许覆盖
    const outputFile = join(dir, 'download.bin');
    const firstDownload = await execCli({
      configDir: dir,
      argv: [
        'api',
        'get',
        '/custom/binary',
        '--no-validate',
        '--raw',
        '--output',
        outputFile,
        '--token',
        'sess',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(firstDownload.exitCode).toBe(0);
    expect(JSON.parse(firstDownload.stdout)).toMatchObject({
      outputPath: outputFile,
      bytes: 4,
      status: 200
    });
    expect(new Uint8Array(await readFile(outputFile))).toEqual(new Uint8Array([1, 2, 3, 4]));

    const conflictDownload = await execCli({
      configDir: dir,
      argv: [
        'api',
        'get',
        '/custom/binary',
        '--no-validate',
        '--raw',
        '--output',
        outputFile,
        '--token',
        'sess',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(conflictDownload.exitCode).toBe(2);

    const overwriteDownload = await execCli({
      configDir: dir,
      argv: [
        'api',
        'get',
        '/custom/binary',
        '--no-validate',
        '--raw',
        '--output',
        outputFile,
        '--overwrite',
        '--token',
        'sess',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(overwriteDownload.exitCode).toBe(0);

    // 4. --raw 无 --output 时输出 base64 编码的二进制载荷
    const rawBinary = await execCli({
      configDir: dir,
      argv: [
        'api',
        'get',
        '/custom/binary',
        '--no-validate',
        '--raw',
        '--token',
        'sess',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(rawBinary.exitCode).toBe(0);
    expect(JSON.parse(rawBinary.stdout)).toMatchObject({
      status: 200,
      encoding: 'base64',
      bytes: 4,
      body: 'AQIDBA=='
    });
  });

  it('covers api put, api delete, --query-json, required-query validation, and --source dev hints', async () => {
    const dir = await makeTempDir();
    const systemDoc = createOpenApiDocument();
    const devDoc = {
      openapi: '3.1.0',
      paths: {
        '/core/workflow/debug': {
          post: {
            summary: 'Debug workflow',
            tags: ['工作流'],
            responses: { 200: { description: 'OK' } }
          }
        }
      }
    };

    const fetchFn: CliFetchFn = async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init);
      if (req.url.endsWith('/api/apidoc/systemopenapi.json')) {
        return new Response(JSON.stringify(systemDoc), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (req.url.endsWith('/api/apidoc/devapi.json')) {
        return new Response(JSON.stringify(devDoc), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(
        JSON.stringify({ code: 200, data: { method: req.method, url: req.url } }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    };

    // 1. 缺失必填 query 参数被本地 schema 校验拦截
    const missingQuery = await execCli({
      configDir: dir,
      argv: ['api', 'get', '/core/dataset/detail', '--token', 'sess', '--format', 'json'],
      fetchFn
    });
    expect(missingQuery.exitCode).toBe(2);
    expect(JSON.parse(missingQuery.stderr).error.message).toContain('id');

    // 2. api put + api delete (--yes) + --query-json
    const putRes = await execCli({
      configDir: dir,
      argv: [
        'api',
        'put',
        '/core/dataset/update',
        '--body',
        '{"id":"ds-1","name":"New"}',
        '--token',
        'sess',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(putRes.exitCode).toBe(0);
    expect(JSON.parse(putRes.stdout).data.method).toBe('PUT');

    const delBlocked = await execCli({
      configDir: dir,
      argv: [
        'api',
        'delete',
        '/core/dataset/delete',
        '--query-json',
        '{"id":"ds-1"}',
        '--token',
        'sess',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(delBlocked.exitCode).toBe(2);

    const delAllowed = await execCli({
      configDir: dir,
      argv: [
        'api',
        'delete',
        '/core/dataset/delete',
        '--query-json',
        '{"id":"ds-1"}',
        '--yes',
        '--token',
        'sess',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(delAllowed.exitCode).toBe(0);
    expect(JSON.parse(delAllowed.stdout).data).toMatchObject({
      method: 'DELETE',
      url: 'https://cloud.fastgpt.cn/api/core/dataset/delete?id=ds-1'
    });

    // 3. system 缺少内部路径时提示 --source dev，切到 --source dev 放行
    const systemMissing = await execCli({
      configDir: dir,
      argv: [
        'api',
        'post',
        '/core/workflow/debug',
        '--body',
        '{}',
        '--token',
        'sess',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(systemMissing.exitCode).toBe(2);
    expect(JSON.parse(systemMissing.stderr).error.hint).toContain('--source dev');

    const devAllowed = await execCli({
      configDir: dir,
      argv: [
        'api',
        'post',
        '/core/workflow/debug',
        '--source',
        'dev',
        '--body',
        '{}',
        '--token',
        'sess',
        '--format',
        'json'
      ],
      fetchFn
    });
    expect(devAllowed.exitCode).toBe(0);
    expect(JSON.parse(devAllowed.stdout).data.method).toBe('POST');
  });
});
