import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getGlobalRedisConnection } from '../../common/redis';

const AGENT_RUNTIME_STOP_KEY_PREFIX = 'agent_runtime_stopping';

export type AgentRuntimeStatusParams = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
};

/** 构造跨 workflow/auxiliary generation 共用的 Agent 运行停止键。 */
export const getAgentRuntimeStatusKey = ({
  sourceType,
  sourceId,
  chatId
}: AgentRuntimeStatusParams) =>
  `${AGENT_RUNTIME_STOP_KEY_PREFIX}:${sourceType}:${sourceId}:${chatId}`;

/** 读取 Agent 运行停止标记；Redis 短暂不可用时保持运行，交由下一次轮询重试。 */
export const shouldAgentRuntimeStop = async (params: AgentRuntimeStatusParams) => {
  const redis = getGlobalRedisConnection();
  return redis
    .get(getAgentRuntimeStatusKey(params))
    .then((value) => !!value)
    .catch(() => false);
};

/** 删除 Agent 运行停止标记；调用方根据自身生命周期决定如何处理清理失败。 */
export const clearAgentRuntimeStop = async (params: AgentRuntimeStatusParams) => {
  const redis = getGlobalRedisConnection();
  await redis.del(getAgentRuntimeStatusKey(params));
};
