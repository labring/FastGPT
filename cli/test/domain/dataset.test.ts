import { describe, expect, it, vi } from 'vitest';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { createDatasetService } from '../../src/domain/dataset/dataset-service';
import type { FastGptHttpClient } from '../../src/infra/http/fastgpt-http-client';

function createMockHttpClient(handler: (params: any) => Promise<any>): FastGptHttpClient {
  return {
    baseUrl: 'https://cloud.fastgpt.cn/api',
    request: vi.fn(handler),
    requestRaw: vi.fn(),
    uploadMultipart: vi.fn(),
    streamSse: vi.fn()
  };
}

describe('DatasetService (cli/src/domain/dataset/dataset-service.ts)', () => {
  const service = createDatasetService();

  it('lists datasets with default pagination and search filter', async () => {
    let capturedBody: any;
    const client = createMockHttpClient(async ({ method, path, body }) => {
      expect(method).toBe('POST');
      expect(path).toBe('/core/dataset/listV2');
      capturedBody = body;
      return {
        total: 1,
        list: [
          {
            _id: '68ad85a7463006c963799a05',
            name: 'HR Manual',
            type: 'dataset',
            avatar: '/imgs/avatar.png',
            vectorModel: { model: 'text-embedding-3-small' }
          }
        ]
      };
    });

    const res = await service.list({
      client,
      input: { searchKey: 'HR', page: 2, pageSize: 10 }
    });

    expect(capturedBody).toEqual({
      pageNum: 2,
      pageSize: 10,
      parentId: null,
      searchKey: 'HR'
    });
    expect(res.changed).toBe(false);
    expect(res.data?.list).toHaveLength(1);
    expect(res.meta).toEqual({
      total: 1,
      page: 2,
      pageSize: 10,
      hasMore: false,
      count: 1
    });

    // 分页超上限参数（如 1000）被 Schema 截断为 500 时，meta.pageSize 必须如实反映 500（R4）
    const clampRes = await service.list({
      client,
      input: { page: 1, pageSize: 1000 }
    });
    expect(capturedBody.pageSize).toBe(500);
    expect(clampRes.meta?.pageSize).toBe(500);
  });

  it('fetches dataset detail and validates required datasetId', async () => {
    const validId = '68ad85a7463006c963799a05';
    const client = createMockHttpClient(async ({ method, path, query }) => {
      expect(method).toBe('GET');
      expect(path).toBe('/core/dataset/detail');
      expect(query.id).toBe(validId);
      return {
        _id: validId,
        name: 'Technical Specs',
        type: 'dataset'
      };
    });

    await expect(service.getDetail({ client, datasetId: '' })).rejects.toThrow();

    const res = await service.getDetail({ client, datasetId: validId });
    expect(res.data?._id).toBe(validId);
  });

  it('creates dataset with dryRun and real execution', async () => {
    let requestMade = false;
    const client = createMockHttpClient(async ({ body }) => {
      requestMade = true;
      expect(body.name).toBe('Finance');
      return 'new-dataset-id-456';
    });

    const dryRunRes = await service.create({
      client,
      input: { name: 'Finance', type: 'dataset' },
      dryRun: true
    });
    expect(requestMade).toBe(false);
    expect(dryRunRes.changed).toBe(false);
    expect(dryRunRes.data).toHaveProperty('dryRun', true);
    expect(dryRunRes.data).toHaveProperty('risk', 'write');

    const realRes = await service.create({
      client,
      input: { name: 'Finance', type: 'dataset' }
    });
    expect(requestMade).toBe(true);
    expect(realRes.changed).toBe(true);
    expect(realRes.data).toEqual({ datasetId: 'new-dataset-id-456', name: 'Finance' });
  });

  it('updates dataset properties with dryRun and execution', async () => {
    const validId = '68ad85a7463006c963799a05';
    let capturedBody: any;
    const client = createMockHttpClient(async ({ body }) => {
      capturedBody = body;
      return {};
    });

    const dryRes = await service.update({
      client,
      datasetId: validId,
      input: { name: 'Renamed', parentId: null },
      dryRun: true
    });
    expect(dryRes.changed).toBe(false);
    expect(dryRes.data).toHaveProperty('dryRun', true);
    expect(dryRes.data).toHaveProperty('risk', 'write');

    const realRes = await service.update({
      client,
      datasetId: validId,
      input: { name: 'Renamed', intro: 'New intro', parentId: null }
    });
    expect(realRes.changed).toBe(true);
    expect(capturedBody).toEqual({
      id: validId,
      name: 'Renamed',
      intro: 'New intro',
      parentId: null
    });
  });

  it('deletes a dataset via DELETE method and supports dryRun preview', async () => {
    const validId = '68ad85a7463006c963799a05';
    let deleteCalled = false;
    const client = createMockHttpClient(async ({ method, path, query }) => {
      expect(method).toBe('DELETE');
      expect(path).toBe('/core/dataset/delete');
      expect(query.id).toBe(validId);
      deleteCalled = true;
      return {};
    });

    const dryRes = await service.delete({ client, datasetId: validId, dryRun: true });
    expect(deleteCalled).toBe(false);
    expect(dryRes.changed).toBe(false);
    expect(dryRes.data).toHaveProperty('dryRun', true);
    expect(dryRes.data).toHaveProperty('risk', 'destructive');

    const res = await service.delete({ client, datasetId: validId });
    expect(deleteCalled).toBe(true);
    expect(res.changed).toBe(true);
    expect(res.data).toEqual({ datasetId: validId, deleted: true });
  });

  it.each([
    {
      options: {},
      expected: { budget: { topk: 20 }, similarity: 0, mode: 'embedding', enabled: false }
    },
    {
      options: {
        maxTokens: 25000,
        similarity: 0.5,
        mode: DatasetSearchModeEnum.fullTextRecall,
        rerank: { enabled: true }
      },
      expected: {
        budget: { maxTokens: 25000 },
        similarity: 0.5,
        mode: 'fullTextRecall',
        enabled: true
      }
    },
    {
      options: { topk: 5, maxTokens: 0, similarity: 0, rerank: { enabled: false } },
      expected: { budget: { topk: 5 }, similarity: 0, mode: 'embedding', enabled: false }
    }
  ] as const)(
    'maps CLI search options to the unified search API: $options',
    async ({ options, expected }) => {
      const validId = '68ad85a7463006c963799a05';
      let capturedBody: any;
      const client = createMockHttpClient(async ({ method, path, body }) => {
        expect(method).toBe('POST');
        expect(path).toBe('/core/dataset/search');
        capturedBody = body;
        return {
          list: [
            {
              id: 'c-1',
              q: 'FastGPT introduction',
              a: 'Platform for LLM knowledge bases',
              score: [{ type: 'reRank', value: 0.91, index: 0 }],
              sourceName: 'readme.md'
            }
          ],
          meta: { durationMs: 412, usingReRank: expected.enabled, usingSimilarityFilter: true }
        };
      });

      const res = await service.search({
        client,
        input: {
          datasetIds: ` ${validId} `,
          text: ' What is FastGPT? ',
          ...options
        }
      });

      expect(capturedBody).toEqual({
        scope: { datasetIds: [validId] },
        query: { text: 'What is FastGPT?', imageKeys: [] },
        retrieval: { mode: expected.mode, embeddingWeight: 0.5 },
        rerank: expected.enabled ? { enabled: true, weight: 0.5 } : { enabled: false },
        queryExtension: { enabled: false },
        result: { ...expected.budget, similarity: expected.similarity },
        usageScene: 'search'
      });
      expect(res.data?.list).toHaveLength(1);
      expect(res.data?.meta.durationMs).toBe(412);
      expect(res.message).toBe(`Retrieved 1 chunks (412ms) using mode "${expected.mode}"`);
    }
  );

  it.each([
    { datasetIds: ' 68ad85a7463006c963799a05, 68ad85a7463006c963799a10 ' },
    { datasetIds: [' 68ad85a7463006c963799a05 ', '68ad85a7463006c963799a10'] }
  ])(
    'normalizes multiple dataset IDs before one unified search request',
    async ({ datasetIds }) => {
      const client = createMockHttpClient(async () => ({ list: [], meta: { durationMs: 0 } }));
      await service.search({ client, input: { datasetIds, text: 'query' } });
      expect(client.request).toHaveBeenCalledExactlyOnceWith({
        method: 'POST',
        path: '/core/dataset/search',
        body: expect.objectContaining({
          scope: { datasetIds: ['68ad85a7463006c963799a05', '68ad85a7463006c963799a10'] },
          result: { topk: 20, similarity: 0 }
        })
      });
    }
  );

  it.each([
    { datasetIds: '' },
    { datasetIds: [] },
    { datasetIds: '68ad85a7463006c963799a05,' },
    { datasetIds: ['68ad85a7463006c963799a05', 'invalid-id'] },
    { datasetIds: Array.from({ length: 101 }, () => '68ad85a7463006c963799a05') },
    { maxTokens: 0 },
    { maxTokens: 1.5 },
    { topk: 0 },
    { topk: 101 },
    { topk: 1.5 },
    { similarity: 1.1 },
    { text: ' ' },
    { text: 'q'.repeat(10001) }
  ])('rejects invalid unified search parameters before sending a request', async (options) => {
    const client = createMockHttpClient(async () => ({}));
    await expect(
      service.search({
        client,
        input: { datasetIds: '68ad85a7463006c963799a05', text: 'query', ...options }
      })
    ).rejects.toThrow();
    expect(client.request).not.toHaveBeenCalled();
  });

  it('enforces shared OpenAPI schema validation on invalid inputs (R5)', async () => {
    const client = createMockHttpClient(async () => ({}));

    // Invalid dataset type
    await expect(
      service.create({
        client,
        input: { name: 'Test', type: 'invalidType' as any },
        dryRun: true
      })
    ).rejects.toThrow();

    // Invalid parentId format (not an ObjectId or null)
    await expect(
      service.create({
        client,
        input: { name: 'Test', parentId: 'invalid-object-id' },
        dryRun: true
      })
    ).rejects.toThrow();

    // Invalid datasetId format on update
    await expect(
      service.update({
        client,
        datasetId: 'invalid-id',
        input: { name: 'Test' },
        dryRun: true
      })
    ).rejects.toThrow();

    // 非法页码数值必须抛出校验异常，不可被静默兜底为默认值 1 / 20（R3）
    await expect(
      service.list({
        client,
        input: { page: -1 }
      })
    ).rejects.toThrow();

    await expect(
      service.list({
        client,
        input: { page: 0 }
      })
    ).rejects.toThrow();

    await expect(
      service.list({
        client,
        input: { page: NaN }
      })
    ).rejects.toThrow();

    await expect(
      service.list({
        client,
        input: { pageSize: 0 }
      })
    ).rejects.toThrow();

    // 非法检索模式必须抛出校验异常，不可静默回退为 mixedRecall（R3）
    await expect(
      service.search({
        client,
        input: {
          datasetIds: '68ad85a7463006c963799a05',
          text: 'query',
          mode: 'typo' as any
        }
      })
    ).rejects.toThrow();
  });
});
