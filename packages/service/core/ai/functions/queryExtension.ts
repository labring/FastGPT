import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { type ChatItemType } from '@fastgpt/global/core/chat/type';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { getLLMModel } from '../model';
import { addLog } from '../../../common/system/log';
import { filterGPTMessageByMaxContext } from '../llm/utils';
import json5 from 'json5';
import { createLLMResponse } from '../llm/request';
import { useTextCosine } from '../hooks/useTextCosine';

/*
  Query Extension - Semantic Search Enhancement
  This module can eliminate referential ambiguity and expand queries based on context to improve retrieval.
  Submodular Optimization Mode: Generate multiple candidate queries, then use submodular algorithm to select the optimal query combination
*/
const title = global.feConfigs?.systemTitle || 'Nginx';
const defaultPrompt = `## 你的任务
你作为一个向量检索助手，你的任务是结合历史记录，为"原问题"生成{{count}}个不同版本的"检索词"。这些检索词应该从不同角度探索主题，以提高向量检索的语义丰富度和精度。

## 要求
1. 每个检索词必须与原问题相关
2. 检索词应该探索不同方面（例如：原因、影响、解决方案、示例、对比等）
3. 避免检索词之间的冗余
4. 保持检索词简洁且可搜索
5. 生成的问题要求指向对象清晰明确，并与"原问题语言相同"

## 参考示例

历史记录: 
"""
null
"""
原问题: 介绍下剧情。
检索词: ["介绍下故事的背景。","故事的主题是什么？","介绍下故事的主要人物。","故事的转折点在哪里？","故事的结局如何？"]
----------------
历史记录: 
"""
user: 对话背景。
assistant: 当前对话是关于 Nginx 的介绍和使用等。
"""
原问题: 怎么下载
检索词: ["Nginx 如何下载？","下载 Nginx 需要什么条件？","有哪些渠道可以下载 Nginx？","Nginx 各版本的下载方式有什么区别？","如何选择合适的 Nginx 版本下载？"]
----------------
历史记录: 
"""
user: 对话背景。
assistant: 当前对话是关于 Nginx 的介绍和使用等。
user: 报错 "no connection"
assistant: 报错"no connection"可能是因为……
"""
原问题: 怎么解决
检索词: ["Nginx报错'no connection'如何解决？","造成'no connection'报错的原因。","Nginx提示'no connection'，要怎么办？","'no connection'错误的常见解决步骤。","如何预防 Nginx 'no connection' 错误？"]
----------------
历史记录: 
"""
user: How long is the maternity leave?
assistant: The number of days of maternity leave depends on the city in which the employee is located. Please provide your city so that I can answer your questions.
"""
原问题: ShenYang
检索词: ["How many days is maternity leave in Shenyang?","Shenyang's maternity leave policy.","The standard of maternity leave in Shenyang.","What benefits are included in Shenyang's maternity leave?","How to apply for maternity leave in Shenyang?"]
----------------
历史记录: 
"""
user: 作者是谁？
assistant: ${title} 的作者是 labring。
"""
原问题: Tell me about him
检索词: ["Introduce labring, the author of ${title}." ,"Background information on author labring.","Why does labring do ${title}?","What other projects has labring worked on?","How did labring start ${title}?"]
----------------
历史记录:
"""
user: 对话背景。
assistant: 关于 ${title} 的介绍和使用等问题。
"""
原问题: 你好。
检索词: ["你好"]
----------------
历史记录:
"""
user: ${title} 如何收费？
assistant: ${title} 收费可以参考……
"""
原问题: 你知道 laf 么？
检索词: ["laf 的官网地址是多少？","laf 的使用教程。","laf 有什么特点和优势。","laf 的主要功能是什么？","laf 与其他类似产品的对比。"]
----------------
历史记录:
"""
user: ${title} 的优势
assistant: 1. 开源
   2. 简便
   3. 扩展性强
"""
原问题: 介绍下第2点。
检索词: ["介绍下 ${title} 简便的优势", "从哪些方面，可以体现出 ${title} 的简便"]。
----------------
历史记录:
"""
user: 什么是 ${title}？
assistant: ${title} 是一个 RAG 平台。
user: 什么是 Laf？
assistant: Laf 是一个云函数开发平台。
"""
原问题: 它们有什么关系？
检索词: ["${title}和Laf有什么关系？","介绍下${title}","介绍下Laf"]

## 输出要求

1. 输出格式为 JSON 数组，数组中每个元素为字符串。无需对输出进行任何解释。
2. 输出语言与原问题相同。原问题为中文则输出中文；原问题为英文则输出英文。
3. 确保生成恰好 {{count}} 个检索词。

## 开始任务

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
  llmModel,
  embeddingModel,
  generateCount = 10 // 生成优化问题集的数量，默认为10个
}: {
  chatBg?: string;
  query: string;
  histories: ChatItemType[];
  llmModel: string;
  embeddingModel: string;
  generateCount?: number;
}): Promise<{
  rawQuery: string;
  extensionQueries: string[];
  llmModel: string;
  embeddingModel: string;
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
}> => {
  const systemFewShot = chatBg
    ? `user: 对话背景。
