import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { AgentNodeResponseDisplay } from '../../domain/constants';

export type CreateAgentLoopCoreCompressNodeResponseParams = {
  moduleName: string;
  moduleType: FlowNodeTypeEnum;
  usage?: ChatNodeUsageType;
  requestIds: string[];
  seconds: number;
  textOutput?: string;
  moduleLogo?: string;
  includeCompressTextAgent?: boolean;
};

/**
 * 创建 agent-loop 内部压缩 LLM 调用的 workflow nodeResponse。
 *
 * context compress 和 tool response compress 的基础结构一致；调用方只需要决定
 * moduleName、textOutput，以及是否保留旧版 compressTextAgent 字段。
 */
export const createAgentLoopCoreCompressNodeResponse = ({
  moduleName,
  moduleType,
  usage,
  requestIds,
  seconds,
  textOutput,
  moduleLogo = AgentNodeResponseDisplay.contextCompress.moduleLogo,
  includeCompressTextAgent = false
}: CreateAgentLoopCoreCompressNodeResponseParams): ChatHistoryItemResType => {
  const validRequestIds = requestIds.filter(Boolean);
  const id = validRequestIds[0] || getNanoid();

  return {
    id,
    nodeId: id,
    moduleName,
    moduleType,
    moduleLogo,
    runningTime: seconds,
    model: usage?.model,
    llmRequestIds: validRequestIds.length ? validRequestIds : undefined,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalPoints: usage?.totalPoints,
    textOutput,
    ...(includeCompressTextAgent
      ? {
          compressTextAgent: {
            inputTokens: usage?.inputTokens || 0,
            outputTokens: usage?.outputTokens || 0,
            totalPoints: usage?.totalPoints || 0
          }
        }
      : {})
  };
};
