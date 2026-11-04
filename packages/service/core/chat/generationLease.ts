import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  ChatGenerationLeaseCache,
  type ChatGenerationLeaseParams
} from '@fastgpt/dal/redis/lease/chat/chatGenerationLease';
import { getLogger, LogCategories } from '../../common/logger';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import { WorkflowStopSignalCache } from '@fastgpt/dal/redis/caches/workflowStopSignal';
import {
  ChatGeneratingConflictDataSchema,
  ChatGeneratingConflictError
} from '@fastgpt/global/core/chat/error';

const logger = getLogger(LogCategories.MODULE.CHAT.HISTORY);
const generationLeaseCache = new ChatGenerationLeaseCache();
const stopSignalCache = new WorkflowStopSignalCache({ logger });
const LeaseValueSchema = z.object({
  token: z.string().min(1),
  recovery: ChatGeneratingConflictDataSchema
});

export const CHAT_GENERATION_LEASE_TTL_MS = 60 * 1000;
export const CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS = 10 * 1000;

/**
 * 按 chatId 批量读取同一资源下的运行状态，供列表、轮询与恢复共用。
 * 去重后一次 MGET，空列表不访问 Redis；仅读到非空 lease 时为运行中，缺失为空闲。
 * 读取异常默认回退为空闲；fallbackOnError=false 时透传异常，供轮询保留上次状态并重试。
 * 调用方须先完成资源和会话权限过滤；返回 Map 包含每个请求的 chatId。
 */
export const getChatGenerationStatuses = async ({
  sourceType,
  sourceId,
  chatIds,
  fallbackOnError = true
}: Omit<ChatGenerationLeaseParams, 'chatId'> & {
  chatIds: readonly string[];
  fallbackOnError?: boolean;
}) => {
  const ids = [...new Set(chatIds)];
  const tokens = await generationLeaseCache
    .getTokens({ sourceType, sourceId, chatIds: ids })
    .catch((error) => {
      if (!fallbackOnError) throw error;
      logger.warn('Chat generation lease status read failed; treating chats as idle', {
        sourceType,
        sourceId,
        chatCount: ids.length,
        error
      });
      return [];
    });
  return new Map<string, ChatGenerateStatusEnum>(
    ids.map((chatId, index) => [
      chatId,
      tokens[index] ? ChatGenerateStatusEnum.generating : ChatGenerateStatusEnum.done
    ])
  );
};

/**
 * 沿用 DAL 默认 3 秒超时获取独立于 SSE 的会话生成租约，成功后每 10 秒续租。
 * Redis 明确占用时，抛出携带当前轮恢复目标的冲突错误；旧格式 lease 无恢复信息时返回 undefined。
 * 获取异常记录日志并返回空释放函数，允许降级执行。
 * 确认获取成功后才比较清理获取时的旧 stop；超时后的迟到获取不能删除放行后收到的新 stop。
 * 成功时返回幂等的释放函数，由请求 finally 在保存、流收尾后调用。
 * token 封装在闭包内，业务只传会话与恢复信息；续租异常记录日志，执行状态仍由请求负责收尾。
 * 已知边界：失租后只停止续租，旧任务继续执行；获取异常时也允许未确认持有租约的任务执行。
 * 此时若同一会话启动另一任务，旧任务仍可能向共享恢复流写回答/[DONE]，或以旧结果覆盖会话变量。
 * token 比较仅保护续租和释放，不提供上述跨轮写入隔离，不能据此保证 Redis 故障期间的同会话互斥。
 */
export const tryStartChatGenerationLease = async (
  params: ChatGenerationLeaseParams & { responseChatItemId?: string; reusePreviousAi?: boolean }
): Promise<(() => Promise<void>) | undefined> => {
  // 普通新轮使用已有消息 ID；交互续跑的最终 ID 需在持锁后查询，恢复时应刷新并复用最新 AI。
  const recovery = params.reusePreviousAi
    ? { reusePreviousAi: true as const }
    : params.responseChatItemId
      ? { responseChatItemId: params.responseChatItemId }
      : undefined;
  // 随机 token 仍只用于区分租约所有者和比较续租/释放，不作为业务恢复 ID。
  const token = recovery ? JSON.stringify({ token: randomUUID(), recovery }) : randomUUID();
  const acquisition = await generationLeaseCache
    .tryAcquire({
      params,
      token,
      ttlMs: CHAT_GENERATION_LEASE_TTL_MS
    })
    .catch((error) => {
      logger.warn('Chat generation lease acquisition failed; proceeding without lease', {
        ...params,
        error
      });
      return undefined;
    });
  if (!acquisition) {
    // Redis 故障不能阻断生成；未确认持有租约时不启动续租，也不在收尾时操作其他执行的租约。
    return async () => {};
  }
  if (!acquisition.acquired) {
    // 明确占用不能被上面的 Redis 异常降级吞掉；占用快照与获取在同一个 Lua 中读取。
    const recovery = (() => {
      try {
        return LeaseValueSchema.safeParse(JSON.parse(acquisition.occupiedValue ?? 'null')).data
          ?.recovery;
      } catch {
        // 兼容旧版本的纯 token lease，由调用方保留原来的无目标冲突响应。
        return undefined;
      }
    })();
    if (recovery) {
      throw new ChatGeneratingConflictError(recovery);
    }
    return;
  }
  if (acquisition.stopSignal !== null) await stopSignalCache.clear(params, acquisition.stopSignal);

  let released = false;
  let renewing = false;
  const timer = setInterval(async () => {
    if (released || renewing) return;
    renewing = true;
    try {
      const renewed = await generationLeaseCache.renew({
        params,
        token,
        ttlMs: CHAT_GENERATION_LEASE_TTL_MS
      });
      if (!renewed && !released) {
        clearInterval(timer);
        logger.warn('Chat generation lease expired before request completed', params);
      }
    } catch (error) {
      logger.warn('Chat generation lease renewal failed', { ...params, error });
    } finally {
      renewing = false;
    }
  }, CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS);
  timer.unref?.();

  return async () => {
    if (released) return;
    released = true;
    clearInterval(timer);
    await generationLeaseCache.release({ params, token }).catch((error) => {
      // 释放失败时由 TTL 回收，不覆盖已经保存的生成结果。
      logger.warn('Chat generation lease release failed', { ...params, error });
    });
  };
};
