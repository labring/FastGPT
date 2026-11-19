import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebFetchHandler } from './apiDataset';

type PreParsedBodyRequest = IncomingMessage & {
  body?: unknown;
  originalUrl?: string;
};

const readIncomingBody = async (req: PreParsedBodyRequest): Promise<Uint8Array | undefined> => {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return undefined;
  }

  // 兼容 Express / Next.js Pages API 等已经提前消费完流并挂载到 req.body 的中间件场景
  if (req.body !== undefined && req.readableEnded) {
    if (req.body instanceof Uint8Array) {
      return req.body;
    }
    if (typeof req.body === 'string') {
      return new TextEncoder().encode(req.body);
    }
    return new TextEncoder().encode(JSON.stringify(req.body));
  }

  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for await (const chunk of req) {
    const bytes = chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk));
    chunks.push(bytes);
    totalLength += bytes.byteLength;
  }

  if (totalLength === 0) {
    return undefined;
  }

  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
};

/**
 * 将标准 Web Fetch Handler 包装为 Node.js `(req, res)` 处理器，
 * 零外部依赖兼容原生 `http.createServer`、Express、Fastify 及 Next.js Pages API。
 */
export const toNodeHttpHandler =
  (fetchHandler: WebFetchHandler) =>
  async (req: PreParsedBodyRequest, res: ServerResponse): Promise<void> => {
    const host = req.headers.host ?? 'localhost';
    const protoHeader = req.headers['x-forwarded-proto'];
    const protocol =
      typeof protoHeader === 'string' && protoHeader.length > 0
        ? protoHeader.split(',')[0]!.trim()
        : 'http';
    const pathAndQuery = req.originalUrl ?? req.url ?? '/';
    const url = `${protocol}://${host}${pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`}`;

    const headers = new Headers();
    for (const [key, rawVal] of Object.entries(req.headers)) {
      if (rawVal === undefined) continue;
      if (Array.isArray(rawVal)) {
        for (const item of rawVal) {
          headers.append(key, item);
        }
      } else {
        headers.set(key, rawVal);
      }
    }

    const bodyBytes = await readIncomingBody(req);
    const bodyBuffer =
      bodyBytes !== undefined
        ? bodyBytes.buffer.slice(bodyBytes.byteOffset, bodyBytes.byteOffset + bodyBytes.byteLength)
        : undefined;

    const webRequest = new Request(url, {
      method: req.method ?? 'GET',
      headers,
      ...(bodyBuffer !== undefined ? { body: bodyBuffer as ArrayBuffer } : {})
    });

    const webResponse = await fetchHandler(webRequest);
    res.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const responseBytes = new Uint8Array(await webResponse.arrayBuffer());
    res.end(responseBytes);
  };
