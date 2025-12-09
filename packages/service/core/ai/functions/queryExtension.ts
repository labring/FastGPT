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

// 指代消除提示词 - 来自 coreference_resolution_prompt.yaml
const CoreferenceResolutionPrompt = `- Role: 指代消解专家
- Background: 用户问题可能存在语法或逻辑不完整,需根据上下文补充缺失代词/条件,确保问题完整性。
- Skills: 擅长识别并替换指代词(他/她/它/这/那等)、补充省略条件(时间/地点/前提等)。
- Constraints:
  1. 输出内容必须严格为"===新问题"格式,不附加任何额外字符、说明或格式。
  2. 只有在存在可识别的代词或指示词时,才进行替换。
  3. 只有在缺失必要条件时,才进行补充。
  4. 无法确定指代时保留原问题
- OutputFormat: 仅返回新问题,不要增加任何字符。
- Workflow:
  1. 识别问题中的所有代词/指示词并替换为具体指代对象
  2. 检查逻辑完整性,补充缺失的时间/地点/前提等条件
  3. 确保新问题语法正确且不改变原意
- Examples:
例1：
<Context>流畅的Python很有趣。</Context>
问题：这本书的作者是谁？
===流畅的Python这本书的作者是谁？

例2：
<Context>用户昨天购买了《百年孤独》</Context>
问题：他什么时候买的？
===用户什么时候购买的《百年孤独》？

例3：
<Context>给我安排一个旅行计划，我要去河西走廊附近，时间8天。</Context>
问题：超融合是什么？
===超融合是什么？`;

// 问题改写提示词 - 来自 query_transform_disassemble.yaml
const QueryRewritePrompt = `你需要根据 为了解答 用户问题推理出子问题，如果问题中出现多个产品，请每个产品独立一个子问题，
请直接输出1到2个子问题，要求输出结构化json对象，字段名为subQuestions，
这是例子 {"subQuestions":["子问题1","子问题2"]}，不要直接回答用户问题，不用输出问候语等礼貌用语，
返回和问题相同的语言，让我们一步步来思考和推理，但不用输出推理过程，只需输出最终的搜索问题。`;

// 辅助函数：指代消除
async function coreferenceResolution({
  histories,
  query,
  model
}: {
  histories: ChatItemType[];
  query: string;
  model: string;
}): Promise<{
  resolvedQuery: string;
  inputTokens: number;
  outputTokens: number;
}> {
  try {
    // 获取最后3轮对话作为上下文
    const messages = chats2GPTMessages({ messages: histories.slice(-6), reserveId: false });
    const historyText = messages
      .map((msg) => `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`)
      .join('\n');

    const crMessages: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: `${CoreferenceResolutionPrompt}\n\n-----\n<Context>\n${historyText}\n</Context>\n\n问题: ${query}`
      }
    ];

    const requestMessages = await loadRequestMessages({
      messages: crMessages,
      useVision: false
    });

    const { response } = await createChatCompletion({
      body: llmCompletionsBodyFormat(
        {
          model,
          temperature: 0.1,
          max_tokens: 300,
          messages: requestMessages,
          stream: true
        },
        model
      )
    });

    const { text: answer, usage } = await formatLLMResponse(response);

    const inputTokens = usage?.prompt_tokens || (await countGptMessagesTokens(requestMessages));
    const outputTokens = usage?.completion_tokens || (await countPromptTokens(answer));

    // 提取 === 后的内容
    const marker = '===';
    const markerIndex = answer.indexOf(marker);
    if (markerIndex !== -1) {
      return {
        resolvedQuery: answer.substring(markerIndex + marker.length).trim(),
        inputTokens,
        outputTokens
      };
    }

    return {
      resolvedQuery: query,
      inputTokens,
      outputTokens
    }; // 如果没有找到标记,返回原始query
  } catch (error) {
    addLog.debug('Coreference resolution error', { error });
    return {
      resolvedQuery: query,
      inputTokens: 0,
      outputTokens: 0
    }; // 出错时返回原始query
  }
}

// 辅助函数：问题改写(拆解子问题)
async function queryRewrite({ query, model }: { query: string; model: string }): Promise<{
  subQuestions: string[];
  inputTokens: number;
  outputTokens: number;
}> {
  try {
    const rewriteMessages: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: `${QueryRewritePrompt}\n\n用户问题: ${query}`
      }
    ];

    const requestMessages = await loadRequestMessages({
      messages: rewriteMessages,
      useVision: false
    });

    const { response } = await createChatCompletion({
      body: llmCompletionsBodyFormat(
        {
          model,
          temperature: 0.1,
          max_tokens: 300,
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
      if (parsed.subQuestions && Array.isArray(parsed.subQuestions)) {
        return {
          subQuestions: parsed.subQuestions,
          inputTokens,
          outputTokens
        };
      }
    } catch (e) {
      // 如果JSON解析失败,尝试提取数组
      const start = answer.indexOf('[');
      const end = answer.lastIndexOf(']');
      if (start !== -1 && end !== -1) {
        const jsonStr = answer.substring(start, end + 1);
        const parsed = json5.parse(jsonStr);
        if (Array.isArray(parsed)) {
          return {
            subQuestions: parsed,
            inputTokens,
            outputTokens
          };
        }
      }
    }

    return {
      subQuestions: [],
      inputTokens,
      outputTokens
    }; // 解析失败返回空数组
  } catch (error) {
    addLog.debug('Query rewrite error', { error });
    return {
      subQuestions: [],
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
    // 步骤1: 指代消除
    const crResult = await coreferenceResolution({
      histories,
      query,
      model
    });
    totalInputTokens += crResult.inputTokens;
    totalOutputTokens += crResult.outputTokens;

    addLog.info('Coreference resolution completed', {
      original: query,
      resolved: crResult.resolvedQuery
    });

    // 步骤2: 从所有知识库检索标准词 (使用指代消除后的query进行全文检索，每个知识库top10，然后汇总)
    const { synonymDict, synonymFileIds } = await getSynonymMappings({
      teamId,
      datasetIds,
      query: crResult.resolvedQuery
    });

    addLog.info('Retrieved synonym mappings from all datasets', {
      query: crResult.resolvedQuery,
      datasetCount: datasetIds.length,
      synonymCount: Object.keys(synonymDict).length,
      totalSynonymTerms: Object.values(synonymDict).reduce((sum, terms) => sum + terms.length, 0),
      synonymFileIds
    });

    // 步骤3: 指代消除后进行标准化
    const resolvedStandardized = standardizeQuery(crResult.resolvedQuery, synonymDict);

    // 步骤4: 问题改写(拆解子问题)
    const rewriteResult = await queryRewrite({
      query: crResult.resolvedQuery,
      model
    });
    totalInputTokens += rewriteResult.inputTokens;
    totalOutputTokens += rewriteResult.outputTokens;

    addLog.info('Query rewrite completed', {
      subQuestions: rewriteResult.subQuestions
    });

    // 步骤5: 子问题标准化
    const standardizedSubQuestions = rewriteResult.subQuestions.map((sq) =>
      standardizeQuery(sq, synonymDict)
    );

    // 步骤6: 组合结果并去重
    // 返回: [原始Query, 指代消除+标准化, 子问题1标准化, 子问题2标准化, ...]
    const allQueries = [
      query, // 原始query
      resolvedStandardized, // 指代消除+标准化
      ...standardizedSubQuestions // 子问题标准化
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
    // 无论是否有同义词映射，都保存指代消除的结果，因为它本身就很有价值
    const synonymRewriteResult = {
      standardizedQuery: resolvedStandardized,
      coreferenceResolved: crResult.resolvedQuery
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
