import { addLog } from '../../../common/system/log';
import { getGlobalRedisConnection } from '../../../common/redis/index';
import { delay } from '@fastgpt/global/common/system/utils';

const WORKFLOW_STATUS_PREFIX = 'agent_runtime_stopping';
const TTL = 60; // 1分钟

export const StopStatus = 'STOPPING';

export type WorkflowStatusParams = {
  appId: string;
  chatId: string;
};

// 获取工作流状态键
export const getRuntimeStatusKey = (params: WorkflowStatusParams): string => {
  return `${WORKFLOW_STATUS_PREFIX}:${params.appId}:${params.chatId}`;
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
    addLog.error(`[Agent Runtime Stop] Delete stop sign error`, err);
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
  appId,
  chatId,
  timeout = 5000,
  pollInterval = 50
}: {
  appId: string;
  chatId: string;
  timeout?: number;
  pollInterval?: number;
}) => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const sign = await shouldWorkflowStop({ appId, chatId });

    // 如果没有暂停中的标志，则认为已经完成任务了。
    if (!sign) {
      return;
    }

    // 等待下一次轮询
    await delay(pollInterval);
  }

  return;
};
