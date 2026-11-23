import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyApiRisk,
  createApiCallerService,
  normalizeApiRequestPath
} from '../../src/domain/api/api-caller-service';
import {
  createOpenapiCacheService,
  DEFAULT_APIDOC_TTL_MS
} from '../../src/domain/api/openapi-cache-service';
import { createFileApidocCacheStore } from '../../src/infra/cache/apidoc-cache-store';
import { createNodeFileIoAdapter } from '../../src/infra/fs/file-io';
import { createFastGptHttpClient } from '../../src/infra/http/fastgpt-http-client';
import { createNonTtyPrompter, type Prompter } from '../../src/infra/ui/prompter';
import { CliApiError, CliArgumentError } from '../../src/shared/errors';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-api-domain-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function createSampleOpenApiDoc() {
  return {
    openapi: '3.1.0',
    paths: {
      '/core/dataset/detail': {
        get: {
          summary: 'Get dataset detail',
          description: 'Fetch dataset metadata by ID',
          tags: ['知识库管理'],
          parameters: [
            {
              name: 'id',
              in: 'query',
              required: true,
              schema: { type: 'string' }
            }
          ],
          responses: {
            200: {
              description: 'Dataset detail',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/DatasetDetail' }
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
                schema: { $ref: '#/components/schemas/CreateDatasetBody' }
              }
            }
          },
          responses: {
            200: { description: 'Created ID' }
          }
        }
      },
      '/core/app/del': {
        post: {
          deprecated: true,
          summary: 'Delete app (legacy POST)',
          tags: ['应用管理'],
          parameters: [{ name: 'appId', in: 'query', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Deleted' }
          }
        }
      },
      '/core/workflow/node': {
        post: {
          summary: 'Recursive node tree',
          tags: ['工作流'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TreeNode' }
              }
            }
          },
          responses: {
            200: {
              description: 'Node response',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Deep0' }
                }
              }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        DatasetDetail: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' }
          }
        },
        CreateDatasetBase: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' }
          }
        },
        CreateDatasetBody: {
          allOf: [
            { $ref: '#/components/schemas/CreateDatasetBase' },
            {
              type: 'object',
              properties: {
                intro: { type: 'string' }
              }
            }
          ]
        },
        TreeNode: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
            parent: { $ref: '#/components/schemas/TreeNodeSibling' }
          }
        },
        TreeNodeSibling: {
          type: 'object',
          properties: {
            child: { $ref: '#/components/schemas/TreeNode' }
          }
        },
        Deep0: { type: 'object', properties: { next: { $ref: '#/components/schemas/Deep1' } } },
        Deep1: { type: 'object', properties: { next: { $ref: '#/components/schemas/Deep2' } } },
        Deep2: { type: 'object', properties: { next: { $ref: '#/components/schemas/Deep3' } } },
        Deep3: { type: 'object', properties: { next: { $ref: '#/components/schemas/Deep4' } } },
        Deep4: { type: 'object', properties: { next: { $ref: '#/components/schemas/Deep5' } } },
        Deep5: { type: 'object', properties: { next: { $ref: '#/components/schemas/Deep6' } } },
        Deep6: { type: 'object', properties: { next: { $ref: '#/components/schemas/Deep7' } } },
        Deep7: { type: 'object', properties: { value: { type: 'string' } } }
      }
    }
  };
}