assistant: ${chatBg}
`
    : '';

  // 1. Request model
  const modelData = getLLMModel(llmModel);
  const filterHistories = await filterGPTMessageByMaxContext({
    messages: chats2GPTMessages({ messages: histories, reserveId: false }),
    maxContext: modelData.maxContext - 1000
  });

  const historyFewShot = filterHistories
    .map((item) => {
      const role = item.role;
      const content = item.content;
      if ((role === 'user' || role === 'assistant') && content) {
        if (typeof content === 'string') {
          return `${role}: ${content}`;
        } else {
          return `${role}: ${content.map((item) => (item.type === 'text' ? item.text : '')).join('\n')}`;
        }
      }
    })
    .filter(Boolean)
    .join('\n');
  const concatFewShot = `${systemFewShot}${historyFewShot}`.trim();

  const messages = [
    {
      role: 'user',
      content: replaceVariable(defaultPrompt, {
        query: `${query}`,
        histories: concatFewShot || 'null',
        count: generateCount.toString()
      })
    }
  ] as any;

  const {
    answerText: answer,
    usage: { inputTokens, outputTokens }
  } = await createLLMResponse({
    body: {
      stream: true,
      model: modelData.model,
      temperature: 0.1,
      messages
    }
  });

  if (!answer) {
    return {
      rawQuery: query,
      extensionQueries: [],
      llmModel: modelData.model,
      embeddingModel,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      embeddingTokens: 0
    };
  }

  // 2. Parse answer
  const start = answer.indexOf('[');
  const end = answer.lastIndexOf(']');
  if (start === -1 || end === -1) {
    addLog.warn('Query extension failed, not a valid JSON', {
      answer
    });
    return {
      rawQuery: query,
      extensionQueries: [],
      llmModel: modelData.model,
      embeddingModel,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      embeddingTokens: 0
    };
  }

  // Intercept the content of [] and retain []
  const jsonStr = answer
    .substring(start, end + 1)
    .replace(/(\\n|\\)/g, '')
    .replace(/  /g, '');

  try {
    let queries = json5.parse(jsonStr) as string[];

    if (!Array.isArray(queries) || queries.length === 0) {
      return {
        rawQuery: query,
        extensionQueries: [],
        llmModel: modelData.model,
        embeddingModel,
        inputTokens,
        outputTokens,
        embeddingTokens: 0
      };
    }

    // 3. 通过计算获取到最优的检索词
    const { lazyGreedyQuerySelection, embeddingModel: useEmbeddingModel } = useTextCosine({
      embeddingModel
    });
    queries = queries.map((item) => String(item));

    const { selectedData: selectedQueries, embeddingTokens } = await lazyGreedyQuerySelection({
      originalText: query,
      candidates: queries,
      k: Math.min(3, queries.length), // 至多 3 个
      alpha: 0.3
    });

    return {
      rawQuery: query,
      extensionQueries: selectedQueries,
      llmModel: modelData.model,
      embeddingModel: useEmbeddingModel,
      inputTokens,
      outputTokens,
      embeddingTokens
    };
  } catch (error) {
    addLog.warn('Query extension failed', {
      error,
      answer
    });
    return {
      rawQuery: query,
      extensionQueries: [],
      llmModel: modelData.model,
      embeddingModel,
      inputTokens,
      outputTokens,
      embeddingTokens: 0
    };
  }
};
