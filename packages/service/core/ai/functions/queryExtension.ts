import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { createChatCompletion } from '../config';
import { type ChatItemType } from '@fastgpt/global/core/chat/type';
import { countGptMessagesTokens, countPromptTokens } from '../../../common/string/tiktoken/index';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { getLLMModel } from '../model';
import { llmCompletionsBodyFormat, formatLLMResponse } from '../utils';
import { addLog } from '../../../common/system/log';
import { filterGPTMessageByMaxContext } from '../../chat/utils';
import json5 from 'json5';
import { searchSynonymMappings } from '../../dataset/synonym/controller';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { loadRequestMessages } from '../../chat/utils';
import { applySynonymTransform } from '../../dataset/indexTransform/utils';

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
  synonymRewriteResult?: {
    standardizedQuery: string; // 指代消除后标准化的查询（用于检索）
    coreferenceResolved: string; // 指代消除后的查询（同义词标准化前）
  };
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

  const { response } = await createChatCompletion({
    body: llmCompletionsBodyFormat(
      {
        stream: true,
        model: modelData.model,
        temperature: 0.1,
        messages
      },
      modelData
    )
  });
  const { text: answer, usage } = await formatLLMResponse(response);
  const inputTokens = usage?.prompt_tokens || (await countGptMessagesTokens(messages));
  const outputTokens = usage?.completion_tokens || (await countPromptTokens(answer));

  if (!answer) {
    return {
      rawQuery: query,
      extensionQueries: [],
      model,
      inputTokens: inputTokens,
      outputTokens: outputTokens
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
      inputTokens: inputTokens,
      outputTokens: outputTokens
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
      inputTokens,
      outputTokens,
      synonymRewriteResult: undefined
    };
  } catch (error) {
    addLog.debug('Query extension failed, not a valid JSON', {
      answer
    });
    return {
      rawQuery: query,
      extensionQueries: [],
      model,
      inputTokens,
      outputTokens,
      synonymRewriteResult: undefined
    };
  }
};

/*
   queryExtensionForAssistant - 智能客服专用的问题优化
   针对 assistant 类型应用，执行：指代消解、同义词标准化、问题改写
*/

// 合并后的提示词：同时完成指代消除和问题改写
const MergedQueryOptimizationPrompt = `- Role: 问题优化专家
- Background: 用户问题可能存在指代不明确或需要多角度理解的情况，你需要帮助优化问题以提升检索效果。
- Skills:
  1. 擅长识别并替换指代词(他/她/它/这/那等)、补充省略条件(时间/地点/前提等)
  2. 能从不同角度拆解和改写问题，提高检索覆盖率

- Task: 你需要完成两个任务
  1. 指代消除：根据上下文将问题中的代词和指示词替换为具体对象，使问题完整明确
  2. 问题改写：基于消除指代后的问题，从不同角度生成2-3个改写问题，帮助提升检索效果

- Constraints:
  1. 只有在存在可识别的代词或指示词时，才进行替换
  2. 只有在缺失必要条件时，才进行补充
  3. 无法确定指代时保留原问题
  4. 改写的问题要保持原意，只改变表达角度
  5. 如果问题中出现多个产品或主体，可以为每个主体生成独立的子问题

- OutputFormat: 必须返回严格的JSON格式，包含两个字段:
  {
    "resolvedQuery": "指代消除后的完整问题",
    "rewriteQueries": ["改写问题1", "改写问题2", "改写问题3"]
  }

- Workflow:
  1. 分析上下文，识别问题中的代词/指示词
  2. 将代词替换为具体指代对象，补充缺失条件，得到resolvedQuery
  3. 基于resolvedQuery，从不同角度生成2-3个改写问题
  4. 以JSON格式输出结果

- Examples:
例1：
<Context>流畅的Python很有趣。</Context>
问题：这本书的作者是谁？
{"resolvedQuery":"流畅的Python这本书的作者是谁？","rewriteQueries":["流畅的Python的作者是谁？","谁写了流畅的Python这本书？","流畅的Python的创作者是谁？"]}

例2：
<Context>用户昨天购买了《百年孤独》</Context>
问题：他什么时候买的？
{"resolvedQuery":"用户什么时候购买的《百年孤独》？","rewriteQueries":["用户购买《百年孤独》的时间是什么时候？","《百年孤独》是何时被用户购买的？"]}

例3：
<Context>给我安排一个旅行计划，我要去河西走廊附近，时间8天。</Context>
问题：超融合是什么？
{"resolvedQuery":"超融合是什么？","rewriteQueries":["超融合的定义是什么？","什么是超融合技术？","超融合的概念是什么？"]}

例4：
<Context>用户询问Nginx的配置</Context>
问题：怎么配置SSL和负载均衡？
{"resolvedQuery":"怎么配置Nginx的SSL和负载均衡？","rewriteQueries":["如何在Nginx中配置SSL？","Nginx负载均衡如何配置？","Nginx的SSL和负载均衡配置方法是什么？"]}`;

