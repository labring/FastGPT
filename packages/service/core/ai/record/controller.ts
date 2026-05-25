import { MongoLLMRequestRecord } from './schema';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';
import { getLogger, LogCategories } from '../../../common/logger';
import { getNanoid } from '@fastgpt/global/common/string/tools';

export const createLLMRequestId = () => {
  return getNanoid(12);
};

const base64OmittedPlaceholder = '[base64 omitted]';
const dataUrlBase64Regex = /data:([^,]*;base64,)([A-Za-z0-9+/=_-]{32,})/g;
const fullBase64Regex = /^[A-Za-z0-9+/=_-]+$/;
const base64LikeKeySet = new Set(['base64', 'data']);

const isBase64LikeString = (value: string) => {
  const text = value.trim();

  return text.length >= 256 && fullBase64Regex.test(text);
};

const sanitizeString = (value: string, key?: string) => {
  const sanitizedDataUrl = value.replace(
    dataUrlBase64Regex,
    (_match, prefix: string) => `data:${prefix}${base64OmittedPlaceholder}`
  );

  if (base64LikeKeySet.has(key?.toLowerCase() ?? '') && isBase64LikeString(sanitizedDataUrl)) {
    return base64OmittedPlaceholder;
  }

  return isBase64LikeString(sanitizedDataUrl) ? base64OmittedPlaceholder : sanitizedDataUrl;
};

/**
 * 清洗 LLM 请求记录快照中的 base64 内容，避免大文件或图片音频原文落库。
 * 只用于记录入库前的副本，不参与真实模型请求、token 统计或响应解析。
 */
export const sanitizeLLMRequestRecordPayload = <T>(payload: T, key?: string): T => {
  if (typeof payload === 'string') {
    return sanitizeString(payload, key) as T;
  }

  if (!payload || typeof payload !== 'object') {
    return payload;
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
  requestId: string;
  body: any;
  response: any;
}) => {
  try {
    await MongoLLMRequestRecord.create({
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
 * @returns LLM 请求追踪记录
 */
export const getLLMRequestRecord = async (
  requestId: string
): Promise<LLMRequestRecordSchemaType | null> => {
  return await MongoLLMRequestRecord.findOne({ requestId }).lean();
};

/**
 * 批量查询追踪记录
 * @param requestIds - 请求ID数组
 * @returns LLM 请求追踪记录列表
 */
export const getLLMRequestRecords = async (
  requestIds: string[]
): Promise<LLMRequestRecordSchemaType[]> => {
  return MongoLLMRequestRecord.find({
    requestId: { $in: requestIds }
  });
};
