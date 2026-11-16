import { randomUUID } from 'crypto';
import type { Readable } from 'stream';
import type {
  ProbeConnectionBody,
  ProbeConnectionErrorCode,
  ProbeConnectionResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig/probe';
import { axiosWithoutSSRF } from '../../api/axios';
import { isValidServiceBaseUrl } from '@fastgpt/global/common/string/url';
import { serviceEnv } from '../../../env';
import { replaceS3UrlWithCdnEndpoint, S3Buckets } from '../../s3/config/constants';
import { MongoS3TTL } from '../../s3/models/ttl';

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
    const isWebSocketProxy = service === 'agentSandboxWsProxy';
    if (isWebSocketProxy && !/^wss?:/.test(url)) {
      return { connected: false, responseTimeMs: responseTimeMs(), errorCode: 'protocol' };
    }
    // 代理的 WS 与 HTTP 健康检查共用监听端口；仅检查服务可达，不创建 Ticket 或沙箱。
    const probeBaseUrl = isWebSocketProxy ? url.replace(/^ws/, 'http') : url;
    const parsedUrl = new URL(probeBaseUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        connected: false,
        responseTimeMs: responseTimeMs(),
        error: 'Only HTTP and HTTPS protocols are supported for connectivity probe',
        errorCode: 'protocol'
      };
    }

    // 与配置保存使用同一基地址约束，防止探测与真实请求命中不同的 URL。
    if (service && !isValidServiceBaseUrl(probeBaseUrl)) return invalidResponse();

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

    if (service === 'agentSandboxWsProxy' || service === 'agentSandboxPreviewProxy') {
      parsedUrl.pathname = `${basePath}/health`;
      const response = await axiosWithoutSSRF.get<string>(parsedUrl.toString(), {
        ...options,
        responseType: 'text'
      });
      if (response.status !== 200 || response.data !== 'OK') {
        return invalidResponse(response.status);
      }
      return { connected: true, status: response.status, responseTimeMs: responseTimeMs() };
    }

    if (service === 'fileService') {
      parsedUrl.pathname = `${basePath}${serviceEnv.NEXT_PUBLIC_BASE_URL}/api/system/file/health`;
      const response = await axiosWithoutSSRF.get(parsedUrl.toString(), options);
      if (
        response.status !== 200 ||
        response.data?.code !== 200 ||
        response.data?.data?.service !== 'fastgpt-file-service'
      ) {
        return invalidResponse(response.status);
      }
      return { connected: true, status: response.status, responseTimeMs: responseTimeMs() };
    }

    if (service === 'cdn') {
      // 测试唯一的临时对象，避免根路径 403 或普通网站的 200 被当成 CDN 可用。
      if (serviceEnv.STORAGE_VENDOR === 'r2') return invalidResponse();
      const bucket = global.s3BucketMap?.[S3Buckets.public];
      if (!bucket) return invalidResponse();
      const key = `system/probe/${randomUUID()}.txt`;
      const marker = `fastgpt-cdn-probe-${randomUUID()}`;
      /** 超时后仍等待已开始的上传完成，再清理对象；删除失败时保留 TTL 供后台回收。 */
      const runCdnProbe = async (): Promise<ProbeConnectionResponse> => {
        await MongoS3TTL.create({
          bucketName: bucket.bucketName,
          minioKey: key,
          expiredTime: new Date(Date.now() + 60 * 60 * 1000)
        });

        // TTL 写入可能晚于超时完成；此时不再启动上传，保留 TTL 由清理任务处理。
        if (controller.signal.aborted) throw new Error('Probe timed out');

        try {
          await bucket.client.uploadObject({
            key,
            body: Buffer.from(marker),
            contentType: 'text/plain'
          });
          if (controller.signal.aborted) throw new Error('Probe timed out');

          const publicUrl = bucket.externalClient.generatePublicGetUrl({ key }).url;
          const target = replaceS3UrlWithCdnEndpoint(publicUrl, url);
          const response = await axiosWithoutSSRF.get<string>(target, {
            ...options,
            responseType: 'text'
          });
          if (response.status !== 200 || response.data !== marker) {
            return invalidResponse(response.status);
          }
          return { connected: true, status: response.status, responseTimeMs: responseTimeMs() };
        } finally {
          void bucket.client
            .deleteObject({ key })
            .then(() => MongoS3TTL.deleteOne({ bucketName: bucket.bucketName, minioKey: key }))
            .catch(() => {});
        }
      };

      // 普通上传与 TTL 写入不支持取消；只提前结束请求，后台任务仍负责完成安全清理。
      let onAbort = () => {};
      const timeout = new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error('Probe timed out'));
        controller.signal.addEventListener('abort', onAbort, { once: true });
        if (controller.signal.aborted) onAbort();
      });
      try {
        return await Promise.race([runCdnProbe(), timeout]);
      } finally {
        controller.signal.removeEventListener('abort', onAbort);
      }
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
