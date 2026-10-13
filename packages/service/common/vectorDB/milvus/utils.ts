import { ErrorCode } from '@zilliz/milvus2-sdk-node';
import type { MutationResult } from '@zilliz/milvus2-sdk-node';

/**
 * 解析 mutation RPC(insert/upsert/delete)的失败行下标。
 * SDK 不校验 status.error_code:服务端失败(OOM/quota/集合异常)以 error_code != Success
 * 或 err_index 部分失败表达而不 reject。status 非 Success 且无 err_index 时整批视为失败。
 * 迁移 upsert 与实时 insert/delete 共用,保持失败语义一致。
 */
export const resolveMutationErrIndex = (
  result: Pick<MutationResult, 'status' | 'err_index'>,
  rowCount: number
): number[] => {
  if (Array.isArray(result.err_index) && result.err_index.length > 0) {
    return result.err_index.map((i) => Number(i));
  }
  const errorCode = result.status?.error_code;
  return errorCode === ErrorCode.SUCCESS ? [] : Array.from({ length: rowCount }, (_, i) => i);
};
