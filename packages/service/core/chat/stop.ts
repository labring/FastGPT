import { delay } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../common/logger';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  WorkflowStopSignalCache,
  getWorkflowStopSignalKey
} from '@fastgpt/dal/redis/caches/workflowStopSignal';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.STATUS);
const stopSignalCache = new WorkflowStopSignalCache({ logger });

export const StopStatus = 'STOPPING';

export type WorkflowStatusParams = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
};

/** 获取运行态停止状态键。key 必须带 sourceType，避免 App 与 Skill Edit 共用 sourceId 时串号。 */
export const getRuntimeStatusKey = (params: WorkflowStatusParams): string => {
  return getWorkflowStopSignalKey(params);
};

/** 写入跨实例共享的主动停止标记；写入失败上抛，客户端不能把断流当作停止成功。 */
export const setAgentRuntimeStop = async (params: WorkflowStatusParams): Promise<void> => {
  await stopSignalCache.set(params);
};

/** 清理本轮停止标记；失败由 Cache 记录日志，不覆盖生成结果。 */
export const delAgentRuntimeStopSign = async (params: WorkflowStatusParams): Promise<void> => {
  await stopSignalCache.clear(params);
};

/** 读取主动停止标记；Redis 读取失败时按未停止降级。 */
export const shouldWorkflowStop = (params: WorkflowStatusParams): Promise<boolean> => {
  return stopSignalCache.isStopping(params);
};

/**
 * 为一次生成监听主动停止信号，供 Workflow、Helper 与 Builder 共用。
 * 首次读取保留准备阶段已收到的停止请求，后续每 100ms 检查一次且不重叠读取。
 * 停止状态只允许从 false 变成 true；读取失败沿用 Cache 的放行策略，SSE 断开不参与判断。
 * 调用方须在整个初始化和执行流程的 finally 中 cleanup，停止标记只在结束时清理。
 */
export const createChatStopController = async (params: WorkflowStatusParams) => {
  let stopping = await shouldWorkflowStop(params);
  let checking = false;
  let disposed = false;
  let cleanupPromise: Promise<void> | undefined;

  const timer = setInterval(async () => {
    if (disposed || stopping || checking) return;
    checking = true;
    try {
      if ((await shouldWorkflowStop(params)) && !disposed) {
        stopping = true;
        clearInterval(timer);
      }
    } finally {
      checking = false;
    }
  }, 100);
  timer.unref?.();
  if (stopping) clearInterval(timer);

  return {
    checkIsStopping: () => stopping,
    cleanup: () => {
      disposed = true;
      clearInterval(timer);
      cleanupPromise ??= delAgentRuntimeStopSign(params);
      return cleanupPromise;
    }
  };
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
