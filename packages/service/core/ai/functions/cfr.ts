import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { getAIApi } from '../config';
import { ChatItemType } from '@fastgpt/global/core/chat/type';

/* 
    cfr:  coreference resolution - 指代消除
    可以根据上下文，完事当前问题指代内容，利于检索。
*/

const defaultPrompt = `请不要回答任何问题。
你的任务是结合历史记录，为当前问题，实现代词替换，确保问题描述的对象清晰明确。例如：
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

export const queryCfr = async ({
  chatBg,
  query,
  histories = [],
  model
}: {
  chatBg?: string;
  query: string;
  histories: ChatItemType[];
  model: string;
}) => {
  if (histories.length === 0 && !chatBg) {
    return {
      rawQuery: query,
      cfrQuery: query,
      model,
      inputTokens: 0,
      outputTokens: 0
    };
  }

  const systemFewShot = chatBg
    ? `Q: 对话背景。
A: ${chatBg}
`
    : '';
  const historyFewShot = histories
    .map((item) => {
      const role = item.obj === 'Human' ? 'Q' : 'A';
      return `${role}: ${item.value}`;
    })
    .join('\n');
  const concatFewShot = `${systemFewShot}${historyFewShot}`.trim();

  const ai = getAIApi({
    timeout: 480000
  });

  const result = await ai.chat.completions.create({
    model: model,
    temperature: 0.01,
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: replaceVariable(defaultPrompt, {
          query: `${query}`,
          histories: concatFewShot
        })
      }
    ],
    stream: false
  });

  const answer = result.choices?.[0]?.message?.content || '';
  if (!answer) {
    return {
      rawQuery: query,
      cfrQuery: query,
      model,
      inputTokens: 0,
      outputTokens: 0
    };
  }

  return {
    rawQuery: query,
    cfrQuery: answer,
    model,
    inputTokens: result.usage?.prompt_tokens || 0,
    outputTokens: result.usage?.completion_tokens || 0
  };
};
