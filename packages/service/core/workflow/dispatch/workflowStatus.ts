import { getGlobalRedisConnection } from '../../../common/redis/index';
import { delay } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const WORKFLOW_STATUS_PREFIX = 'agent_runtime_stopping';
const TTL = 60; // 1分钟
const logger = getLogger(LogCategories.MODULE.WORKFLOW.STATUS);

export const StopStatus = 'STOPPING';

export type WorkflowStatusParams = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
};

/** 获取运行态停止状态键。key 必须带 sourceType，避免 App 与 Skill Edit 共用 sourceId 时串号。 */
export const getRuntimeStatusKey = (params: WorkflowStatusParams): string => {
  return `${WORKFLOW_STATUS_PREFIX}:${params.sourceType}:${params.sourceId}:${params.chatId}`;
};

// 暂停任务
export const setAgentRuntimeStop = async (params: WorkflowStatusParams): Promise<void> => {
  const redis = getGlobalRedisConnection();
  const key = getRuntimeStatusKey(params);
  await redis.set(key, 1, 'EX', TTL);
};

// 删除任务状态
export const delAgentRuntimeStopSign = async (params: WorkflowStatusParams): Promise<void> => {
  const redis = getGlobalRedisConnection();
  const key = getRuntimeStatusKey(params);
  await redis.del(key).catch((err) => {
    logger.error('Failed to delete workflow stop sign', { key, error: err });
  });
};

// 检查工作流是否应该停止
export const shouldWorkflowStop = (params: WorkflowStatusParams): Promise<boolean> => {
  const redis = getGlobalRedisConnection();
  const key = getRuntimeStatusKey(params);
  return redis
    .get(key)
    .then((res) => !!res)
    .catch(() => false);
};

/**
 * 等待工作流完成(记录被删除)
 * @param params 工作流参数
 * @param timeout 超时时间(毫秒),默认5秒
 * @param pollInterval 轮询间隔(毫秒),默认50毫秒
 * @returns true=正常完成, false=超时
 */
export const waitForWorkflowComplete = async ({
  sourceType,
  sourceId,
  chatId,
  timeout = 5000,
  pollInterval = 50
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
  timeout?: number;
  pollInterval?: number;
}) => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const sign = await shouldWorkflowStop({ sourceType, sourceId, chatId });

    // 如果没有暂停中的标志，则认为已经完成任务了。
    if (!sign) {
      return;
    }

    // 等待下一次轮询
    await delay(pollInterval);
  }

  return;
};
