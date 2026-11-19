import { describe, expect, it } from 'vitest';
import {
  createPageNumPaginator,
  FastGPT,
  FastGptBadRequestError,
  FastGptError,
  FastGptTimeoutError,
  type UploadProgressInfo
} from '../src/index';

const jsonRes = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });

describe('High-Level Helpers (S3 Upload, Training Polling, Chat Attachment, Interactive, AutoPaging)', () => {
  it('uploads dataset file via presigned single PUT (subpath baseUrl) and waits for collection training with errors', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    const uploadProgressEvents: UploadProgressInfo[] = [];
    let trainingPollCount = 0;

    const client = new FastGPT({
      baseUrl: 'https://proxy.example.com/fastgpt',
      apiKey: 'fastgpt-personal-key',
      fetch: async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        calls.push({ method, url });

        if (url.endsWith('/api/core/dataset/file/presignDatasetFilePostUrl')) {
          return jsonRes({
            code: 200,
            data: {
              uploadMode: 'single',
              url: '/api/system/file/u/single-upload-token-123456',
              key: 'dataset/ds-1/doc.pdf',
              headers: { 'content-type': 'application/pdf' },
              previewUrl: 'https://cdn.example.com/doc.pdf',
              maxSize: 1024 * 1024
            }
          });
        }

        if (
          url === 'https://proxy.example.com/fastgpt/api/system/file/u/single-upload-token-123456'
        ) {
          expect(method).toBe('PUT');
          return jsonRes({ code: 200, data: { success: true } });
        }

        if (url.endsWith('/api/core/dataset/collection/create/fileId')) {
          const parsed = JSON.parse(String(init?.body)) as Record<string, unknown>;
          expect(parsed.fileId).toBe('dataset/ds-1/doc.pdf');
          expect(parsed.datasetId).toBe('68ad85a7463006c963799a05');
          return jsonRes({
            code: 200,
            data: { collectionId: 'col-100', results: { insertLen: 3 } }
          });
        }

        if (url.includes('/api/core/dataset/collection/trainingDetail')) {
          trainingPollCount += 1;
          return jsonRes({
            code: 200,
            data: {
              advancedTraining: {
                customPdfParse: false,
                imageIndex: false,
                autoIndexes: false
              },
              queuedCounts: { chunk: trainingPollCount === 1 ? 2 : 0 },
              trainingCounts: { chunk: trainingPollCount === 1 ? 1 : 0 },
              errorCounts: { chunk: trainingPollCount === 1 ? 0 : 1 },
              trainedCount: trainingPollCount === 1 ? 0 : 2
            }
          });
        }

        if (url.endsWith('/api/core/dataset/training/getTrainingError')) {
          return jsonRes({
            code: 200,
            data: {
              total: 1,
              list: [{ _id: 'err-1', errorMsg: 'Embedding rate limit' }]
            }
          });
        }

        throw new Error(`Unexpected request: ${method} ${url}`);
      }
    });

    const result = await client.datasets.collections.uploadFile({
      datasetId: '68ad85a7463006c963799a05',
      file: { data: 'PDF-CONTENT', filename: 'manual.pdf', contentType: 'application/pdf' },
      trainingType: 'chunk',
      onUploadProgress: (progress) => uploadProgressEvents.push(progress),
      waitForTraining: { pollIntervalMs: 1 }
    });

    expect(result.collectionId).toBe('col-100');
    expect(result.fileKey).toBe('dataset/ds-1/doc.pdf');
    expect(result.results.insertLen).toBe(3);
    expect(uploadProgressEvents.at(-1)?.percent).toBe(100);
    expect(trainingPollCount).toBe(2);
    expect(result.training?.trainedCount).toBe(2);
    expect(result.training?.errorCount).toBe(1);
    expect(result.training?.errors).toHaveLength(1);
    expect(result.training?.errors[0]?.errorMsg).toBe('Embedding rate limit');

    // 验证 throwOnError=true 时在存在训练错误分块时主动抛错
    await expect(
      client.datasets.collections.waitForTraining({
        collectionId: 'col-100',
        pollIntervalMs: 1,
        throwOnError: true
      })
    ).rejects.toThrow(/Embedding rate limit/);
  });

  it('handles multipart presigned upload with retries, ordered complete, and best-effort abort on failure', async () => {
    let part2Attempts = 0;
    let completeAttempts = 0;
    let submittedParts: Array<{ partNumber: number; etag: string }> = [];

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-personal-key',
      fetch: async (input, init) => {
        const url = String(input);
        if (url.endsWith('/presignDatasetFilePostUrl')) {
          return jsonRes({
            code: 200,
            data: {
              uploadMode: 'multipart',
              url: '/api/system/file/u/mp-tok-12345678901234',
              completeUrl: '/api/system/file/u/mp-tok-12345678901234/complete',
              abortUrl: '/api/system/file/u/mp-tok-12345678901234/abort',
              key: 'dataset/ds-1/big.bin',
              headers: { 'content-type': 'application/octet-stream' },
              previewUrl: 'https://cdn.example.com/big.bin',
              partSize: 4,
              concurrency: 2,
              maxRetry: 2
            }
          });
        }

        if (url.includes('/mp-tok-12345678901234?partNumber=')) {
          const partNumber = Number(new URL(url).searchParams.get('partNumber'));
          if (partNumber === 2) {
            part2Attempts += 1;
            if (part2Attempts === 1) {
              return jsonRes({ message: 'transient 503' }, 503);
            }
          }
          return jsonRes({ code: 200, data: { etag: `"etag-${partNumber}"` } });
        }

        if (url.endsWith('/mp-tok-12345678901234/complete')) {
          completeAttempts += 1;
          if (completeAttempts === 1) {
            return jsonRes({ message: 'conflict retry' }, 409);
          }
          submittedParts = (
            JSON.parse(String(init?.body)) as {
              parts: Array<{ partNumber: number; etag: string }>;
            }
          ).parts;
          return jsonRes({ code: 200, data: { key: 'dataset/ds-1/big.bin' } });
        }

        if (url.endsWith('/collection/create/fileId')) {
          return jsonRes({
            code: 200,
            data: { collectionId: 'col-mp', results: { insertLen: 1 } }
          });
        }

        throw new Error(`Unexpected URL: ${url}`);
      }
    });

    const uploadRes = await client.datasets.collections.uploadFile({
      datasetId: '68ad85a7463006c963799a05',
      file: { data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), filename: 'big.bin' },
      retryBaseDelayMs: 1
    });

    expect(uploadRes.collectionId).toBe('col-mp');
    expect(part2Attempts).toBe(2);
    expect(completeAttempts).toBe(2);
    expect(submittedParts).toEqual([
      { partNumber: 1, etag: '"etag-1"' },
      { partNumber: 2, etag: '"etag-2"' },
      { partNumber: 3, etag: '"etag-3"' }
    ]);

    // 测试不可恢复错误触发远端 abortUrl 清理
    let abortCalled = false;
    const failingClient = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-personal-key',
      fetch: async (input) => {
        const url = String(input);
        if (url.endsWith('/presignDatasetFilePostUrl')) {
          return jsonRes({
            code: 200,
            data: {
              uploadMode: 'multipart',
              url: '/api/system/file/u/mp-fail-1234567890123',
              completeUrl: '/api/system/file/u/mp-fail-1234567890123/complete',
              abortUrl: '/api/system/file/u/mp-fail-1234567890123/abort',
              key: 'dataset/ds-1/fail.bin',
              headers: {},
              previewUrl: 'https://cdn.example.com/fail.bin',
              partSize: 4,
              concurrency: 2,
              maxRetry: 0
            }
          });
        }
        if (url.endsWith('/abort')) {
          abortCalled = true;
          return jsonRes({ code: 200, data: null });
        }
        return jsonRes({ message: 'disk full' }, 500);
      }
    });

    await expect(
      failingClient.datasets.collections.uploadFile({
        datasetId: '68ad85a7463006c963799a05',
        file: { data: new Uint8Array([1, 2, 3, 4, 5]), filename: 'fail.bin' },
        retryBaseDelayMs: 1
      })
    ).rejects.toThrow(FastGptError);
    expect(abortCalled).toBe(true);
  });

  it('rejects oversized uploads before transfer and supports localFile strategy & dataset-wide waitForTraining', async () => {
    let localFileCalled = false;
    let queueChecks = 0;

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-personal-key',
      fetch: async (input) => {
        const url = String(input);
        if (url.endsWith('/presignDatasetFilePostUrl')) {
          return jsonRes({
            code: 200,
            data: {
              uploadMode: 'single',
              url: '/api/system/file/u/too-small-limit-123456',
              key: 'dataset/ds-1/huge.bin',
              headers: {},
              previewUrl: 'https://cdn.example.com/huge.bin',
              maxSize: 5
            }
          });
        }
        if (url.endsWith('/collection/create/localFile')) {
          localFileCalled = true;
          return jsonRes({
            code: 200,
            data: { collectionId: 'col-local', results: { insertLen: 1 } }
          });
        }
        if (url.includes('/getDatasetTrainingQueue')) {
          queueChecks += 1;
          return jsonRes({ code: 200, data: { hasTrainingTask: queueChecks < 2 } });
        }
        if (url.includes('/hasDatasetTrainingError')) {
          return jsonRes({ code: 200, data: { hasError: false } });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }
    });

    await expect(
      client.datasets.collections.uploadFile({
        datasetId: '68ad85a7463006c963799a05',
        file: { data: '0123456789', filename: 'huge.bin' }
      })
    ).rejects.toThrow(FastGptBadRequestError);

    const localRes = await client.datasets.collections.uploadFile({
      datasetId: '68ad85a7463006c963799a05',
      file: { data: 'hello', filename: 'small.txt' },
      uploadStrategy: 'localFile'
    });
    expect(localFileCalled).toBe(true);
    expect(localRes.collectionId).toBe('col-local');

    const dsTrainRes = await client.datasets.waitForTraining({
      datasetId: '68ad85a7463006c963799a05',
      pollIntervalMs: 1
    });
    expect(queueChecks).toBe(2);
    expect(dsTrainRes.hasTrainingTask).toBe(false);
    expect(dsTrainRes.hasError).toBe(false);

    // 验证 waitForCollectionTraining 超时抛出 FastGptTimeoutError
    const slowTrainClient = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-personal-key',
      fetch: async () =>
        jsonRes({
          code: 200,
          data: {
            advancedTraining: { customPdfParse: false, imageIndex: false, autoIndexes: false },
            queuedCounts: { chunk: 1 },
            trainingCounts: {},
            errorCounts: {},
            trainedCount: 0
          }
        })
    });

    await expect(
      slowTrainClient.datasets.collections.waitForTraining({
        collectionId: 'col-slow',
        pollIntervalMs: 5,
        timeoutMs: 10
      })
    ).rejects.toThrow(FastGptTimeoutError);
  });

  it('uploads chat image and document attachments and builds multimodal content parts', async () => {
    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-app-key',
      fetch: async (input) => {
        const url = String(input);
        if (url.endsWith('/core/chat/file/presignChatFilePostUrl')) {
          return jsonRes({
            code: 200,
            data: {
              uploadMode: 'single',
              url: 'https://s3.example.com/upload',
              key: 'chat/app1/c1/asset-key',
              headers: { 'content-type': 'application/octet-stream' },
              previewUrl: 'https://cdn.example.com/asset-preview'
            }
          });
        }
        if (url === 'https://s3.example.com/upload') {
          return new Response(null, { status: 200 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }
    });

    const img = await client.chat.files.upload({
      chatId: 'c1',
      file: { data: new Uint8Array([1, 2, 3]), filename: 'diagram.png', contentType: 'image/png' }
    });
    expect(img.fileKind).toBe('image');
    expect(img.toContentPart({ imageDetail: 'high' })).toEqual({
      type: 'image_url',
      image_url: { url: 'https://cdn.example.com/asset-preview', detail: 'high' },
      key: 'chat/app1/c1/asset-key'
    });

    const doc = await client.chat.files.upload({
      chatId: 'c1',
      file: { data: 'spec text', filename: 'spec.pdf', contentType: 'application/pdf' }
    });
    expect(doc.fileKind).toBe('file');
    expect(doc.toContentPart()).toEqual({
      type: 'file_url',
      name: 'spec.pdf',
      url: 'https://cdn.example.com/asset-preview',
      key: 'chat/app1/c1/asset-key'
    });
  });

  it('detects, unwraps, and replies to userSelect and userInput interactive workflow pauses', async () => {
    const sentPayloads: Array<Record<string, unknown>> = [];

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-app-key',
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        sentPayloads.push(body);
        return jsonRes({
          id: 'cmpl-resume',
          choices: [{ index: 0, message: { role: 'assistant', content: '已继续执行完成' } }]
        });
      }
    });

    // 1. 从嵌套子流程交互响应中提取并解包最内层交互
    const nonStreamCompletion = {
      id: 'cmpl-1',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: [
              {
                interactive: {
                  type: 'childrenInteractive',
                  params: {
                    childrenResponse: {
                      type: 'userSelect',
                      params: {
                        description: '请选择审批路径',
                        userSelectOptions: [
                          { key: 'opt1', value: '通过' },
                          { key: 'opt2', value: '驳回' }
                        ]
                      }
                    }
                  }
                }
              }
            ]
          }
        }
      ]
    };

    expect(client.chat.interactive.isPending(nonStreamCompletion)).toBe(true);
    const outer = client.chat.interactive.extract(nonStreamCompletion);
    expect(outer?.type).toBe('childrenInteractive');
    const inner = client.chat.interactive.unwrap(outer!);
    expect(inner.type).toBe('userSelect');

    // 2. 恢复 userSelect
    await client.chat.interactive.replyUserSelect({
      chatId: 'c-interactive',
      value: '通过'
    });
    expect(sentPayloads[0]?.messages).toEqual([{ role: 'user', content: '通过' }]);
    expect(sentPayloads[0]?.stream).toBe(false);

    // 3. 恢复 userInput 表单
    await client.chat.interactive.replyUserForm({
      chatId: 'c-interactive',
      values: { project: 'FastGPT', budget: 1000 }
    });
    expect(sentPayloads[1]?.messages).toEqual([
      { role: 'user', content: JSON.stringify({ project: 'FastGPT', budget: 1000 }) }
    ]);
  });

  it('auto-paginates offset and pageNum list endpoints with maxItems, pages(), toArray(), and AbortSignal', async () => {
    const allItems = Array.from({ length: 5 }, (_, idx) => ({
      _id: `chunk-${idx + 1}`,
      q: `Q${idx + 1}`,
      a: `A${idx + 1}`
    }));
    const requestedOffsets: number[] = [];

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-personal-key',
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { offset: number; pageSize: number };
        requestedOffsets.push(body.offset);
        return jsonRes({
          code: 200,
          data: {
            total: allItems.length,
            list: allItems.slice(body.offset, body.offset + body.pageSize)
          }
        });
      }
    });

    // 1. 全量逐条遍历（pageSize=2，共 3 页：0, 2, 4）
    const collectedIds: string[] = [];
    for await (const item of client.datasets.data.listAutoPaging(
      { collectionId: 'col-1' },
      { pageSize: 2 }
    )) {
      collectedIds.push(item._id);
    }
    expect(collectedIds).toEqual(['chunk-1', 'chunk-2', 'chunk-3', 'chunk-4', 'chunk-5']);
    expect(requestedOffsets).toEqual([0, 2, 4]);

    // 2. maxItems 截断与 pages() 按页迭代
    requestedOffsets.length = 0;
    const pageSizes: number[] = [];
    for await (const page of client.datasets.data
      .listAutoPaging({ collectionId: 'col-1' }, { pageSize: 2, maxItems: 3 })
      .pages()) {
      pageSizes.push(page.length);
    }
    expect(pageSizes).toEqual([2, 1]);
    expect(requestedOffsets).toEqual([0, 2]);

    // 3. AbortSignal 中途取消
    const ac = new AbortController();
    ac.abort();
    await expect(
      client.datasets.data
        .listAutoPaging({ collectionId: 'col-1' }, { signal: ac.signal })
        .toArray()
    ).rejects.toThrow(FastGptError);

    // 4. 通用 pageNum 分页器
    const threeItems = allItems.slice(0, 3);
    const pageNums: number[] = [];
    const numPaged = await createPageNumPaginator({
      pageSize: 2,
      fetchPage: async ({ pageNum, pageSize }) => {
        pageNums.push(pageNum);
        const start = (pageNum - 1) * pageSize;
        return {
          total: threeItems.length,
          list: threeItems.slice(start, start + pageSize)
        };
      }
    }).toArray();
    expect(pageNums).toEqual([1, 2]);
    expect(numPaged.map((i) => i._id)).toEqual(['chunk-1', 'chunk-2', 'chunk-3']);
  });
});
