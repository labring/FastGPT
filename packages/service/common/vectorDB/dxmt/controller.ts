import { DXMT_ADDRESS, DXMT_API_KEY } from '../constants';

/** DXMT 过滤条件：must 全部满足，must_not 一个都不满足（服务端的扁平过滤结构）。 */
export type DxmtCondition = {
  key: string;
  operation: { type: 'Equal' | 'In' | 'GreaterThanOrEqual' | 'LessThanOrEqual'; value: unknown };
};
export type DxmtFilter = { must?: DxmtCondition[]; must_not?: DxmtCondition[] };

/** 请求超时：召回与 pg 一致按 120 秒，其余写入/删除/统计同样足够宽裕。 */
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * 调用 DXMT REST API（`{DXMT_URL}/api/v1{path}`），返回响应信封中的 `data`。
 * DXMT 的所有响应都是 `{ success, data, error: { code, message } }`；非 2xx 或 success=false
 * 时抛出带 code 的错误，调用方据此区分「表已存在」等可忽略的情况。
 */
export const dxmtRequest = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const base = (DXMT_ADDRESS || '').replace(/\/+$/, '');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (DXMT_API_KEY) headers.authorization = `Bearer ${DXMT_API_KEY}`;

  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const text = await res.text();
  let envelope: { success?: boolean; data?: T; error?: { code?: string; message?: string } } = {};
  try {
    envelope = text ? JSON.parse(text) : {};
  } catch {
    // 非 JSON 响应（例如代理返回的 HTML 错误页）按原文报错
  }
  if (!res.ok || envelope.success === false) {
    const code = envelope.error?.code || `HTTP_${res.status}`;
    const message = envelope.error?.message || text.slice(0, 300);
    const error = new Error(`DXMT ${method} ${path} failed: ${code} ${message}`) as Error & {
      code?: string;
    };
    error.code = code;
    throw error;
  }
  return envelope.data as T;
};

/** 列表接口的记录在部分版本中以 `payload_json` 字符串返回，统一解析为对象。 */
export const readPayload = (record: {
  payload?: Record<string, unknown>;
  payload_json?: string;
}): Record<string, unknown> => {
  if (record.payload) return record.payload;
  if (record.payload_json) {
    try {
      return JSON.parse(record.payload_json);
    } catch {
      return {};
    }
  }
  return {};
};
