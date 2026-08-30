import { describe, expect, it } from 'vitest';

const baseUrl = process.env.FASTGPT_FILE_SOURCE_E2E_BASE_URL;
const token = process.env.FASTGPT_FILE_SOURCE_E2E_TOKEN;
const datasetId = process.env.FASTGPT_FILE_SOURCE_E2E_DATASET_ID;
const shouldRun = Boolean(baseUrl && token && datasetId);

type ApiEnvelope<T> = {
  code: number;
  data?: T;
  message?: string;
  error?: unknown;
};

type UploadResponse = {
  uploadMode: 'single' | 'multipart';
  url: string;
  previewUrl: string;
  key: string;
  headers: Record<string, string>;
};

type PreviewResponse = {
  chunks: Array<{ q: string; a: string }>;
  total: number;
};

const requestApi = async <T>(pathname: string, body: unknown): Promise<T> => {
  const response = await fetch(new URL(pathname, baseUrl), {
    method: 'POST',
    headers: {
      token: token!,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || envelope.code !== 200 || envelope.data === undefined) {
    throw new Error(
      `FastGPT API ${pathname} failed: HTTP ${response.status}, ${JSON.stringify(envelope)}`
    );
  }
  return envelope.data;
};

const resolveServiceUrl = (url: string) => {
  const parsed = new URL(url, baseUrl);
  if (parsed.pathname.startsWith('/api/system/file/')) {
    return new URL(`${parsed.pathname}${parsed.search}`, baseUrl);
  }
  return parsed;
};

const parsePreview = (sourceId: string, type: 'fileLocal' | 'externalFile') =>
  requestApi<PreviewResponse>('/api/core/dataset/file/getPreviewChunks', {
    datasetId,
    type,
    sourceId,
    ...(type === 'externalFile' ? { externalFileId: 'local-s3-external-source' } : {}),
    overlapRatio: 0,
    chunkSize: 512
  });

const describeIfEnabled = shouldRun ? describe : describe.skip;

describeIfEnabled('FileSource local port 3000 E2E', () => {
  it('通过同一份本地 S3 对象覆盖可信 S3 与不可信 External HTTP 来源', async () => {
    const marker = `file-source-e2e-${Date.now()}`;
    const buffer = Buffer.from(`${marker}\nsecond line`, 'utf-8');
    const upload = await requestApi<UploadResponse>(
      '/api/core/dataset/file/presignDatasetFilePostUrl',
      {
        filename: 'file-source-e2e.txt',
        datasetId,
        size: buffer.length
      }
    );

    expect(upload.uploadMode).toBe('single');
    const uploadResponse = await fetch(resolveServiceUrl(upload.url), {
      method: 'PUT',
      headers: upload.headers,
      body: new Uint8Array(buffer)
    });
    expect(uploadResponse.ok, await uploadResponse.text()).toBe(true);

    const trustedPreview = await parsePreview(upload.key, 'fileLocal');
    const externalPreview = await parsePreview(
      resolveServiceUrl(upload.previewUrl).toString(),
      'externalFile'
    );

    for (const preview of [trustedPreview, externalPreview]) {
      expect(preview.total).toBeGreaterThan(0);
      expect(preview.chunks.map(({ q, a }) => `${q}\n${a}`).join('\n')).toContain(marker);
    }
  }, 60_000);
});
