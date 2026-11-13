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
          datasetId: '68ad85a7463006c963799a05',
          text: 'query',
          searchMode: 'typo' as any
        }
      })
    ).rejects.toThrow();
  });

  it('supports exportAll, sync, paths, permission, batchMove, batchDelete, and collection-level permissions', async () => {
    const validId = '68ad85a7463006c963799a05';
    const validId2 = '68ad85a7463006c963799a06';
    const client: FastGptHttpClient = {
      baseUrl: 'https://cloud.fastgpt.cn/api',
      request: vi.fn(async ({ path, body }): Promise<any> => {
        if (path === '/core/dataset/listV2') {
          return {
            total: 2,
            list: [
              { _id: validId, name: 'A' },
              { _id: validId2, name: 'B' }
            ]
          };
        }
        if (path === '/core/dataset/paths') {
          return [{ parentId: null, parentName: 'Root' }];
        }
        if (path === '/core/dataset/getPermission') {
          return { datasetName: 'A', permission: { hasWritePer: true, hasReadPer: true } };
        }
        if (path === '/core/dataset/batch/move' || path === '/core/dataset/batch/delete') {
          return { successIds: body.ids, failedIds: [], affectedIds: body.ids };
        }
        if (
          path === '/core/dataset/enableCollectionPermission' ||
          path === '/core/dataset/disableCollectionPermission'
        ) {
          return { collectionCount: 3 };
        }
        return {};
      }),
      requestRaw: vi.fn(async () => ({
        status: 200,
        headers: new Headers(),
        text: async () => '',
        arrayBuffer: async () => new TextEncoder().encode('q,a\nhi,there').buffer
      })),
      uploadMultipart: vi.fn(),
      streamSse: vi.fn()
    };

    // datasetIds exact filter & offset pagination
    const idsRes = await service.list({ client, input: { datasetIds: [validId, validId2] } });
    expect(idsRes.data?.list).toHaveLength(2);
    expect(idsRes.meta).toEqual({ total: 2, count: 2, hasMore: false });
    const offsetRes = await service.list({ client, input: { offset: 1, pageSize: 1 } });
    expect(offsetRes.meta).toMatchObject({ offset: 1, pageSize: 1, total: 2, hasMore: false });

    const expRes = await service.exportAll({ client, datasetId: validId });
    expect((expRes.data as any).csv).toContain('hi,there');

    const syncDry = await service.sync({ client, datasetId: validId, dryRun: true });
    expect(syncDry.data).toMatchObject({ dryRun: true, risk: 'write' });
    const syncRes = await service.sync({ client, datasetId: validId });
    expect(syncRes.changed).toBe(true);

    const pathsRes = await service.paths({ client, sourceId: validId });
    expect(pathsRes.data).toHaveLength(1);

    const permRes = await service.getPermission({ client, datasetId: validId });
    expect(permRes.data?.permission.hasWritePer).toBe(true);

    const batchMoveRes = await service.batchMove({ client, ids: [validId], parentId: null });
    expect(batchMoveRes.changed).toBe(true);

    const batchDelDry = await service.batchDelete({ client, ids: [validId], dryRun: true });
    expect(batchDelDry.data).toMatchObject({ dryRun: true, risk: 'destructive' });

    const enablePermRes = await service.setCollectionPermission({
      client,
      datasetId: validId,
      enabled: true
    });
    expect((enablePermRes.data as any).collectionCount).toBe(3);

    const resumeRes = await service.resumeInheritPermission({ client, datasetId: validId });
    expect(resumeRes.changed).toBe(true);
  });
});
