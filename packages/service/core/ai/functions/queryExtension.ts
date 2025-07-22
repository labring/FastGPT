import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { createChatCompletion } from '../config';
import { type ChatItemType } from '@fastgpt/global/core/chat/type';
import { countGptMessagesTokens, countPromptTokens } from '../../../common/string/tiktoken/index';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { getLLMModel, getEmbeddingModel } from '../model';
import { getVectorsByText } from '../../ai/embedding';
import { llmCompletionsBodyFormat, formatLLMResponse } from '../utils';
import { addLog } from '../../../common/system/log';
import { filterGPTMessageByMaxContext } from '../../chat/utils';
import json5 from 'json5';

/* 
    Query Extension - Semantic Search Enhancement
    
    This module can eliminate referential ambiguity and expand queries based on context to improve retrieval.
    
    Submodular Optimization Mode: Generate multiple candidate queries, then use submodular algorithm to select the optimal query combination
*/

// Priority Queue implementation for submodular optimization
class PriorityQueue<T> {
  private heap: Array<{ item: T; priority: number }> = [];

  enqueue(item: T, priority: number): void {
    this.heap.push({ item, priority });
    this.heap.sort((a, b) => b.priority - a.priority);
  }

  dequeue(): T | undefined {
    return this.heap.shift()?.item;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  size(): number {
    return this.heap.length;
  }
}

// Calculate cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Calculate marginal gain
function computeMarginalGain(
  candidateEmbedding: number[],
  selectedEmbeddings: number[][],
  originalEmbedding: number[],
  alpha: number = 0.3
): number {
  if (selectedEmbeddings.length === 0) {
    return alpha * cosineSimilarity(originalEmbedding, candidateEmbedding);
  }

  let maxSimilarity = 0;
  for (const selectedEmbedding of selectedEmbeddings) {
    const similarity = cosineSimilarity(candidateEmbedding, selectedEmbedding);
    maxSimilarity = Math.max(maxSimilarity, similarity);
  }

  const relevance = alpha * cosineSimilarity(originalEmbedding, candidateEmbedding);
  const diversity = 1 - maxSimilarity;

  return relevance + diversity;
}

// Lazy greedy query selection algorithm
function lazyGreedyQuerySelection(
  candidates: string[],
  embeddings: number[][],
  originalEmbedding: number[],
  k: number,
  alpha: number = 0.3
): string[] {
  const n = candidates.length;
  const selected: string[] = [];
  const selectedEmbeddings: number[][] = [];

  // Initialize priority queue
  const pq = new PriorityQueue<{ index: number; gain: number }>();

  // Calculate initial marginal gain for all candidates
  for (let i = 0; i < n; i++) {
    const gain = computeMarginalGain(embeddings[i], selectedEmbeddings, originalEmbedding, alpha);
    pq.enqueue({ index: i, gain }, gain);
  }

  // Greedy selection
  for (let iteration = 0; iteration < k; iteration++) {
    if (pq.isEmpty()) break;

    let bestCandidate: { index: number; gain: number } | undefined;

    // Find candidate with maximum marginal gain
    while (!pq.isEmpty()) {
      const candidate = pq.dequeue()!;
      const currentGain = computeMarginalGain(
        embeddings[candidate.index],
        selectedEmbeddings,
        originalEmbedding,
        alpha
      );

      if (currentGain >= candidate.gain) {
        bestCandidate = { index: candidate.index, gain: currentGain };
        break;
      } else {
        pq.enqueue(candidate, currentGain);
      }
    }

    if (bestCandidate) {
      selected.push(candidates[bestCandidate.index]);
      selectedEmbeddings.push(embeddings[bestCandidate.index]);
    }
  }

  return selected;
}

// Generate embeddings for input texts
async function generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
  try {
    const vectorModel = getEmbeddingModel(model);
    const embeddings: number[][] = [];

    for (const text of texts) {
      // Use vector model's createEmbedding method
      const embedding = await getVectorsByText({
        model: vectorModel,
        input: text,
        type: 'query'
      });
      embeddings.push(embedding.vectors[0]);
    }

    return embeddings;
  } catch (error) {
    addLog.warn('Failed to generate embeddings', { error, model });
    throw error;
  }
}

const title = global.feConfigs?.systemTitle || 'FastAI';
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
  model,
  generateCount = 10 // 添加生成数量参数，默认为10个
}: {
  chatBg?: string;
  query: string;
  histories: ChatItemType[];
  model: string;
  generateCount?: number;
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
        histories: concatFewShot || 'null',
        count: generateCount.toString()
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

    if (!Array.isArray(queries) || queries.length === 0) {
      return {
        rawQuery: query,
        extensionQueries: [],
        model,
        inputTokens,
        outputTokens
      };
    }

    // Generate embeddings for original query and candidate queries
    const allQueries = [query, ...queries];
    const embeddings = await generateEmbeddings(allQueries, model);
    const originalEmbedding = embeddings[0];
    const candidateEmbeddings = embeddings.slice(1);
    // Select optimal queries using lazy greedy algorithm
    const selectedQueries = lazyGreedyQuerySelection(
      queries,
      candidateEmbeddings,
      originalEmbedding,
      Math.min(5, queries.length), // Select top 5 queries or less
      0.3 // alpha parameter for balancing relevance and diversity
    );

    return {
      rawQuery: query,
      extensionQueries: selectedQueries,
      model,
      inputTokens,
      outputTokens
    };
  } catch (error) {
    addLog.warn('Query extension failed', {
      error,
      answer
    });
    return {
      rawQuery: query,
      extensionQueries: [],
      model,
      inputTokens,
      outputTokens
    };
  }
};
