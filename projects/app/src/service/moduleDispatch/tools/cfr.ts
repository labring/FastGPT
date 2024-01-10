import type { ChatItemType, moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import { getHistories } from '../utils';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { ModelTypeEnum, getExtractModel } from '@/service/core/ai/model';
import { formatModelPrice2Store } from '@/service/support/wallet/bill/utils';

type Props = ModuleDispatchProps<{
  [ModuleInputKeyEnum.aiModel]: string;
  [ModuleInputKeyEnum.aiSystemPrompt]?: string;
  [ModuleInputKeyEnum.history]?: ChatItemType[] | number;
  [ModuleInputKeyEnum.userChatInput]: string;
}>;
type Response = {
  [ModuleOutputKeyEnum.text]: string;
  [ModuleOutputKeyEnum.responseData]?: moduleDispatchResType;
};

export const dispatchCFR = async ({
  histories,
  inputs: { model, systemPrompt, history, userChatInput }
}: Props): Promise<Response> => {
  if (!userChatInput) {
    return Promise.reject('Question is empty');
  }

  // none
  // first chat and no system prompt
  if (systemPrompt === 'none' || (histories.length === 0 && !systemPrompt)) {
    return {
      [ModuleOutputKeyEnum.text]: userChatInput
    };
  }

  const extractModel = getExtractModel(model);
  const chatHistories = getHistories(history, histories);

  const systemFewShot = systemPrompt
    ? `Q: 对话背景。
A: ${systemPrompt}
`
    : '';
  const historyFewShot = chatHistories
    .map((item) => {
      const role = item.obj === 'Human' ? 'Q' : 'A';
      return `${role}: ${item.value}`;
    })
    .join('\n');

  const concatFewShot = `${systemFewShot}${historyFewShot}`.trim();

  const ai = getAIApi(undefined, 480000);

  const result = await ai.chat.completions.create({
    model: extractModel.model,
    temperature: 0,
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: replaceVariable(defaultPrompt, {
          query: `${userChatInput}`,
          histories: concatFewShot
        })
      }
    ],
    stream: false
  });

  let answer = result.choices?.[0]?.message?.content || '';
  // console.log(
  //   replaceVariable(defaultPrompt, {
  //     query: userChatInput,
  //     histories: concatFewShot
  //   })
  // );
  // console.log(answer);

  const inputTokens = result.usage?.prompt_tokens || 0;
  const outputTokens = result.usage?.completion_tokens || 0;

  const { total, modelName } = formatModelPrice2Store({
    model: extractModel.model,
    inputLen: inputTokens,
    outputLen: outputTokens,
    type: ModelTypeEnum.extract
  });

  return {
    [ModuleOutputKeyEnum.responseData]: {
      price: total,
      model: modelName,
      inputTokens,
      outputTokens,
      query: userChatInput,
      textOutput: answer
    },
    [ModuleOutputKeyEnum.text]: answer
  };
};

const defaultPrompt = `请不要回答任何问题。
你的任务是结合上下文，为当前问题，实现代词替换，确保问题描述的对象清晰明确。例如：
历史记录: 
"""
Q: 对话背景。
A: 关于 FatGPT 的介绍和使用等问题。
"""
当前问题: 怎么下载
输出: FastGPT 怎么下载？
----------------
历史记录: 
"""
Q: 报错 "no connection"
A: FastGPT 报错"no connection"可能是因为……
"""
当前问题: 怎么解决
输出: FastGPT 报错"no connection"如何解决？
----------------
历史记录: 
"""
Q: 作者是谁？
A: FastGPT 的作者是 labring。
"""
当前问题: 介绍下他
输出: 介绍下 FastGPT 的作者 labring。
----------------
历史记录: 
"""
Q: 作者是谁？
A: FastGPT 的作者是 labring。
"""
当前问题: 我想购买商业版。
输出: FastGPT 商业版如何购买？
----------------
历史记录:
"""
Q: 对话背景。
A: 关于 FatGPT 的介绍和使用等问题。
"""
当前问题: nh
输出: nh
----------------
历史记录:
"""
Q: FastGPT 如何收费？
A: FastGPT 收费可以参考……
"""
当前问题: 你知道 laf 么？
输出: 你知道 laf 么？
----------------
历史记录:
"""
Q: FastGPT 的优势
A: 1. 开源
   2. 简便
   3. 扩展性强
"""
当前问题: 介绍下第2点。
输出: 介绍下 FastGPT 简便的优势。
----------------
历史记录:
"""
Q: 什么是 FastGPT？
A: FastGPT 是一个 RAG 平台。
Q: 什么是 Sealos？
A: Sealos 是一个云操作系统。
"""
当前问题: 它们有什么关系？
输出: FastGPT 和 Sealos 有什么关系？
----------------
历史记录:
"""
{{histories}}
"""
当前问题: {{query}}
输出: `;
