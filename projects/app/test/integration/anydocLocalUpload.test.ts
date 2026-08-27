import { describe, expect, it } from 'vitest';
import {
  anydocTestExtensions,
  createAnydocFixture
} from '../../../../packages/service/test/worker/readFile/anydocFixtures';

const baseUrl = process.env.FASTGPT_ANYDOC_E2E_BASE_URL;
const apiKey = process.env.FASTGPT_ANYDOC_E2E_API_KEY;
const datasetId = process.env.FASTGPT_ANYDOC_E2E_DATASET_ID;
const shouldRun = Boolean(baseUrl && apiKey && datasetId);
const uploadRateLimitWaitMs = Number(process.env.FASTGPT_ANYDOC_E2E_RATE_LIMIT_WAIT_MS ?? 61_000);

type ApiEnvelope<T> = {
  code: number;
  data?: T;
  message?: string;
  error?: unknown;
};

type UploadResponse = {
  uploadMode: 'single' | 'multipart';
  url: string;
  key: string;
  headers: Record<string, string>;
};

type PreviewResponse = {
  chunks: Array<{ q: string; a: string }>;
  total: number;
};

const requestApi = async <T>(
  pathname: string,
  body: unknown,
  retryOnRateLimit = false
): Promise<T> => {
  const response = await fetch(new URL(pathname, baseUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;

  if (retryOnRateLimit && response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, uploadRateLimitWaitMs));
    return requestApi<T>(pathname, body, false);
  }

  if (!response.ok || envelope.code !== 200 || envelope.data === undefined) {
    throw new Error(
      `FastGPT API ${pathname} failed: HTTP ${response.status}, ${JSON.stringify(envelope)}`
    );
  }
  return envelope.data;
};

/**
 * 上传代理 URL 会基于服务的 FE_DOMAIN 生成。本地 E2E 可能另选端口，因此仅把 FastGPT
 * 自身的上传代理路径重新绑定到本次测试的 baseUrl；外部对象存储 URL 保持原样。
 */
const resolveUploadUrl = (url: string) => {
  const parsed = new URL(url, baseUrl);
  if (parsed.pathname.startsWith('/api/system/file/u/')) {
    return new URL(`${parsed.pathname}${parsed.search}`, baseUrl);
  }
  return parsed;
};

const describeIfEnabled = shouldRun ? describe : describe.skip;

describeIfEnabled('AnyDoc local development upload E2E', () => {
  it.each(anydocTestExtensions)(
    '通过本地 FastGPT 服务上传并解析 .%s',
    async (extension) => {
      const { buffer, expected } = await createAnydocFixture(extension);
      const filename = `anydoc-e2e-${extension}.${extension}`;
      const upload = await requestApi<UploadResponse>(
        '/api/core/dataset/file/presignDatasetFilePostUrl',
        {
          filename,
          datasetId,
          size: buffer.length
        },
        true
      );

      expect(upload.uploadMode).toBe('single');
      const uploadResponse = await fetch(resolveUploadUrl(upload.url), {
        method: 'PUT',
        headers: upload.headers,
        body: new Uint8Array(buffer)
      });
      expect(uploadResponse.ok, await uploadResponse.text()).toBe(true);

      const preview = await requestApi<PreviewResponse>('/api/core/dataset/file/getPreviewChunks', {
        datasetId,
        type: 'fileLocal',
        sourceId: upload.key,
        overlapRatio: 0,
        chunkSize: 512
      });
      const parsedText = preview.chunks.map(({ q, a }) => `${q}\n${a}`).join('\n');

      expect(preview.total).toBeGreaterThan(0);
      expect(parsedText).toContain(expected);
    },
    uploadRateLimitWaitMs + 30_000
  );
});
