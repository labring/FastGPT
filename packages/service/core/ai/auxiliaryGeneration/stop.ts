import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getGlobalRedisConnection } from '../../../common/redis';

const RUNTIME_STOP_KEY_PREFIX = 'agent_runtime_stopping';

type AuxiliaryGenerationStopParams = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
};

const getAuxiliaryGenerationStopKey = ({
  sourceType,
  sourceId,
  chatId
}: AuxiliaryGenerationStopParams) =>
  `${RUNTIME_STOP_KEY_PREFIX}:${sourceType}:${sourceId}:${chatId}`;

/**
 * 读取 `/v2/chat/stop` 写入的运行态停止标记。
 *
 * 该 key 目前由 workflow status 模块写入；辅助生成不依赖 workflow 执行器，
 * 但必须识别同一个停止信号，保证 ChatBox 的停止按钮对 ChatAgentHelper 生效。
 */
export const shouldAuxiliaryGenerationStop = async (params: AuxiliaryGenerationStopParams) => {
  const redis = getGlobalRedisConnection();
  return redis
    .get(getAuxiliaryGenerationStopKey(params))
    .then((res) => !!res)
    .catch(() => false);
};

/**
 * 清理运行态停止标记，让 `/v2/chat/stop` 的等待逻辑能判断生成已经结束。
 */
export const clearAuxiliaryGenerationStop = async (params: AuxiliaryGenerationStopParams) => {
  const redis = getGlobalRedisConnection();
  await redis.del(getAuxiliaryGenerationStopKey(params)).catch(() => undefined);
};
