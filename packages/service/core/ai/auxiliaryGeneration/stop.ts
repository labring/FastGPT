import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../../common/logger';
import { WorkflowStopSignalCache } from '@fastgpt/dal/redis/caches';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.STATUS);
const stopSignalCache = new WorkflowStopSignalCache({ logger });

type AuxiliaryGenerationStopParams = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
};

/**
 * 读取 `/v2/chat/stop` 写入的运行态停止标记。
 *
 * 该 key 目前由 workflow status 模块写入；辅助生成不依赖 workflow 执行器，
 * 但必须识别同一个停止信号，保证 ChatBox 的停止按钮对 ChatAgentHelper 生效。
 */
export const shouldAuxiliaryGenerationStop = async (params: AuxiliaryGenerationStopParams) => {
  return stopSignalCache.isStopping(params);
};

/**
 * 清理运行态停止标记，让 `/v2/chat/stop` 的等待逻辑能判断生成已经结束。
 */
export const clearAuxiliaryGenerationStop = async (params: AuxiliaryGenerationStopParams) => {
  await stopSignalCache.clear(params);
};
