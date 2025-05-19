import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { createChatCompletion } from '../config';
import { ChatItemType } from '@fastgpt/global/core/chat/type';
import { countGptMessagesTokens, countPromptTokens } from '../../../common/string/tiktoken/index';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { getLLMModel } from '../model';
import { llmCompletionsBodyFormat } from '../utils';
import { addLog } from '../../../common/system/log';
import { filterGPTMessageByMaxContext } from '../../chat/utils';
import json5 from 'json5';

/* 
    query extension - 问题扩展
    可以根据上下文，消除指代性问题以及扩展问题，利于检索。
*/

const title = global.feConfigs?.systemTitle || 'FastAI';
const defaultPrompt = `## 你的任务
你作为一个向量检索助手，你的任务是结合历史记录，从不同角度，为“原问题”生成个不同版本的“检索词”，从而提高向量检索的语义丰富度，提高向量检索的精度。
生成的问题要求指向对象清晰明确，并与“原问题语言相同”。

## 参考示例

历史记录: 
"""
null
"""
原问题: 介绍下剧情。
检索词: ["介绍下故事的背景。","故事的主题是什么？","介绍下故事的主要人物。"]
----------------
历史记录: 
"""
user: 对话背景。
assistant: 当前对话是关于 Nginx 的介绍和使用等。
"""
原问题: 怎么下载
检索词: ["Nginx 如何下载？","下载 Nginx 需要什么条件？","有哪些渠道可以下载 Nginx？"]
----------------
历史记录: 
"""
user: 对话背景。
assistant: 当前对话是关于 Nginx 的介绍和使用等。
user: 报错 "no connection"
assistant: 报错"no connection"可能是因为……
"""
原问题: 怎么解决
检索词: ["Nginx报错"no connection"如何解决？","造成'no connection'报错的原因。","Nginx提示'no connection'，要怎么办？"]
----------------
历史记录: 
"""
user: How long is the maternity leave?
assistant: The number of days of maternity leave depends on the city in which the employee is located. Please provide your city so that I can answer your questions.
"""
原问题: ShenYang
检索词: ["How many days is maternity leave in Shenyang?","Shenyang's maternity leave policy.","The standard of maternity leave in Shenyang."]
----------------
历史记录: 
"""
user: 作者是谁？
assistant: ${title} 的作者是 labring。
"""
原问题: Tell me about him
检索词: ["Introduce labring, the author of ${title}." ," Background information on author labring." "," Why does labring do ${title}?"]
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
检索词: ["laf 的官网地址是多少？","laf 的使用教程。","laf 有什么特点和优势。"]
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
    ? `user: 对话背景。
assistant: ${chatBg}
`
    : '';

  const modelData = getLLMModel(model);
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
        histories: concatFewShot || 'null'
      })
    }
  ] as any;

  const { response: result } = await createChatCompletion({
    body: llmCompletionsBodyFormat(
      {
        stream: false,
        model: modelData.model,
        temperature: 0.1,
        messages
      },
      modelData
    )
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

  const start = answer.indexOf('[');
  const end = answer.lastIndexOf(']');
  if (start === -1 || end === -1) {
    addLog.warn('Query extension failed, not a valid JSON', {
      answer
    });
    return {
      rawQuery: query,
      extensionQueries: [],
      model,
      inputTokens: 0,
      outputTokens: 0
    };
  }

  // Intercept the content of [] and retain []
  const jsonStr = answer
    .substring(start, end + 1)
    .replace(/(\\n|\\)/g, '')
    .replace(/  /g, '');

  try {
    const queries = json5.parse(jsonStr) as string[];

    return {
      rawQuery: query,
      extensionQueries: (Array.isArray(queries) ? queries : []).slice(0, 5),
      model,
      inputTokens: await countGptMessagesTokens(messages),
      outputTokens: await countPromptTokens(answer)
    };
  } catch (error) {
    addLog.warn('Query extension failed, not a valid JSON', {
      answer
    });
    return {
      rawQuery: query,
      extensionQueries: [],
      model,
      inputTokens: 0,
      outputTokens: 0
    };
  }
};
