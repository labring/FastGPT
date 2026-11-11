import { randomUUID } from 'crypto';
import type { Readable } from 'stream';
import type {
  ProbeConnectionBody,
  ProbeConnectionErrorCode,
  ProbeConnectionResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig/probe';
import { axiosWithoutSSRF } from '../../api/axios';

const maxResponseBytes = 16 * 1024;

/**
 * 以管理员配置的地址探测连通性。普通模式沿用收到任意 HTTP 状态即连通的语义；
 * 子服务模式验证实际协议，并只返回安全错误分类，不暴露凭据、响应体或底层异常。
 * MCP SSE 使用随机虚拟 key，仅验证传输握手，不校验真实 key 或调用工具。
 */
export const probeUrlConnection = async ({
  url,
  timeoutMs = 5000,
  service,
  token
}: ProbeConnectionBody): Promise<ProbeConnectionResponse> => {
  const startTime = Date.now();
  const controller = new AbortController();
  // 整个探测共用一个截止时间，避免 GET/HEAD 重试或持续 SSE 数据延长上限。
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 30000));
  const responseTimeMs = () => Date.now() - startTime;
  const invalidResponse = (status?: number): ProbeConnectionResponse => ({
    connected: false,
    status,
    responseTimeMs: responseTimeMs(),
    error: 'Invalid service response',
    errorCode: 'response'
  });

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        connected: false,
        responseTimeMs: responseTimeMs(),
        error: 'Only HTTP and HTTPS protocols are supported for connectivity probe',
        errorCode: 'protocol'
      };
    }

    const options = {
      timeout: Math.min(timeoutMs, 30000),
      signal: controller.signal,
      validateStatus: () => true,
      maxContentLength: maxResponseBytes,
      maxRedirects: 0,
      headers: { 'User-Agent': 'FastGPT-Probe/1.0' }
    };

    const basePath = parsedUrl.pathname.replace(/\/+$/, '');
    if (service) {
      // 按 pathname 拼接服务固定路由，不能让查询参数或片段改变请求目标。
      parsedUrl.search = '';
      parsedUrl.hash = '';
    }

    if (service === 'codeSandbox') {
      if (!token?.trim()) return invalidResponse();
      parsedUrl.pathname = `${basePath}/sandbox/js`;
      const response = await axiosWithoutSSRF.post(
        parsedUrl.toString(),
        { code: 'async function main() { return { result: 6 * 7 }; }', variables: {} },
        { ...options, headers: { ...options.headers, Authorization: `Bearer ${token.trim()}` } }
      );
      if (
        response.status < 200 ||
        response.status >= 300 ||
        response.data?.success !== true ||
        response.data?.data?.codeReturn?.result !== 42
      ) {
        return invalidResponse(response.status);
      }
      return { connected: true, status: response.status, responseTimeMs: responseTimeMs() };
    }

    if (service === 'mcpSse') {
      const key = `fastgpt-probe-${randomUUID()}`;
      parsedUrl.pathname = `${basePath}/${key}/sse`;
      const response = await axiosWithoutSSRF.get<Readable>(parsedUrl.toString(), {
        ...options,
        responseType: 'stream',
        headers: { ...options.headers, Accept: 'text/event-stream' }
      });
      const stream = response.data;
      if (
        response.status !== 200 ||
        !String(response.headers['content-type'] ?? '')
          .toLowerCase()
          .startsWith('text/event-stream')
      ) {
        stream.destroy();
        return invalidResponse(response.status);
      }

      const matched = await new Promise<boolean>((resolve, reject) => {
        let receivedBytes = 0;
        let text = '';
        let settled = false;
        const onAbort = () => {
          if (settled) return;
          settled = true;
          reject(new Error('Probe timed out'));
          stream.destroy();
        };
        const finish = (result: boolean) => {
          if (settled) return;
          settled = true;
          controller.signal.removeEventListener('abort', onAbort);
          stream.destroy();
          resolve(result);
        };
        stream.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (receivedBytes > maxResponseBytes) return finish(false);
          text += chunk.toString('utf8');
          const events = text.split(/\r?\n\r?\n/);
          text = events.pop() ?? '';
          for (const event of events) {
            const lines = event.split(/\r?\n/);
            const eventName = lines
              .find((line) => line.startsWith('event:'))
              ?.slice(6)
              .trim();
            const data = lines
              .find((line) => line.startsWith('data:'))
              ?.slice(5)
              .trim();
            if (eventName !== 'endpoint' || !data) continue;
            try {
              const endpoint = new URL(data, parsedUrl.origin);
              if (
                endpoint.origin === parsedUrl.origin &&
                endpoint.pathname === `${basePath}/${key}/messages` &&
                Boolean(endpoint.searchParams.get('sessionId'))
              ) {
                return finish(true);
              }
              return finish(false);
            } catch {
              return finish(false);
            }
          }
        });
        stream.once('end', () => finish(false));
        stream.once('close', () => finish(false));
        stream.once('error', (error) => {
          if (!settled) {
            settled = true;
            controller.signal.removeEventListener('abort', onAbort);
            reject(error);
          }
        });
        controller.signal.addEventListener('abort', onAbort, { once: true });
        if (controller.signal.aborted) onAbort();
      });
      if (!matched) return invalidResponse(response.status);
      return { connected: true, status: response.status, responseTimeMs: responseTimeMs() };
    }

    // 通用模式保留任意 HTTP 状态视作网络连通的历史语义。
    let response;
    try {
      response = await axiosWithoutSSRF.get(url, options);
    } catch (error: any) {
      if (error?.response) response = error.response;
      else if (
        ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNABORTED'].includes(
          error?.code
        ) ||
        controller.signal.aborted
      )
        throw error;
      else response = await axiosWithoutSSRF.head(url, options);
    }
    return {
      connected: true,
      status: response.status,
      statusText: response.statusText || 'OK',
      responseTimeMs: responseTimeMs()
    };
  } catch (error: any) {
    const rawCode = error?.code || error?.name || '';
    const errorCode: ProbeConnectionErrorCode = (() => {
      if (controller.signal.aborted || rawCode === 'ECONNABORTED' || rawCode === 'ETIMEDOUT') {
        return 'timeout';
      }
      if (rawCode === 'ECONNREFUSED') return 'refused';
      if (rawCode === 'ENOTFOUND' || rawCode === 'EAI_AGAIN') return 'dns';
      return 'unknown';
    })();
    return {
      connected: false,
      responseTimeMs: responseTimeMs(),
      error: 'Connection failed',
      errorCode
    };
  } finally {
    clearTimeout(timer);
  }
};
