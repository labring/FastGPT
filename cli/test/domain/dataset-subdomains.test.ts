import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { describe, expect, it, vi } from 'vitest';
import { createDatasetCollectionService } from '../../src/domain/dataset/collection-service';
import { createDatasetDataService } from '../../src/domain/dataset/data-service';
import { createDatasetTagSynonymService } from '../../src/domain/dataset/tag-synonym-service';
import { createDatasetTrainingService } from '../../src/domain/dataset/training-service';
import type { FastGptHttpClient } from '../../src/infra/http/fastgpt-http-client';
import { CliApiError } from '../../src/shared/errors';

const VALID_DATASET_ID = '68ad85a7463006c963799a05';
const VALID_COLLECTION_ID = '68ad85a7463006c963799a06';
const VALID_DATA_ID = '68ad85a7463006c963799a07';
const VALID_TAG_ID = '68ad85a7463006c963799a08';
const VALID_SYNONYM_ID = '68ad85a7463006c963799a09';

function createMockHttpClient(overrides?: {
  request?: (params: any) => Promise<any>;
  requestRaw?: (params: any) => Promise<any>;
  uploadMultipart?: (params: any) => Promise<any>;
}): FastGptHttpClient {
  return {
    baseUrl: 'https://cloud.fastgpt.cn/api',
    request: vi.fn(overrides?.request ?? (async () => ({}))),
    requestRaw: vi.fn(
      overrides?.requestRaw ??
        (async () => ({
          status: 200,
          headers: new Headers(),
          text: async () => '',
          arrayBuffer: async () => new TextEncoder().encode('q,a\nfoo,bar').buffer
        }))
    ),
    uploadMultipart: vi.fn(overrides?.uploadMultipart ?? (async () => ({}))),
    streamSse: vi.fn()
  };
}