// 合并后的辅助函数：同时完成指代消除和问题改写
async function mergedQueryOptimization({
  histories,
  query,
  model
}: {
  histories: ChatItemType[];
  query: string;
  model: string;
}): Promise<{
  resolvedQuery: string;
  rewriteQueries: string[];
  inputTokens: number;
  outputTokens: number;
}> {
  try {
    // 获取最后3轮对话作为上下文
    const messages = chats2GPTMessages({ messages: histories.slice(-6), reserveId: false });
    const historyText = messages
      .map((msg) => `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`)
      .join('\n');

    const optimizationMessages: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: `${MergedQueryOptimizationPrompt}\n\n-----\n<Context>\n${historyText}\n</Context>\n\n问题: ${query}`
      }
    ];

    const requestMessages = await loadRequestMessages({
      messages: optimizationMessages,
      useVision: false
    });

    const { response } = await createChatCompletion({
      body: llmCompletionsBodyFormat(
        {
          model,
          temperature: 0.1,
          max_tokens: 500,
          messages: requestMessages,
          stream: true
        },
        model
      )
    });

    const { text: answer, usage } = await formatLLMResponse(response);

    const inputTokens = usage?.prompt_tokens || (await countGptMessagesTokens(requestMessages));
    const outputTokens = usage?.completion_tokens || (await countPromptTokens(answer));

    // 尝试解析JSON
    try {
      const parsed = json5.parse(answer);
      if (parsed.resolvedQuery && parsed.rewriteQueries && Array.isArray(parsed.rewriteQueries)) {
        // 限制改写问题数量为2-3个
        const limitedRewriteQueries = parsed.rewriteQueries.slice(0, 3);
        return {
          resolvedQuery: parsed.resolvedQuery,
          rewriteQueries: limitedRewriteQueries,
          inputTokens,
          outputTokens
        };
      }
    } catch (e) {
      // 如果JSON解析失败,尝试手动提取
      const start = answer.indexOf('{');
      const end = answer.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        const jsonStr = answer.substring(start, end + 1);
        try {
          const parsed = json5.parse(jsonStr);
          if (
            parsed.resolvedQuery &&
            parsed.rewriteQueries &&
            Array.isArray(parsed.rewriteQueries)
          ) {
            const limitedRewriteQueries = parsed.rewriteQueries.slice(0, 3);
            return {
              resolvedQuery: parsed.resolvedQuery,
              rewriteQueries: limitedRewriteQueries,
              inputTokens,
              outputTokens
            };
          }
        } catch (innerE) {
          addLog.debug('Failed to parse extracted JSON', { jsonStr, error: innerE });
        }
      }
    }

    // 解析失败时返回原始query和空数组
    return {
      resolvedQuery: query,
      rewriteQueries: [],
      inputTokens,
      outputTokens
    };
  } catch (error) {
    addLog.debug('Merged query optimization error', { error });
    return {
      resolvedQuery: query,
      rewriteQueries: [],
      inputTokens: 0,
      outputTokens: 0
    };
  }
}

// 辅助函数：从多个知识库检索标准词映射并汇总
async function getSynonymMappings({
  teamId,
  datasetIds,
  query
}: {
  teamId: string;
  datasetIds: string[];
  query: string;
}): Promise<{
  synonymDict: Record<string, string[]>;
  synonymFileIds: string[];
}> {
  try {
    // 对每个知识库进行全文检索，获取 top10 同义词映射
    const allMappingsPromises = datasetIds.map((datasetId) =>
      searchSynonymMappings({
        teamId,
        datasetId,
        query,
        limit: 10
      }).catch((error) => {
        addLog.debug('Get synonym mappings error for dataset', { datasetId, error });
        return [];
      })
    );

    const allMappingsResults = await Promise.all(allMappingsPromises);

    // 汇总所有知识库的同义词映射
    const synonymDict: Record<string, string[]> = {};
    const synonymFileIdSet = new Set<string>();

    for (const mappings of allMappingsResults) {
      for (const mapping of mappings) {
        const { standardizedTerm, synonymTerms, synonymFileId } = mapping;
        if (!synonymDict[standardizedTerm]) {
          synonymDict[standardizedTerm] = [];
        }
        // 合并同义词，去重
        const existingSet = new Set(synonymDict[standardizedTerm]);
        for (const synonym of synonymTerms) {
          existingSet.add(synonym);
        }
        synonymDict[standardizedTerm] = Array.from(existingSet);

        // 收集文件ID
        if (synonymFileId) {
          synonymFileIdSet.add(String(synonymFileId));
        }
      }
    }

    return {
      synonymDict,
      synonymFileIds: Array.from(synonymFileIdSet)
    };
  } catch (error) {
    addLog.debug('Get synonym mappings error', { error });
    return {
      synonymDict: {},
      synonymFileIds: []
    };
  }
}

