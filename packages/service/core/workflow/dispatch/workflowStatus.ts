import { getGlobalRedisConnection } from '../../../common/redis/index';
import { delay } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  clearAgentRuntimeStop,
  getAgentRuntimeStatusKey,
  shouldAgentRuntimeStop
} from '../../ai/runtimeStatus';

const TTL = 60; // 1分钟
const logger = getLogger(LogCategories.MODULE.WORKFLOW.STATUS);

export const StopStatus = 'STOPPING';

export type WorkflowStatusParams = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
};

// 暂停任务
export const setAgentRuntimeStop = async (params: WorkflowStatusParams): Promise<void> => {
  const redis = getGlobalRedisConnection();
  const key = getAgentRuntimeStatusKey(params);
  await redis.set(key, 1, 'EX', TTL);
};

// 删除任务状态
export const delAgentRuntimeStopSign = async (params: WorkflowStatusParams): Promise<void> => {
  await clearAgentRuntimeStop(params).catch((error) => {
    logger.error('Failed to delete workflow stop sign', {
      key: getAgentRuntimeStatusKey(params),
      error
    });
  });
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
    const sign = await shouldAgentRuntimeStop({ sourceType, sourceId, chatId });

    // 如果没有暂停中的标志，则认为已经完成任务了。
    if (!sign) {
      return;
    }

    // 等待下一次轮询
    await delay(pollInterval);
  }

  return;
};
