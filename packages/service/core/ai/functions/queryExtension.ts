import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { getAIApi } from '../config';
import { ChatItemType } from '@fastgpt/global/core/chat/type';

/* 
    query extension - 问题扩展
    可以根据上下文，消除指代性问题以及扩展问题，利于检索。
*/

const defaultPrompt = `作为一个向量检索助手，你的任务是结合历史记录，从不同角度，为“原问题”生成个不同版本的“检索词”，从而提高向量检索的语义丰富度，提高向量检索的精度。生成的问题要求指向对象清晰明确。例如：
历史记录: 
"""
"""
原问题: 介绍下剧情。
检索词: ["发生了什么故事？","故事梗概是什么？","讲述了什么故事？"]
----------------
历史记录: 
"""
Q: 对话背景。
A: 当前对话是关于 FatGPT 的介绍和使用等。
"""
原问题: 怎么下载
检索词: ["FastGPT 怎么下载？","下载 FastGPT 需要什么条件？","有哪些渠道可以下载 FastGPT？"]
----------------
历史记录: 
"""
Q: 对话背景。
A: 当前对话是关于 FatGPT 的介绍和使用等。
Q: 报错 "no connection"
A: 报错"no connection"可能是因为……
"""
原问题: 怎么解决
检索词: ["FastGPT 报错"no connection"如何解决？", "报错 'no connection' 是什么原因？", "FastGPT提示'no connection'，要怎么办？"]
----------------
历史记录: 
"""
Q: 作者是谁？
A: FastGPT 的作者是 labring。
"""
原问题: 介绍下他
检索词: ["介绍下 FastGPT 的作者 labring。","作者 labring 的背景信息。","labring 为什么要做 FastGPT?"]
----------------
历史记录: 
"""
Q: 对话背景。
A: 当前对话是关于 FatGPT 的介绍和使用等。
"""
原问题: 高级编排怎么用
检索词: ["FastGPT的高级编排是什么？","FastGPT高级编排的使用教程。","FastGPT高级编排有什么用？"]
----------------
历史记录:
"""
Q: 对话背景。
A: 关于 FatGPT 的介绍和使用等问题。
"""
原问题: 你好。
检索词: ["你好"]
----------------
历史记录:
"""
Q: FastGPT 如何收费？
A: FastGPT 收费可以参考……
"""
原问题: 你知道 laf 么？
检索词: ["laf是什么？","如何使用laf？","laf的介绍。"]
----------------
历史记录:
"""
Q: FastGPT 的优势
A: 1. 开源
   2. 简便
   3. 扩展性强
"""
原问题: 介绍下第2点。
检索词: ["介绍下 FastGPT 简便的优势", "FastGPT 为什么使用起来简便？","FastGPT的有哪些简便的功能？"]。
----------------
历史记录:
"""
Q: 什么是 FastGPT？
A: FastGPT 是一个 RAG 平台。
Q: 什么是 Laf？
A: Laf 是一个云函数开发平台。
"""
原问题: 它们有什么关系？
检索词: ["FastGPT和Laf有什么关系？","FastGPT的RAG是用Laf实现的么？"]
----------------
历史记录:
"""
{{histories}}
"""
原问题: {{query}}
检索词: `;

export const queryExtension = async ({
  chatBg,
  query,
  histories = [],
  model
}: {
  chatBg?: string;
  query: string;
  histories: ChatItemType[];
  model: string;
}): Promise<{
  rawQuery: string;
  extensionQueries: string[];
  model: string;
  inputTokens: number;
  outputTokens: number;
}> => {
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

  let answer = result.choices?.[0]?.message?.content || '';
  if (!answer) {
    return {
      rawQuery: query,
      extensionQueries: [],
      model,
      inputTokens: 0,
      outputTokens: 0
    };
  }

  answer = answer.replace(/\\"/g, '"');

  try {
    const queries = JSON.parse(answer) as string[];

    return {
      rawQuery: query,
      extensionQueries: queries,
      model,
      inputTokens: result.usage?.prompt_tokens || 0,
      outputTokens: result.usage?.completion_tokens || 0
    };
  } catch (error) {
    console.log(error);
    return {
      rawQuery: query,
      extensionQueries: [],
      model,
      inputTokens: 0,
      outputTokens: 0
    };
  }
};
