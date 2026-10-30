import {
  PERMISSION_FETCH_CONCURRENCY,
  PERMISSION_FETCH_TIMEOUT_MS
} from '@fastgpt/global/core/dataset/apiDataset/constants';
import { withTimeout } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../../../common/logger';
import type { getApiDatasetRequest } from '../../index';
import {
  assertPermissionSyncDeadline,
  getRemainingTimeoutMs,
  PermissionSyncDeadlineError
} from '../utils';
import type { RawApiFilePermissionSnapshot } from '../types';

type ApiDatasetRequest = Awaited<ReturnType<typeof getApiDatasetRequest>>;

const logger = getLogger(LogCategories.MODULE.DATASET);

/** 凭据级故障：重试无意义，立即中止整轮，不能当作单节点失败吞掉。 */
class ApiFilePermissionUnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiFilePermissionUnauthorizedError';
  }
}

/**
 * 并发拉取自定义 API 文件库的文件详情，原样取出 `permissions`。
 *
 * 只负责拉取和容错，不解释 `permissions`：格式规则统一由 `fetchApiFilePermissions` 判定。
 *  - 详情里没有该字段 → `rawPermissions: undefined`（外部未表达）；
 *  - 字段存在 → 原样返回，空数组 `[]` 也要保留（它表示「外部明确没有协作者」）。
 *
 * 容错边界：
 *  - 单节点超时 / 5xx / 限流 → `status: 'failed'`，本轮跳过该节点，不中止整轮；
 *  - 凭据失效（`UNAUTHORIZED`）→ 立即抛错（重试无意义）；
 *  - 一整批（满并发度）全部失败 → 判定外部整体不可用，抛错中止，避免半轮写入；
 *    末尾不足并发度的批次全失败只记 failed，符合「单节点失败不中止」。
 *  - deadline 错误穿透所有 catch，保证超时任务不会继续拉取；预算耗尽导致的单请求
 *    超时同样按 deadline 处理，不计入 failed。
 */
export const fetchCustomApiFilePermissions = async ({
  request,
  apiFileIds,
  deadlineAt
}: {
  request: ApiDatasetRequest;
  apiFileIds: string[];
  deadlineAt?: number;
}): Promise<Map<string, RawApiFilePermissionSnapshot>> => {
  const result = new Map<string, RawApiFilePermissionSnapshot>();

  for (let offset = 0; offset < apiFileIds.length; offset += PERMISSION_FETCH_CONCURRENCY) {
    assertPermissionSyncDeadline(deadlineAt);

    const chunk = apiFileIds.slice(offset, offset + PERMISSION_FETCH_CONCURRENCY);
    const snapshots = await Promise.all(
      chunk.map(async (apiFileId): Promise<RawApiFilePermissionSnapshot> => {
        assertPermissionSyncDeadline(deadlineAt);

        // 单请求超时不超过剩余预算：让在途批在截止点收敛，旧任务不会在超时后多挂一个
        // 请求超时。只影响本次 await，底层请求仍会跑完，不释放连接。
        const timeoutMs = getRemainingTimeoutMs({
          deadlineAt,
          maxTimeoutMs: PERMISSION_FETCH_TIMEOUT_MS
        });

        try {
          const detail = await withTimeout(
            request.getFileDetail({ apiFileId }),
            timeoutMs,
            `Fetch api file permission timed out: ${apiFileId}`
          );

          if (!detail.success) {
            if (detail.code === 'NOT_FOUND') {
              // 文件在远端已消失：本轮不改本地，交给结构同步删除
              return { apiFileId, status: 'ok', rawPermissions: undefined };
            }
            if (detail.code === 'UNAUTHORIZED') {
              throw new ApiFilePermissionUnauthorizedError(
                `Fetch api file permission unauthorized: ${detail.message || apiFileId}`
              );
            }
            throw new Error(
              `Fetch api file permission failed [${detail.code}]: ${detail.message || apiFileId}`
            );
          }

          return {
            apiFileId,
            status: 'ok',
            rawPermissions: (detail.data as { permissions?: unknown }).permissions
          };
        } catch (error) {
          if (
            error instanceof PermissionSyncDeadlineError ||
            error instanceof ApiFilePermissionUnauthorizedError
          ) {
            throw error;
          }
          // 预算耗尽导致的单请求超时按 deadline 中止，不能记成节点失败。
          assertPermissionSyncDeadline(deadlineAt);
          logger.warn('fetch api file permission failed, skip this node', {
            apiFileId,
            error
          });
          return { apiFileId, status: 'failed' };
        }
      })
    );

    let failedCount = 0;
    for (const snapshot of snapshots) {
      if (snapshot.status === 'failed') failedCount++;
      result.set(snapshot.apiFileId, snapshot);
    }
    // 满并发批次全部失败 = 外部整体不可用；否则（末批不足并发度）只记失败，继续本轮。
    if (chunk.length === PERMISSION_FETCH_CONCURRENCY && failedCount === chunk.length) {
      throw new Error(
        `Fetch api file permissions failed for the whole batch (${failedCount} files)`
      );
    }
  }

  return result;
};