describe('Dataset Subdomain Services (Collection, Data, Training, Tag & Synonym)', () => {
  const collectionService = createDatasetCollectionService();
  const dataService = createDatasetDataService();
  const trainingService = createDatasetTrainingService();
  const tagSynonymService = createDatasetTagSynonymService();

  it('DatasetCollectionService handles list, createText, createLink, localFile multipart, presign S3 PUT (no auth header leak), export, sync, retrain, delete', async () => {
    let uploadedFormData: FormData | undefined;
    let presignedPutHeaders: Record<string, string> | undefined;

    const client = createMockHttpClient({
      request: async ({ method, path, body }) => {
        if (path === '/core/dataset/collection/listV2') {
          expect(method).toBe('POST');
          return { total: 1, list: [{ _id: VALID_COLLECTION_ID, name: 'doc.md' }] };
        }
        if (path === '/core/dataset/collection/create/text') {
          expect(body.name).toBe('Notes');
          return { collectionId: VALID_COLLECTION_ID, results: { insertLen: 3 } };
        }
        if (path === '/core/dataset/collection/create/link') {
          expect(body.link).toBe('https://doc.fastgpt.cn');
          return { collectionId: VALID_COLLECTION_ID, results: { insertLen: 5 } };
        }
        if (path === '/core/dataset/file/presignDatasetFilePostUrl') {
          return {
            uploadMode: 'single',
            url: 'https://s3.example.com/bucket/doc.pdf?sig=xyz',
            key: 'dataset/team/doc.pdf',
            headers: { 'x-amz-acl': 'private' },
            previewUrl: 'https://s3.example.com/preview'
          };
        }
        if (path === '/core/dataset/collection/create/fileId') {
          expect(body.fileId).toBe('dataset/team/doc.pdf');
          return { collectionId: VALID_COLLECTION_ID, results: { insertLen: 2 } };
        }
        if (path === '/core/dataset/collection/sync') {
          return 'success';
        }
        if (path === '/core/dataset/collection/create/reTrainingCollection') {
          return { collectionId: VALID_COLLECTION_ID };
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

    // S3 presign PUT must NOT leak FastGPT token or Authorization headers
    const presignRes = await collectionService.createByPresignedFile({
      client,
      fetchFn: async (_url, init) => {
        presignedPutHeaders = init?.headers as Record<string, string>;
        return new Response(null, { status: 200 });
      },
      file: { ...filePayload, filename: 'big.pdf', mimeType: 'application/pdf' },
      input: { datasetId: VALID_DATASET_ID }
    });
    expect(presignRes.changed).toBe(true);
    expect(presignedPutHeaders?.token).toBeUndefined();
    expect(presignedPutHeaders?.authorization).toBeUndefined();

    const exportRes = await collectionService.exportData({
      client,
      collectionId: VALID_COLLECTION_ID
    });
    expect((exportRes.data as any).csv).toContain('foo,bar');

    const syncRes = await collectionService.sync({ client, collectionId: VALID_COLLECTION_ID });
    expect((syncRes.data as any).syncStatus).toBe('success');

    const retrainRes = await collectionService.retrain({
      client,
      input: { collectionId: VALID_COLLECTION_ID, chunkSize: 512 }
    });
    expect(retrainRes.changed).toBe(true);

    const delDry = await collectionService.delete({
      client,
      target: { id: VALID_COLLECTION_ID },
      dryRun: true
    });
    expect(delDry.data).toMatchObject({ dryRun: true, risk: 'destructive' });
  });

  it('DatasetDataService handles list, insert, push, update, delete, and custom indexes', async () => {
    const client = createMockHttpClient({
      request: async ({ path, method }) => {
        if (path === '/core/dataset/data/v2/list') {
          return { total: 1, list: [{ _id: VALID_DATA_ID, q: 'Q1', a: 'A1' }] };
        }
        if (path === '/core/dataset/data/insertData') {
          return { dataIds: [VALID_DATA_ID] };
        }
        if (path === '/core/dataset/data/pushData') {
          return { insertLen: 2, dataIds: [VALID_DATA_ID] };
        }
        if (path === '/core/dataset/data/update') {
          expect(method).toBe('PUT');
          return { q: 'Q2', a: 'A2' };
        }
        if (path === '/core/dataset/data/index/create') {
          return { index: { type: 'custom', text: 'alias', dataId: 'idx-1' } };
        }
        return {};
      }
    });

    const listRes = await dataService.list({
      client,
      input: { collectionId: VALID_COLLECTION_ID }
    });
    expect(listRes.meta?.total).toBe(1);

    const insertRes = await dataService.insert({
      client,
      input: { collectionId: VALID_COLLECTION_ID, q: 'Q1', a: 'A1' }
    });
    expect(insertRes.changed).toBe(true);

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

    const idxRes = await dataService.createIndex({
      client,
      input: { dataId: VALID_DATA_ID, type: DatasetDataIndexTypeEnum.custom, text: 'alias' }
    });
    expect(idxRes.changed).toBe(true);
  });

  it('DatasetTrainingService polls queue until drained and throws on training errors when failOnError=true', async () => {
    let pollCount = 0;
    let hasError = false;

    const client = createMockHttpClient({
      request: async ({ path }) => {
        if (path === '/core/dataset/training/getDatasetTrainingQueue') {
          pollCount += 1;
          return { hasTrainingTask: pollCount < 2 };
        }
        if (path === '/core/dataset/training/hasDatasetTrainingError') {
          return { hasError };
        }
        if (path === '/core/dataset/training/getDatasetTrainingError') {
          return { total: 0, list: [] };
        }
        return {};
      }
    });

    const progressLogs: string[] = [];
    const waitOk = await trainingService.wait({
      client,
      datasetId: VALID_DATASET_ID,
      intervalMs: 1,
      sleepFn: async () => {},
      onProgress: (msg) => progressLogs.push(msg)
    });
    expect((waitOk.data as any).completed).toBe(true);
    expect((waitOk.data as any).polls).toBe(2);
    expect(progressLogs).toHaveLength(2);

    pollCount = 0;
    hasError = true;
    await expect(
      trainingService.wait({
        client,
        datasetId: VALID_DATASET_ID,
        intervalMs: 1,
        sleepFn: async () => {}
      })
    ).rejects.toBeInstanceOf(CliApiError);
  });

  it('DatasetTagSynonymService handles Pro tags and synonym upload/list/download/delete', async () => {
    const client = createMockHttpClient({
      request: async ({ path }) => {
        if (path === '/proApi/core/dataset/tag/getAllTags') {
          return [{ _id: VALID_TAG_ID, tag: 'PRD' }];
        }
        if (path === '/proApi/core/dataset/tag/create') {
          return { _id: VALID_TAG_ID, tag: 'PRD' };
        }
        if (path === '/core/dataset/synonym/detail') {
          return { rebuilding: false };
        }
        if (path === '/core/dataset/synonym/mappings') {
          return { total: 1, list: [{ standard: 'AI', synonyms: ['人工智能'] }] };
        }
        if (path === '/core/dataset/synonym/upload') {
          return {
            synonymId: VALID_SYNONYM_ID,
            fileName: 'synonyms.csv',
            size: 20,
            uploadTime: new Date().toISOString(),
            fileVersion: 1,
            affectedDataCount: 5
          };
        }
        if (path === '/core/dataset/synonym/delete') {
          return {
            synonymId: VALID_SYNONYM_ID,
            fileVersion: 2,
            affectedDataCount: 5
          };
        }
        return {};
      }
    });

    const tags = await tagSynonymService.listTags({ client, datasetId: VALID_DATASET_ID });
    expect(tags.data).toHaveLength(1);

    const createTagDry = await tagSynonymService.createTag({
      client,
      input: { datasetId: VALID_DATASET_ID, tag: 'PRD' },
      dryRun: true
    });
    expect(createTagDry.data).toMatchObject({ dryRun: true, risk: 'write' });

    const mappings = await tagSynonymService.searchSynonymMappings({
      client,
      datasetId: VALID_DATASET_ID,
      search: 'AI'
    });
    expect(mappings.data?.total).toBe(1);

    const uploadRes = await tagSynonymService.uploadSynonymMappings({
      client,
      input: {
        datasetId: VALID_DATASET_ID,
        mappings: [{ standardizedTerm: 'AI', synonymTerms: ['人工智能'] }]
      }
    });
    expect((uploadRes.data as any).fileVersion).toBe(1);

    const dlRes = await tagSynonymService.downloadSynonym({
      client,
      synonymId: VALID_SYNONYM_ID
    });
    expect((dlRes.data as any).csv).toContain('foo,bar');

    const delRes = await tagSynonymService.deleteSynonym({
      client,
      synonymId: VALID_SYNONYM_ID,
      oldFileVersion: 1
    });
    expect(delRes.changed).toBe(true);
  });

  it('handles multipart presigned upload with bounded concurrency and per-part retries, and validates wait bounds', async () => {
    let part2Attempts = 0;
    let completedParts: Array<{ partNumber: number; etag: string }> = [];

    const client: FastGptHttpClient = {
      baseUrl: 'https://cloud.fastgpt.cn/api',
      request: vi.fn(async ({ path, body }): Promise<any> => {
        if (path === '/core/dataset/file/presignDatasetFilePostUrl') {
          return {
            uploadMode: 'multipart',
            url: 'https://cloud.fastgpt.cn/api/system/file/u/tok-1/part',
            completeUrl: 'https://cloud.fastgpt.cn/api/system/file/u/tok-1/complete',
            abortUrl: 'https://cloud.fastgpt.cn/api/system/file/u/tok-1/abort',
            key: 'dataset/team/large.bin',
            headers: {},
            previewUrl: 'https://cloud.fastgpt.cn/preview',
            partSize: 4,
            concurrency: 2,
            maxRetry: 2
          };
        }
        if (path.includes('/complete')) {
          completedParts = (body as any).parts;
          return { key: 'dataset/team/large.bin' };
        }
        if (path === '/core/dataset/collection/create/fileId') {
          return { collectionId: VALID_COLLECTION_ID, results: { insertLen: 1 } };
        }
        return {};
      }),
      requestRaw: vi.fn(async ({ path }) => {
        const match = path.match(/partNumber=(\d+)/);
        const partNumber = Number(match?.[1]);
        if (partNumber === 2) {
          part2Attempts += 1;
          if (part2Attempts === 1) {
            throw new CliApiError({ message: 'transient network glitch', httpStatus: 502 });
          }
        }
        return {
          status: 200,
          headers: new Headers(),
          text: async () => JSON.stringify({ data: { etag: `"etag-${partNumber}"` } }),
          arrayBuffer: async () => new ArrayBuffer(0)
        };
      }),
      uploadMultipart: vi.fn(),
      streamSse: vi.fn()
    };

    const res = await collectionService.createByPresignedFile({
      client,
      fetchFn: globalThis.fetch,
      file: {
        filename: 'large.bin',
        size: 10,
        mimeType: 'application/octet-stream',
        data: new Uint8Array(10)
      },
      input: { datasetId: VALID_DATASET_ID }
    });
    expect(res.changed).toBe(true);
    expect(part2Attempts).toBe(2);
    expect(completedParts).toEqual([
      { partNumber: 1, etag: '"etag-1"' },
      { partNumber: 2, etag: '"etag-2"' },
      { partNumber: 3, etag: '"etag-3"' }
    ]);

    await expect(
      trainingService.wait({
        client,
        datasetId: VALID_DATASET_ID,
        intervalMs: Number.NaN
      })
    ).rejects.toThrow('--interval must be a positive finite number');
  });
});
