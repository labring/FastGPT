import { MongoLLMRequestRecord } from './schema';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';
import { getLogger, LogCategories } from '../../../common/logger';
import { getNanoid } from '@fastgpt/global/common/string/tools';

export const createLLMRequestId = () => {
  return getNanoid(12);
};

const base64OmittedPlaceholder = '[base64 omitted]';
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

const sanitizeString = (value: string) => {
  const sanitizedDataUrl = sanitizeDataUrlBase64(value);
  return isBase64LikeString(sanitizedDataUrl) ? base64OmittedPlaceholder : sanitizedDataUrl;
};

/**
 * 清洗 LLM 日志与请求记录快照中的 base64，并显式保留 Error 的不可枚举诊断属性。
 * 只处理快照副本，不参与真实模型请求、token 统计或响应解析。
 *
 * omitErrorStack: 请求记录会通过接口展示给团队成员，写入时不保存调用栈（含服务端代码路径），
 * 保留 name、message、code 和 cause 等诊断属性；日志场景默认保留 stack 便于排查。
 */
export const sanitizeLLMRequestRecordPayload = <T>(
  payload: T,
  { omitErrorStack = false }: { omitErrorStack?: boolean } = {}
): T => {
  /** 整个快照共享同一组日志/入库选项，避免嵌套 cause 漏清理。 */
  const sanitize = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return sanitizeString(value);
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    if (value instanceof Error) {
      // 先排除可能可枚举的 stack，再按使用场景补回；其余不可枚举诊断属性显式展开。
      const { stack, ...enumerableFields } = value;
      return sanitize({
        ...enumerableFields,
        name: value.name,
        message: value.message,
        ...(!omitErrorStack && stack !== undefined && { stack }),
        ...(value.cause !== undefined && { cause: value.cause })
      });
    }

    if (value instanceof Date) {
      return value;
    }

    if (Buffer.isBuffer(value)) {
      return base64OmittedPlaceholder;
    }

    if (Array.isArray(value)) {
      return value.map(sanitize);
    }

    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitize(entryValue)])
    );
  };

  return sanitize(payload) as T;
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
      body: sanitizeLLMRequestRecordPayload(params.body, { omitErrorStack: true }),
      response: sanitizeLLMRequestRecordPayload(params.response, {
        omitErrorStack: true
      })
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
