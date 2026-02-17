import { MongoLLMRequestRecord } from './schema';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';
import { getLogger, LogCategories } from '../../../common/logger';
import { getErrText } from '@fastgpt/global/common/error/utils';

/**
 * Sanitize a value so it is safe for BSON serialization.
 * Strips circular references (e.g. Axios error config/request) and
 * non-serializable fields (functions, symbols).
 */
function sanitizeForBSON(value: unknown, seen = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'function' || typeof value === 'symbol') return undefined;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(typeof (value as any).status === 'number' && { status: (value as any).status }),
      ...(typeof (value as any).code === 'string' && { code: (value as any).code })
    };
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.map((item) => sanitizeForBSON(item, seen));
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = sanitizeForBSON(val, seen);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }
    return result;
  }

  return value;
}

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
      body: sanitizeForBSON(params.body),
      response: sanitizeForBSON(params.response)
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
