import { createHash, createHmac } from 'node:crypto';
import z from 'zod';
import { serviceEnv } from '../../../env';

const ENDPOINT = 'https://wsa.tencentcloudapi.com/';
const HOST = 'wsa.tencentcloudapi.com';
const SERVICE = 'wsa';
const ACTION = 'SearchPro';
const VERSION = '2025-05-08';
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_RESULTS = 10;

export const YuanbaoSearchQuerySchema = z.object({
  query: z.string().trim().min(1).max(500)
});
export type YuanbaoSearchQuery = z.infer<typeof YuanbaoSearchQuerySchema>;

export const YuanbaoSearchResultSchema = z.object({
  title: z.string(),
  url: z.url(),
  snippet: z.string(),
  publishedAt: z.string().optional()
});
export const YuanbaoSearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(YuanbaoSearchResultSchema)
});
export type YuanbaoSearchResponse = z.infer<typeof YuanbaoSearchResponseSchema>;

const ProviderPageSchema = z.object({
  title: z.string().optional(),
  url: z.string(),
  passage: z.string().optional(),
  date: z.string().optional()
});
const ProviderResponseSchema = z.object({
  Response: z.object({
    Pages: z.array(z.unknown()).optional(),
    Error: z.object({ Code: z.string().optional() }).optional()
  })
});

/**
 * 调用腾讯云 WSA SearchPro，并将供应商页面归一化为有界的可引用来源。
 * 固定官方域名、服务端签名和超时；上游错误仅返回安全错误码，不透出响应正文或凭据。
 */
export const runYuanbaoSearch = async ({
  query: rawQuery,
  signal
}: YuanbaoSearchQuery & { signal?: AbortSignal }): Promise<YuanbaoSearchResponse> => {
  const { query } = YuanbaoSearchQuerySchema.parse({ query: rawQuery });
  const secretId = serviceEnv.YUANBAO_SECRET_ID;
  const secretKey = serviceEnv.YUANBAO_SECRET_KEY;
  if (!secretId || !secretKey) {
    throw new Error('Yuanbao search is not configured');
  }
  if (signal?.aborted) {
    throw new Error('Yuanbao search cancelled');
  }

  // TC3 的日期必须采用 UTC；payload 和 Content-Type 与签名所用字节完全一致。
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payload = JSON.stringify({ Query: query });
  const contentType = 'application/json; charset=utf-8';
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const hmac = (key: string | Buffer, value: string) =>
    createHmac('sha256', key).update(value).digest();
  const canonicalRequest = [
    'POST',
    '/',
    '',
    `content-type:${contentType}\nhost:${HOST}\n`,
    'content-type;host',
    hash(payload)
  ].join('\n');
  const scope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), scope, hash(canonicalRequest)].join(
    '\n'
  );
  const signingKey = hmac(hmac(hmac(`TC3${secretKey}`, date), SERVICE), 'tc3_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
    : AbortSignal.timeout(8000);
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        Host: HOST,
        'X-TC-Action': ACTION,
        'X-TC-Version': VERSION,
        'X-TC-Timestamp': String(timestamp),
        Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`
      },
      body: payload,
      signal: requestSignal
    });
  } catch {
    if (signal?.aborted) throw new Error('Yuanbao search cancelled');
    if (requestSignal.aborted) throw new Error('Yuanbao search timed out');
    throw new Error('Yuanbao search unavailable');
  }
  if (!response.ok) {
    throw new Error(`Yuanbao search HTTP ${response.status}`);
  }

  // 限制实际读取的响应字节数，避免上游异常页面导致内存和日志膨胀。
  let body = '';
  try {
    if (!response.body) throw new Error('Empty response');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Response too large');
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
  } catch {
    if (signal?.aborted) throw new Error('Yuanbao search cancelled');
    if (requestSignal.aborted) throw new Error('Yuanbao search timed out');
    throw new Error('Yuanbao search response is invalid');
  }

  let rawResponse: unknown;
  try {
    rawResponse = JSON.parse(body);
  } catch {
    throw new Error('Yuanbao search response is invalid');
  }
  const parsed = ProviderResponseSchema.safeParse(rawResponse);
  if (!parsed.success) throw new Error('Yuanbao search response is invalid');
  if (parsed.data.Response.Error) {
    const code = parsed.data.Response.Error.Code;
    const safeCode = code && /^[A-Za-z0-9_-]{1,80}$/.test(code) ? code : 'upstream_error';
    throw new Error(`Yuanbao search failed: ${safeCode}`);
  }

  const results: YuanbaoSearchResponse['results'] = [];
  const seenUrls = new Set<string>();
  for (const rawPage of parsed.data.Response.Pages ?? []) {
    if (results.length >= MAX_RESULTS) break;
    let pageData: unknown = rawPage;
    if (typeof rawPage === 'string') {
      try {
        pageData = JSON.parse(rawPage);
      } catch {
        continue;
      }
    }
    const page = ProviderPageSchema.safeParse(pageData);
    if (!page.success || page.data.url.length > 2048) continue;

    let url: URL;
    try {
      url = new URL(page.data.url);
    } catch {
      continue;
    }
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password ||
      seenUrls.has(url.href)
    ) {
      continue;
    }

    seenUrls.add(url.href);
    results.push({
      title: (page.data.title?.trim() || url.hostname).slice(0, 200),
      url: page.data.url,
      snippet: (page.data.passage ?? '').trim().slice(0, 1000),
      ...(page.data.date?.trim() ? { publishedAt: page.data.date.trim().slice(0, 50) } : {})
    });
  }

  return { query, results };
};
