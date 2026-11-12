import http from 'node:http';
import https from 'node:https';
import type { CliFetchFn } from '../../shared/types';

/**
 * 在显式指定 `--ca-cert` 或 `--insecure` 时，将 `node:http` / `node:https` 适配为标准 `fetch`，
 * 以便 `ky` 拦截器与超时控制无需引入任何原生扩展即可支持私有证书。
 */
export function createNodeTlsFetch({
  insecure,
  caPem
}: {
  insecure: boolean;
  caPem?: string;
}): CliFetchFn {
  return async function nodeTlsFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    const target = new URL(request.url);
    const transport = target.protocol === 'https:' ? https : http;

    const headerEntries: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headerEntries[key] = value;
    });

    const bodyBuffer = request.body !== null ? Buffer.from(await request.arrayBuffer()) : undefined;

    return new Promise<Response>((resolve, reject) => {
      const req = transport.request(
        target,
        {
          method: request.method,
          headers: headerEntries,
          ...(target.protocol === 'https:'
            ? {
                rejectUnauthorized: !insecure,
                ...(caPem ? { ca: caPem } : {})
              }
            : {})
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const responseHeaders = new Headers();
            for (const [key, value] of Object.entries(res.headers)) {
              if (Array.isArray(value)) {
                value.forEach((item) => responseHeaders.append(key, item));
              } else if (value !== undefined) {
                responseHeaders.set(key, value);
              }
            }
            const bodyBytes = new Uint8Array(Buffer.concat(chunks));
            resolve(
              new Response(bodyBytes, {
                status: res.statusCode ?? 500,
                statusText: res.statusMessage ?? '',
                headers: responseHeaders
              })
            );
          });
        }
      );

      if (request.signal) {
        if (request.signal.aborted) {
          req.destroy(new Error('The operation was aborted'));
          return;
        }
        const onAbort = () => {
          req.destroy(new Error('The operation was aborted'));
        };
        request.signal.addEventListener('abort', onAbort, { once: true });
        req.on('close', () => request.signal.removeEventListener('abort', onAbort));
      }

      req.on('error', reject);
      if (bodyBuffer) {
        req.write(bodyBuffer);
      }
      req.end();
    });
  };
}
