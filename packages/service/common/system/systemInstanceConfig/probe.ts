import type {
  ProbeConnectionBody,
  ProbeConnectionResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig';
import { axios } from '../../api/axios';

/**
 * 由后端服务发起 HTTP 请求探测目标 URL 的网络连通性。
 * - 优先使用 HEAD 请求减少带宽消耗，若返回 405 Method Not Allowed 则回退至 GET 请求；
 * - 任何收到 HTTP 状态码的响应（包括 200/401/403/404 等）均判定为网络连通成功；
 * - 仅当网络超时、域名无法解析、端口被拒绝等底层异常时判定为连通失败。
 */
export const probeUrlConnection = async ({
  url,
  timeoutMs = 5000
}: ProbeConnectionBody): Promise<ProbeConnectionResponse> => {
  const startTime = Date.now();

  try {
    // 优先使用 GET 请求探测（限制接收体最大 16KB，避免拉取大响应体）。
    // 原因：大量微服务（如 Go Gin 框架的 /api/status）只注册了 GET 方法，发 HEAD 会直接返回 404 Not Found。
    let response;
    try {
      response = await axios.get(url, {
        timeout: timeoutMs,
        validateStatus: () => true,
        maxContentLength: 1024 * 16,
        headers: {
          'User-Agent': 'FastGPT-Probe/1.0'
        }
      });
    } catch (getErr: any) {
      if (getErr?.response) {
        response = getErr.response;
      } else {
        // 若 GET 底层报错，尝试 HEAD 兜底
        response = await axios.head(url, {
          timeout: timeoutMs,
          validateStatus: () => true
        });
      }
    }

    const responseTimeMs = Date.now() - startTime;

    return {
      connected: true,
      status: response.status,
      statusText: response.statusText || 'OK',
      responseTimeMs
    };
  } catch (error: any) {
    const responseTimeMs = Date.now() - startTime;
    const errorCode = error?.code || error?.name || '';
    let errorMessage = error?.message || 'Connection failed';

    if (errorCode === 'ECONNABORTED' || errorMessage.includes('timeout')) {
      errorMessage = `连接超时（超过 ${timeoutMs}ms 未响应）`;
    } else if (errorCode === 'ECONNREFUSED') {
      errorMessage = '连接被拒绝（目标服务未启动或网络不通）';
    } else if (errorCode === 'ENOTFOUND') {
      errorMessage = '无法解析的主机名或域名';
    }

    return {
      connected: false,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      responseTimeMs,
      error: errorMessage
    };
  }
};