describe('API Escape Hatch Domain Services', () => {
  it('normalizes relative API paths and blocks SSRF, traversal, control chars, and inline queries', () => {
    expect(normalizeApiRequestPath('/api/core/app/list')).toBe('/core/app/list');
    expect(normalizeApiRequestPath('/core/app/list')).toBe('/core/app/list');
    expect(normalizeApiRequestPath('core/app/list')).toBe('/core/app/list');
    expect(normalizeApiRequestPath('api/core/app/list')).toBe('/core/app/list');
    expect(normalizeApiRequestPath('/api')).toBe('/');
    expect(normalizeApiRequestPath('/api/')).toBe('/');
    expect(normalizeApiRequestPath('api')).toBe('/');
    expect(normalizeApiRequestPath('/apiDataset/detail')).toBe('/apiDataset/detail');

    for (const invalidPath of [
      '',
      '   ',
      'https://evil.com/core/app/list',
      'http://127.0.0.1:3000/api/core/app/list',
      'javascript:alert(1)',
      '//evil.com/steal',
      '/api//evil.com/steal',
      '/core/../etc/passwd',
      '/core/%2e%2e/secret',
      '/core/%252e%252e/secret',
      '/core/app/list?id=1',
      '/core/app/list#hash',
      '/core/app/list\r\nX-Test: 1'
    ]) {
      expect(() => normalizeApiRequestPath(invalidPath)).toThrow(CliArgumentError);
    }
  });

  it('classifies dynamic risk and admin endpoint warnings accurately without false positives', () => {
    expect(classifyApiRisk('GET', '/core/app/del')).toEqual({
      risk: 'read',
      isAdmin: false,
      warnings: []
    });
    expect(classifyApiRisk('DELETE', '/core/dataset/detail')).toEqual({
      risk: 'destructive',
      isAdmin: false,
      warnings: []
    });

    for (const destructivePath of [
      '/core/app/del',
      '/core/app/delete',
      '/core/chat/history/delHistory',
      '/core/chat/history/clearHistories',
      '/core/chat/history/batchDelete',
      '/core/dataset/remove',
      '/proApi/support/wallet/bill/cancel',
      '/core/plugin/admin/tool/runtimeConfig/reset',
      '/core/cache/purge',
      '/core/table/drop'
    ]) {
      expect(classifyApiRisk('POST', destructivePath).risk).toBe('destructive');
      expect(classifyApiRisk('PUT', destructivePath).risk).toBe('destructive');
    }

    for (const safeWritePath of [
      '/core/ai/model/list',
      '/core/dataset/detail',
      '/core/app/deliver',
      '/proApi/admin/system/inform/modelDeprecation/list'
    ]) {
      expect(classifyApiRisk('POST', safeWritePath).risk).toBe('write');
    }

    expect(classifyApiRisk('GET', '/proApi/admin/user/list')).toEqual({
      risk: 'read',
      isAdmin: true,
      warnings: ['Admin endpoint requested; requires root/admin token.']
    });
    expect(classifyApiRisk('POST', '/admin/user/delete')).toEqual({
      risk: 'destructive',
      isAdmin: true,
      warnings: ['Admin endpoint requested; requires root/admin token.']
    });
  });

  it('caches OpenAPI docs with TTL, supports offline/refresh/404 hints, and resolves $ref safely', async () => {
    const dir = await makeTempDir();
    const cacheStore = createFileApidocCacheStore({ configDir: dir });
    const cacheService = createOpenapiCacheService({ cacheStore });
    const doc = createSampleOpenApiDoc();

    let fetchCount = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      fetchCount += 1;
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/api/apidoc/systemopenapi.json')) {
        return new Response(JSON.stringify(doc), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ code: 404, message: 'Not Found', data: null }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });

    const client = createFastGptHttpClient({
      baseUrl: 'https://cloud.fastgpt.cn/api',
      cliVersion: '0.1.0',
      fetchFn
    });

    // 1. 离线模式缺缓存直接抛 CliArgumentError
    await expect(
      cacheService.getDocument({
        baseUrl: client.baseUrl,
        source: 'system',
        offline: true
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    // 2. 首次拉取并缓存；二次读取命中本地缓存
    const first = await cacheService.getDocument({
      client,
      source: 'system',
      now: 1_000_000
    });
    expect(first.fromCache).toBe(false);
    expect(fetchCount).toBe(1);

    const second = await cacheService.getDocument({
      client,
      source: 'system',
      now: 1_000_000 + DEFAULT_APIDOC_TTL_MS - 1000
    });
    expect(second.fromCache).toBe(true);
    expect(fetchCount).toBe(1);

    // 3. TTL 过期后重新拉取；--refresh 强制拉取
    const expiredRefetch = await cacheService.getDocument({
      client,
      source: 'system',
      now: 1_000_000 + DEFAULT_APIDOC_TTL_MS + 1
    });
    expect(expiredRefetch.fromCache).toBe(false);
    expect(fetchCount).toBe(2);

    const forced = await cacheService.getDocument({
      client,
      source: 'system',
      refresh: true,
      now: 1_000_000 + DEFAULT_APIDOC_TTL_MS + 2
    });
    expect(forced.fromCache).toBe(false);
    expect(fetchCount).toBe(3);

    // 4. 离线命中缓存且过期时返回告警而不发网
    const offlineStale = await cacheService.getDocument({
      baseUrl: client.baseUrl,
      source: 'system',
      offline: true,
      now: 1_000_000 + DEFAULT_APIDOC_TTL_MS * 3
    });
    expect(offlineStale.fromCache).toBe(true);
    expect(offlineStale.warnings.length).toBe(1);
    expect(fetchCount).toBe(3);

    // 5. apidoc 404 抛出包含 --no-validate 的 CliApiError
    await expect(
      cacheService.getDocument({
        client,
        source: 'dev'
      })
    ).rejects.toMatchObject({
      code: 'API_ERROR',
      exitCode: 4,
      hint: expect.stringContaining('--no-validate')
    });

    // 6. inspectSchema 列表筛选与单项 $ref 循环保护（含 depth=6 截断）
    const listResult = await cacheService.inspectSchema({
      baseUrl: client.baseUrl,
      source: 'system',
      offline: true,
      search: 'dataset',
      method: 'post',
      tag: '知识库管理'
    });
    expect(listResult.mode).toBe('list');
    if (listResult.mode === 'list') {
      expect(listResult.endpoints).toEqual([
        {
          path: '/core/dataset/create',
          methods: ['POST'],
          summary: 'Create dataset',
          tags: ['知识库管理'],
          deprecated: false
        }
      ]);
    }

    const cycleDetail = await cacheService.inspectSchema({
      baseUrl: client.baseUrl,
      source: 'system',
      offline: true,
      path: '/api/core/workflow/node'
    });
    expect(cycleDetail.mode).toBe('detail');
    if (cycleDetail.mode === 'detail') {
      const op = cycleDetail.operations[0];
      expect(op.requestBody?.requiredFields).toEqual(['id']);
      const schemaStr = JSON.stringify(op.requestBody?.schema);
      expect(schemaStr).toContain('"circular":true');
      const respStr = JSON.stringify(op.responses);
      expect(respStr).toContain('"truncated":true');
    }

    await expect(
      cacheService.inspectSchema({
        baseUrl: client.baseUrl,
        source: 'system',
        offline: true,
        path: '/core/dataset/detial'
      })
    ).rejects.toMatchObject({
      code: 'CLI_ARGUMENT_INVALID',
      hint: expect.stringContaining('/core/dataset/detail')
    });
  });

  it('validates query, headers, body, destructive gates, dry-run redaction, and raw output', async () => {
    const dir = await makeTempDir();
    const cacheStore = createFileApidocCacheStore({ configDir: dir });
    const cacheService = createOpenapiCacheService({ cacheStore });
    const fileIo = createNodeFileIoAdapter({ cwd: dir });
    const doc = createSampleOpenApiDoc();

    await cacheStore.write({
      fetchedAt: Date.now(),
      source: 'system',
      baseUrl: 'https://cloud.fastgpt.cn/api',
      document: doc
    });

    const requests: Array<{ url: string; method: string; body?: string }> = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      const bodyText = req.method === 'GET' ? undefined : await req.clone().text();
      requests.push({ url: req.url, method: req.method, body: bodyText });
      if (req.url.includes('/core/dataset/export')) {
        return new Response('col1,col2\n1,2\n', {
          status: 200,
          headers: { 'content-type': 'text/csv; charset=utf-8' }
        });
      }
      return new Response(JSON.stringify({ code: 200, data: { ok: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    const client = createFastGptHttpClient({
      baseUrl: 'https://cloud.fastgpt.cn/api',
      cliVersion: '0.1.0',
      fetchFn
    });

    const caller = createApiCallerService({
      openapiCacheService: cacheService,
      fileIo,
      prompter: createNonTtyPrompter(),
      readStdin: async () => ''
    });

    // 1. dry-run 不发网络请求且脱敏敏感字段
    const dryRunRes = await caller.execute({
      client,
      input: {
        method: 'POST',
        path: '/api/core/dataset/create',
        body: JSON.stringify({
          name: 'Secret DS',
          apiKey: 'fastgpt-secret-key-1234567890abcdef123456'
        }),
        headerPairs: ['X-Trace: trace-1'],
        dryRun: true
      }
    });
    expect(dryRunRes.changed).toBe(false);
    expect(requests).toHaveLength(0);
    expect(dryRunRes.data).toMatchObject({
      dryRun: true,
      method: 'POST',
      path: '/core/dataset/create',
      validated: true,
      body: {
        name: 'Secret DS',
        apiKey: 'fastgpt-******3456'
      }
    });

    // 2. 缺失必填字段被本地 OpenAPI 预检拦截
    await expect(
      caller.execute({
        client,
        input: {
          method: 'POST',
          path: '/core/dataset/create',
          body: JSON.stringify({ intro: 'missing name' })
        }
      })
    ).rejects.toMatchObject({ code: 'CLI_ARGUMENT_INVALID', exitCode: 2 });

    // 3. 重复 query key 与禁用鉴权请求头报错
    await expect(
      caller.execute({
        client,
        input: {
          method: 'GET',
          path: '/core/dataset/detail',
          queryPairs: ['id=1', 'id=2']
        }
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    await expect(
      caller.execute({
        client,
        input: {
          method: 'GET',
          path: '/core/dataset/detail',
          queryPairs: ['id=1'],
          queryJson: '{"id":"2"}'
        }
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    await expect(
      caller.execute({
        client,
        input: {
          method: 'GET',
          path: '/core/dataset/detail',
          queryPairs: ['id=1'],
          headerPairs: ['Authorization: Bearer secret']
        }
      })
    ).rejects.toMatchObject({
      code: 'CLI_ARGUMENT_INVALID',
      hint: expect.stringContaining('--token')
    });

    // 4. TTY 下取消破坏性请求不发送任何 HTTP 请求
    const cancelPrompter: Prompter = {
      ...createNonTtyPrompter(),
      isInteractive: true,
      confirm: vi.fn(async () => false)
    };
    const ttyCaller = createApiCallerService({
      openapiCacheService: cacheService,
      fileIo,
      prompter: cancelPrompter,
      readStdin: async () => ''
    });

    await expect(
      ttyCaller.execute({
        client,
        input: {
          method: 'POST',
          path: '/core/app/del',
          queryPairs: ['appId=app1'],
          format: 'text'
        }
      })
    ).rejects.toBeInstanceOf(CliArgumentError);
    expect(requests).toHaveLength(0);

    // 5. --raw --no-validate 获取文本响应与 --output 原子落盘
    const rawRes = await caller.execute({
      client,
      input: {
        method: 'GET',
        path: '/core/dataset/export',
        validate: false,
        raw: true
      }
    });
    expect(rawRes.changed).toBe(false);
    expect(rawRes.data).toMatchObject({
      status: 200,
      encoding: 'utf8',
      body: 'col1,col2\n1,2\n'
    });

    const outRes = await caller.execute({
      client,
      input: {
        method: 'GET',
        path: '/core/dataset/export',
        validate: false,
        output: 'export.csv'
      }
    });
    expect(outRes.changed).toBe(true);
    expect(outRes.data).toMatchObject({
      outputPath: join(dir, 'export.csv'),
      bytes: 14,
      status: 200
    });
  });

  it('re-throws CliApiError on 404 apidoc when called without --no-validate', async () => {
    const dir = await makeTempDir();
    const cacheStore = createFileApidocCacheStore({ configDir: dir });
    const cacheService = createOpenapiCacheService({ cacheStore });
    const client = createFastGptHttpClient({
      baseUrl: 'https://cloud.fastgpt.cn/api',
      cliVersion: '0.1.0',
      fetchFn: async () => new Response('Not Found', { status: 404 })
    });
    const caller = createApiCallerService({
      openapiCacheService: cacheService,
      fileIo: createNodeFileIoAdapter({ cwd: dir }),
      prompter: createNonTtyPrompter(),
      readStdin: async () => ''
    });

    await expect(
      caller.execute({
        client,
        input: { method: 'GET', path: '/core/dataset/detail', queryPairs: ['id=1'] }
      })
    ).rejects.toBeInstanceOf(CliApiError);
  });
});