// 辅助函数：标准化(同义词替换)
// 复用 applySynonymTransform 算法，确保 query 和 chunk 使用相同的替换策略
function standardizeQuery(query: string, synonyms: Record<string, string[]>): string {
  // 构建空的 synonymMappingMap，因为 query 替换不需要记录 mappingId
  const synonymMappingMap: Record<string, string> = {};
  for (const aliasList of Object.values(synonyms)) {
    for (const alias of aliasList) {
      synonymMappingMap[alias] = ''; // query 替换不需要 mappingId
    }
  }

  // 使用与 chunk 相同的智能替换算法
  const { transformedText } = applySynonymTransform(query, synonyms, synonymMappingMap);
  return transformedText;
}

// 主函数：智能客服专用的查询扩展
export const queryExtensionForAssistant = async ({
  query,
  histories = [],
  model,
  teamId,
  datasetIds
}: {
  query: string;
  histories: ChatItemType[];
  model: string;
  teamId: string;
  datasetIds: string[];
}): Promise<{
  rawQuery: string;
  extensionQueries: string[];
  model: string;
  inputTokens: number;
  outputTokens: number;
  synonymRewriteResult?: {
    standardizedQuery: string; // 指代消除后标准化的查询（用于检索）
    coreferenceResolved: string; // 指代消除后的查询（同义词标准化前）
  };
}> => {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  try {
    // 步骤1: 同时完成指代消除和问题改写
    const optimizationResult = await mergedQueryOptimization({
      histories,
      query,
      model
    });
    totalInputTokens += optimizationResult.inputTokens;
    totalOutputTokens += optimizationResult.outputTokens;

    addLog.info('Merged query optimization completed', {
      original: query,
      resolvedQuery: optimizationResult.resolvedQuery,
      rewriteQueries: optimizationResult.rewriteQueries
    });

    // 步骤2: 从所有知识库检索标准词 (使用指代消除后的query进行全文检索，每个知识库top10，然后汇总)
    const { synonymDict, synonymFileIds } = await getSynonymMappings({
      teamId,
      datasetIds,
      query: optimizationResult.resolvedQuery
    });

    addLog.info('Retrieved synonym mappings from all datasets', {
      query: optimizationResult.resolvedQuery,
      datasetCount: datasetIds.length,
      synonymCount: Object.keys(synonymDict).length,
      totalSynonymTerms: Object.values(synonymDict).reduce((sum, terms) => sum + terms.length, 0),
      synonymFileIds
    });

    // 步骤3: 对指代消除后的查询和改写问题都进行同义词标准化
    const resolvedStandardized = standardizeQuery(optimizationResult.resolvedQuery, synonymDict);
    const standardizedRewriteQueries = optimizationResult.rewriteQueries.map((rq) =>
      standardizeQuery(rq, synonymDict)
    );

    // 步骤4: 组合结果并去重
    // 返回: [原始Query, 指代消除+标准化, 改写问题1标准化, 改写问题2标准化, ...]
    const allQueries = [
      query, // 原始query
      resolvedStandardized, // 指代消除+标准化
      ...standardizedRewriteQueries // 改写问题标准化
    ].filter((q) => q && q.trim().length > 0);

    // 去重：使用 Set 根据标准化后的字符串进行去重
    const seenQueries = new Set<string>();
    const extensionQueries = allQueries.filter((q) => {
      const normalized = q.trim().toLowerCase().replace(/\s+/g, ' ');
      if (seenQueries.has(normalized)) {
        return false;
      }
      seenQueries.add(normalized);
      return true;
    });

    addLog.info('Query extension for assistant completed', {
      originalQuery: query,
      extensionQueries,
      totalInputTokens,
      totalOutputTokens
    });

    // 构建 synonymRewriteResult（记录指代消除后标准化的query）
    const synonymRewriteResult = {
      standardizedQuery: resolvedStandardized,
      coreferenceResolved: optimizationResult.resolvedQuery
    };

    return {
      rawQuery: query,
      extensionQueries,
      model,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      synonymRewriteResult
    };
  } catch (error) {
    addLog.error('Query extension for assistant failed', { error });
    return {
      rawQuery: query,
      extensionQueries: [query],
      model,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens
    };
  }
};
