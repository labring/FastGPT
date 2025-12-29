import { formatModelChars2Points } from '../../../../../../support/wallet/usage/utils';
import { addLog } from '../../../../../../common/system/log';
import { createLLMResponse } from '../../../../../ai/llm/request';
import { getLLMModel } from '../../../../../ai/model';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { i18nT } from '../../../../../../../web/i18n/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

// TODO: 报错兜底机制
export const getOneStepResponseSummary = async ({
  response,
  model
}: {
  response: string;
  model: string;
}): Promise<{
  answerText: string;
  usage: ChatNodeUsageType;
  nodeResponse: ChatHistoryItemResType;
}> => {
  const startTime = Date.now();
  addLog.debug('Get one step response summary start');

  const modelData = getLLMModel(model);
  const { answerText, usage } = await createLLMResponse({
    body: {
      model: modelData.model,
      messages: [
        {
          role: 'user',
          content: `请对以下步骤执行结果进行概括，要求：
  1. 提取核心信息和关键结论
  2. 保留重要的数据、链接、引用
  3. 长度控制在 200-300 字
  4. 结构清晰，便于其他步骤引用
  
  执行结果：
  ${response}
  
  请生成概括：`
        }
      ],
      stream: false
    }
  });

  const { totalPoints, modelName } = formatModelChars2Points({
    model: modelData.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });

  return {
    answerText,
    usage: {
      moduleName: i18nT('account_usage:step_summary'),
      model: modelName,
      totalPoints,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    },
    nodeResponse: {
      nodeId: getNanoid(),
      id: getNanoid(),
      runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
      moduleType: FlowNodeTypeEnum.emptyNode,
      moduleName: i18nT('chat:step_summary'),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalPoints
    }
  };
};
