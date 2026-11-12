import { describe, expect, it, vi } from 'vitest';
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
    expect(res.meta?.total).toBe(1);
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
      input: { name: 'Renamed' },
      dryRun: true
    });
    expect(dryRes.changed).toBe(false);
    expect(dryRes.data).toHaveProperty('dryRun', true);

    const realRes = await service.update({
      client,
      datasetId: validId,
      input: { name: 'Renamed', intro: 'New intro' }
    });
    expect(realRes.changed).toBe(true);
    expect(capturedBody).toEqual({
      id: validId,
      name: 'Renamed',
      intro: 'New intro'
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

    const res = await service.delete({ client, datasetId: validId });
    expect(deleteCalled).toBe(true);
    expect(res.changed).toBe(true);
    expect(res.data).toEqual({ datasetId: validId, deleted: true });
  });

  it('executes recall test search against dataset', async () => {
    const validId = '68ad85a7463006c963799a05';
    let capturedBody: any;
    const client = createMockHttpClient(async ({ method, path, body }) => {
      expect(method).toBe('POST');
      expect(path).toBe('/core/dataset/searchTest');
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
        duration: '0.412s',
        limit: 5000,
        searchMode: 'mixedRecall',
        usingReRank: true,
        similarity: 0.5
      };
    });

    await expect(
      service.search({
        client,
        input: { datasetId: '', text: 'query' }
      })
    ).rejects.toThrow();

    const res = await service.search({
      client,
      input: {
        datasetId: validId,
        text: 'What is FastGPT?',
        similarity: 0.5,
        usingReRank: true
      }
    });

    expect(capturedBody).toMatchObject({
      datasetId: validId,
      text: 'What is FastGPT?',
      limit: 5000,
      similarity: 0.5,
      searchMode: 'mixedRecall',
      usingReRank: true
    });
    expect(res.data?.list).toHaveLength(1);
    expect(res.message).toContain('Retrieved 1 chunks');
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
  });
});
