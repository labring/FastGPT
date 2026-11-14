import { describe, expect, it, vi } from 'vitest';
import { createDatasetCollectionService } from '../../src/domain/dataset/collection-service';
import { createDatasetDataService } from '../../src/domain/dataset/data-service';
import type { FastGptHttpClient } from '../../src/infra/http/fastgpt-http-client';

const VALID_DATASET_ID = '68ad85a7463006c963799a05';
const VALID_COLLECTION_ID = '68ad85a7463006c963799a06';
const VALID_DATA_ID = '68ad85a7463006c963799a07';

function createMockHttpClient(overrides?: {
  request?: (params: any) => Promise<any>;
  uploadMultipart?: (params: any) => Promise<any>;
}): FastGptHttpClient {
  return {
    baseUrl: 'https://cloud.fastgpt.cn/api',
    request: vi.fn(overrides?.request ?? (async () => ({}))),
    requestRaw: vi.fn(),
    uploadMultipart: vi.fn(overrides?.uploadMultipart ?? (async () => ({}))),
    streamSse: vi.fn()
  };
}

describe('Dataset Subdomain Services (Collection & Data OpenAPI)', () => {
  const collectionService = createDatasetCollectionService();
  const dataService = createDatasetDataService();

  it('DatasetCollectionService handles list, getDetail, create, createText, createLink, localFile multipart, update, and delete', async () => {
    let uploadedFormData: FormData | undefined;

    const client = createMockHttpClient({
      request: async ({ method, path, body }) => {
        if (path === '/core/dataset/collection/listV2') {
          expect(method).toBe('POST');
          return { total: 1, list: [{ _id: VALID_COLLECTION_ID, name: 'doc.md' }] };
        }
        if (path === '/core/dataset/collection/detail') {
          expect(method).toBe('GET');
          return { _id: VALID_COLLECTION_ID, name: 'doc.md' };
        }
        if (path === '/core/dataset/collection/create') {
          expect(body.name).toBe('Manual');
          return VALID_COLLECTION_ID;
        }
        if (path === '/core/dataset/collection/create/text') {
          expect(body.name).toBe('Notes');
          return { collectionId: VALID_COLLECTION_ID, results: { insertLen: 3 } };
        }
        if (path === '/core/dataset/collection/create/link') {
          expect(body.link).toBe('https://doc.fastgpt.cn');
          return { collectionId: VALID_COLLECTION_ID, results: { insertLen: 5 } };
        }
        if (path === '/core/dataset/collection/update') {
          expect(body.name).toBe('Renamed');
          return {};
        }
        return {};
      },
      uploadMultipart: async ({ path, formData }) => {
        expect(path).toBe('/core/dataset/collection/create/localFile');
        uploadedFormData = formData;
        return { collectionId: VALID_COLLECTION_ID, results: { insertLen: 4 } };
      }
    });

    const listRes = await collectionService.list({
      client,
      input: { datasetId: VALID_DATASET_ID, page: 1, pageSize: 10 }
    });
    expect(listRes.meta).toMatchObject({ total: 1, page: 1, pageSize: 10, hasMore: false });

    const detailRes = await collectionService.getDetail({
      client,
      collectionId: VALID_COLLECTION_ID
    });
    expect(detailRes.data?._id).toBe(VALID_COLLECTION_ID);

    const createRes = await collectionService.create({
      client,
      input: { datasetId: VALID_DATASET_ID, name: 'Manual', type: 'virtual' as any }
    });
    expect(createRes.changed).toBe(true);

    const textRes = await collectionService.createText({
      client,
      input: { datasetId: VALID_DATASET_ID, name: 'Notes', text: 'hello world' }
    });
    expect(textRes.changed).toBe(true);

    const linkRes = await collectionService.createLink({
      client,
      input: { datasetId: VALID_DATASET_ID, link: 'https://doc.fastgpt.cn' }
    });
    expect(linkRes.changed).toBe(true);

    const filePayload = {
      filename: 'guide.md',
      size: 11,
      mimeType: 'text/markdown; charset=utf-8',
      data: new TextEncoder().encode('# Guide\nhi')
    };
    const localDry = await collectionService.createLocalFile({
      client,
      file: filePayload,
      input: { datasetId: VALID_DATASET_ID },
      dryRun: true
    });
    expect(localDry.data).toMatchObject({ dryRun: true, risk: 'write' });

    const localRes = await collectionService.createLocalFile({
      client,
      file: filePayload,
      input: { datasetId: VALID_DATASET_ID }
    });
    expect(localRes.changed).toBe(true);
    expect(uploadedFormData?.get('data')).toContain(VALID_DATASET_ID);

    const updateRes = await collectionService.update({
      client,
      input: { id: VALID_COLLECTION_ID, name: 'Renamed' }
    });
    expect(updateRes.changed).toBe(true);

    const delDry = await collectionService.delete({
      client,
      target: { id: VALID_COLLECTION_ID },
      dryRun: true
    });
    expect(delDry.data).toMatchObject({ dryRun: true, risk: 'destructive' });
  });

  it('DatasetDataService handles list, getDetail, push, update, and delete', async () => {
    const client = createMockHttpClient({
      request: async ({ path, method }) => {
        if (path === '/core/dataset/data/v2/list') {
          return { total: 1, list: [{ _id: VALID_DATA_ID, q: 'Q1', a: 'A1' }] };
        }
        if (path === '/core/dataset/data/detail') {
          return { id: VALID_DATA_ID, q: 'Q1', a: 'A1' };
        }
        if (path === '/core/dataset/data/pushData') {
          return { insertLen: 2, dataIds: [VALID_DATA_ID] };
        }
        if (path === '/core/dataset/data/update') {
          expect(method).toBe('PUT');
          return { q: 'Q2', a: 'A2' };
        }
        return {};
      }
    });

    const listRes = await dataService.list({
      client,
      input: { collectionId: VALID_COLLECTION_ID }
    });
    expect(listRes.meta?.total).toBe(1);

    const detailRes = await dataService.getDetail({
      client,
      dataId: VALID_DATA_ID
    });
    expect((detailRes.data as any).id).toBe(VALID_DATA_ID);

    const pushRes = await dataService.push({
      client,
      input: {
        collectionId: VALID_COLLECTION_ID,
        data: [{ q: 'A' }, { q: 'B' }]
      }
    });
    expect((pushRes.data as any).insertLen).toBe(2);

    const updateRes = await dataService.update({
      client,
      input: { dataId: VALID_DATA_ID, q: 'Q2' }
    });
    expect(updateRes.changed).toBe(true);

    const delDry = await dataService.delete({ client, dataId: VALID_DATA_ID, dryRun: true });
    expect(delDry.data).toMatchObject({ dryRun: true, risk: 'destructive' });
  });
});
