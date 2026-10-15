import { MongoLLMRequestRecord } from './schema';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';
import { getLogger, LogCategories } from '../../../common/logger';
import { getNanoid } from '@fastgpt/global/common/string/tools';

export const createLLMRequestId = () => {
  return getNanoid(12);
};

const base64OmittedPlaceholder = '[base64 omitted]';
const base64LikeKeySet = new Set(['base64', 'data']);
const fullBase64Regex = /^[A-Za-z0-9+/=_-]+$/;
const dataUrlPrefix = 'data:';
const base64UrlMarker = ';base64,';
const rawBase64OmitLength = 256;

const isBase64LikeString = (value: string) => {
  const text = value.trim();

  return text.length >= rawBase64OmitLength && fullBase64Regex.test(text);
};

/**
 * 清洗整个字段值形式的 data URL。
 * 大视频会生成超长 data URL，使用正则 replace 容易触发 V8 栈溢出。
 */
const sanitizeDataUrlBase64 = (value: string) => {
  if (!value.startsWith(dataUrlPrefix)) return value;

  const markerIndex = value.indexOf(base64UrlMarker);
  if (markerIndex === -1) return value;

  return `${value.slice(0, markerIndex + base64UrlMarker.length)}${base64OmittedPlaceholder}`;
};

const sanitizeString = (value: string, key?: string) => {
  const sanitizedDataUrl = sanitizeDataUrlBase64(value);

  if (base64LikeKeySet.has(key?.toLowerCase() ?? '') && isBase64LikeString(sanitizedDataUrl)) {
    return base64OmittedPlaceholder;
  }

  return isBase64LikeString(sanitizedDataUrl) ? base64OmittedPlaceholder : sanitizedDataUrl;
};

/**
 * 清洗 LLM 日志与请求记录快照中的 base64，并显式保留 Error 的不可枚举诊断属性。
 * 只处理快照副本，不参与真实模型请求、token 统计或响应解析。
 */
export const sanitizeLLMRequestRecordPayload = <T>(payload: T, key?: string): T => {
  if (typeof payload === 'string') {
    return sanitizeString(payload, key) as T;
  }

  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (payload instanceof Error) {
    // Object.entries(Error) 会丢掉 message、stack、cause，先展开再递归清洗诊断内容。
    return sanitizeLLMRequestRecordPayload({
      ...payload,
      name: payload.name,
      message: payload.message,
      ...(payload.stack !== undefined && { stack: payload.stack }),
      ...(payload.cause !== undefined && { cause: payload.cause })
    }) as T;
  }

  if (payload instanceof Date) {
    return payload;
  }

  if (Buffer.isBuffer(payload)) {
    return base64OmittedPlaceholder as T;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeLLMRequestRecordPayload(item)) as T;
  }

  return Object.fromEntries(
    Object.entries(payload).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeLLMRequestRecordPayload(entryValue, entryKey)
    ])
  ) as T;
};

/**
 * 保存 LLM 请求追踪记录（异步，不阻塞主流程）
 * @param params - 包含 requestId, body, response 的对象
 */
export const saveLLMRequestRecord = async (params: {
  teamId: string;
  requestId: string;
  body: any;
  response: any;
}) => {
  try {
    await MongoLLMRequestRecord.create({
      teamId: params.teamId,
      requestId: params.requestId,
      body: sanitizeLLMRequestRecordPayload(params.body),
      response: sanitizeLLMRequestRecordPayload(params.response)
    });
  } catch (error) {
    // 记录错误但不影响主流程
    getLogger(LogCategories.MODULE.AI).error('Failed to save LLM request record', {
      requestId: params.requestId,
      error
    });
  }
};

/**
 * 根据 requestId 查询追踪记录
 * @param requestId - 请求ID
 * @param teamId - 调用方团队 ID，用于隔离不同团队的请求详情
 * @returns LLM 请求追踪记录
 */
export const getLLMRequestRecord = async (
  requestId: string,
  teamId: string
): Promise<LLMRequestRecordSchemaType | null> => {
  return await MongoLLMRequestRecord.findOne({ requestId, teamId }).lean();
};

/**
 * 批量查询追踪记录
 * @param requestIds - 请求ID数组
 * @param teamId - 调用方团队 ID，用于隔离不同团队的请求详情
 * @returns LLM 请求追踪记录列表
 */
export const getLLMRequestRecords = async (
  requestIds: string[],
  teamId: string
): Promise<LLMRequestRecordSchemaType[]> => {
  return MongoLLMRequestRecord.find({
    requestId: { $in: requestIds },
    teamId
  });
};
