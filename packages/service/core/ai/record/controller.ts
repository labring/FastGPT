import { MongoLLMRequestRecord } from './schema';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';
import { addLog } from '../../../common/system/log';

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
      body: params.body,
      response: params.response
    });
  } catch (error) {
    // 记录错误但不影响主流程
    addLog.error('Failed to save LLM request record', {
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
