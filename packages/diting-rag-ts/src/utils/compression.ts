// src/utils/compression.ts
// Chat History 结构化压缩 - 对齐 Python compress.py

import type { LLMMessage } from '../types/message';
import { getStopWords, isFollowupQuery } from './constants';

/**
 * 摘要选项
 */
export interface CompressionOptions {
  maxHistoryMessages: number; // 保留最近 N 条消息
  summarizeOlder: boolean; // 是否对更早的消息做摘要
  summaryPrompt?: string; // 自定义摘要提示词
}

/**
 * ChatHistorySummary - 压缩后的历史摘要（对齐 Python ChatHistorySummary）
 */
export interface ChatHistorySummary {
  summary: string;
  previousTopics: string[];
  previousPlaybooks: string[];
  entities: string[];
}

// ============================================================
// 内部工具函数（对齐 Python _strip_citations, _is_header_line 等）
// ============================================================

/**
 * 清除两种 citation 格式（对齐 Python _strip_citations）
 * 1. [id-xxx] - 旧格式
 * 2. [hexstring](CITE) - 新格式
 */
function stripCitations(content: string): string {
  // 清除 [id-xxx] 格式
  let result = content.replace(/\[id-[a-zA-Z0-9_-]+\]/g, '');
  // 清除 [hexstring](CITE) 格式
  result = result.replace(/\[[a-f0-9]{24}\]\(CITE\)/g, '');
  return result.trim();
}

/**
 * 判断是否为前言行（应跳过）（对齐 Python _is_header_line）
 * 前言行特征：
 * 1. 行末为冒号且不含句子结束符（整行是标题）
 * 2. Markdown 标题行
 * 3. 短行且无句子结束符
 */
function isHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // 行末为冒号且不含句子结束符
  if ((trimmed.endsWith('：') || trimmed.endsWith(':')) && !/[。！？.!?]/.test(trimmed)) {
    return true;
  }
  // Markdown 标题行
  if (/^#{1,6}\s+/.test(trimmed)) {
    return true;
  }
  // 短行且无句子结束符
  if (trimmed.length <= 15 && !/[。！？.!?]/.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * 从 AI 回答中提取第一句实质性结论（对齐 Python _extract_conclusion）
 */
function extractConclusion(aiContent: string, maxChars: number = 80): string {
  // 清除 citation
  const content = stripCitations(aiContent);

  const lines = content.split('\n');

  // 跳过前言行，找到第一个实质性内容行
  for (const line of lines) {
    if (isHeaderLine(line)) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 找到第一个实质性内容行，提取第一句
    // 按中文和英文句子结束符分割
    const sentenceEndCN = /[。！？]/.exec(trimmed);
    const sentenceEndEN = /[.!?]/.exec(trimmed);
    const sentenceEnd = sentenceEndCN || sentenceEndEN;

    let firstSentence: string;
    if (sentenceEnd) {
      firstSentence = trimmed.slice(0, sentenceEnd.index + 1);
    } else {
      firstSentence = trimmed;
    }

    // 截断到 maxChars
    if (firstSentence.length > maxChars) {
      return firstSentence.slice(0, maxChars) + '…';
    }
    return firstSentence;
  }

  // 无法提取，使用占位符
  return '（无法提取结论）';
}

/**
 * 从 Human 消息提取主题（对齐 Python _extract_topic）
 */
function extractTopic(humanContent: string, maxChars: number = 60): string {
  // 移除换行符，在词/字边界截断
  let topic = humanContent.replace(/\n/g, ' ');
  // 截断后判断是否加省略号
  if (topic.length > maxChars) {
    return topic.slice(0, maxChars) + '…';
  }
  return topic;
}

/**
 * 从问题文本检测 playbook 类型（对齐 Python _detect_playbook_from_query）
 */
function detectPlaybookFromQuery(query: string): string | null {
  const queryLower = query.toLowerCase();

  // 对比分析
  if (
    ['区别', '对比', '比较', '优缺点', 'vs', 'difference', 'compare', 'pros and cons'].some((t) =>
      queryLower.includes(t)
    )
  ) {
    return 'comparative_analysis';
  }

  // 故障排查
  if (
    ['错误', '失败', '报错', '不工作', '无法', 'error', 'fail', 'not working'].some((t) =>
      queryLower.includes(t)
    )
  ) {
    return 'troubleshooting';
  }

  // 深度研究
  if (
    ['有哪些', '所有', '全部', 'list', 'all', 'versions', 'features'].some((t) =>
      queryLower.includes(t)
    )
  ) {
    return 'deep_research';
  }

  // 追问检测（使用 constants.ts 中的 FOLLOWUP_PATTERNS）
  if (isFollowupQuery(query)) {
    return 'followup_query';
  }

  return null;
}

/**
 * 从对话历史中提取关键实体（对齐 Python _extract_entities）
 */
function extractEntities(chatHistory: LLMMessage[]): string[] {
  const entities = new Set<string>();

  // 常见的技术产品/概念关键词
  const entityPatterns = [
    /v[A-Z][a-zA-Z]+/g, // vNGAF, vAF, vOS 等
    /[A-Z][a-z]+[A-Z][a-zA-Z]+/g // HCI, NGFW 等
  ];

  const stopWords = getStopWords();

  for (const msg of chatHistory) {
    const content = msg.content || '';
    if (!content) continue;

    // 简单提取：查找连续的大写字母开头或 v 开头的词
    for (const pattern of entityPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach((m) => entities.add(m));
      }
    }
  }

  // 过滤：太短的 + 停用词
  return [...entities].filter((e) => e.length >= 3 && !stopWords.has(e.toLowerCase())).slice(0, 10);
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 压缩 chat history（对齐 Python compress_chat_history）
 * 把 chat_history 压缩成结构化摘要
 */
export function compressChatHistory(
  messages: LLMMessage[],
  maxTopicChars: number = 60,
  maxConclusionChars: number = 80
): ChatHistorySummary | null {
  if (!messages || messages.length === 0) {
    return null;
  }

  // 配对处理：Human + AI 为一轮
  interface Turn {
    topic: string;
    conclusion: string;
  }
  const turns: Turn[] = [];
  let pendingHuman: string | null = null;

  for (const msg of messages) {
    const role = (msg.role || '').toLowerCase();
    const content = msg.content || '';

    if (role === 'human' || role === 'user') {
      pendingHuman = content;
    } else if ((role === 'ai' || role === 'assistant') && pendingHuman !== null) {
      // 配对成功
      const topic = extractTopic(pendingHuman, maxTopicChars);
      const conclusion = extractConclusion(content, maxConclusionChars);
      turns.push({ topic, conclusion });
      pendingHuman = null;
    }
  }

  if (turns.length === 0) {
    return null;
  }

  // 提取前几轮的问题类型
  const previousPlaybooks: string[] = [];
  for (const turn of turns) {
    const playbook = detectPlaybookFromQuery(turn.topic);
    if (playbook) {
      previousPlaybooks.push(playbook);
    }
  }

  // 提取关键实体
  const entities = extractEntities(messages);

  // 构建摘要
  const historySummaryPrefix =
    '[HISTORY SUMMARY — for context only. Do NOT cite or reuse this as knowledge source. You MUST call @search for the current question.]\n\n';
  const summaryParts: string[] = [historySummaryPrefix];
  const previousTopics: string[] = [];

  for (let i = 0; i < turns.length; i++) {
    const { topic, conclusion } = turns[i];
    // 格式: Turn N: "human_topic" → ai_conclusion
    summaryParts.push(`Turn ${i + 1}: "${topic}" → ${conclusion}`);
    previousTopics.push(topic);
  }

  const summaryStr = summaryParts.join('\n');

  return {
    summary: summaryStr,
    previousTopics,
    previousPlaybooks,
    entities
  };
}

/**
 * 兼容旧接口：压缩 chat history（保留原有 compressHistory 逻辑）
 */
export function compressHistory(messages: LLMMessage[], options: CompressionOptions): LLMMessage[] {
  const { maxHistoryMessages, summarizeOlder } = options;

  if (messages.length <= maxHistoryMessages) {
    return messages;
  }

  const recent = messages.slice(-maxHistoryMessages);
  const older = messages.slice(0, -maxHistoryMessages);

  if (!summarizeOlder || older.length === 0) {
    return recent;
  }

  // 使用 compressChatHistory 生成摘要
  const summary = compressChatHistory(older);
  const summaryContent = summary ? summary.summary : summarizeMessages(older);

  const summaryMessage: LLMMessage = {
    role: 'system',
    content: `[历史对话摘要]\n${summaryContent}`
  };

  return [summaryMessage, ...recent];
}

/**
 * 将多条消息汇总为摘要（兼容旧接口）
 */
function summarizeMessages(messages: LLMMessage[]): string {
  const userMessages = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n- ');

  const assistantMessages = messages
    .filter((m) => m.role === 'assistant')
    .map((m) => m.content)
    .join('\n');

  const toolCalls = messages
    .filter((m) => m.role === 'user' && m.content.startsWith('[TOOL_CALL]'))
    .map((m) => m.content)
    .join('\n');

  const parts: string[] = [];
  if (userMessages) parts.push(`用户问题：\n- ${userMessages}`);
  if (assistantMessages) parts.push(`助手回复：\n${assistantMessages}`);
  if (toolCalls) parts.push(`工具调用：\n${toolCalls}`);

  return parts.join('\n\n') || '无历史记录';
}

/**
 * 从 chat history 提取结构化信息（兼容旧接口）
 */
export function extractChatHistoryInfo(messages: LLMMessage[]): ChatHistorySummary {
  // 使用新的 compressChatHistory 函数
  const compressed = compressChatHistory(messages);
  if (compressed) {
    return compressed;
  }

  // 回退到旧逻辑
  const userMessages = messages.filter((m) => m.role === 'user').map((m) => m.content);
  const assistantMessages = messages.filter((m) => m.role === 'assistant').map((m) => m.content);

  const allText = [...userMessages, ...assistantMessages].join(' ');
  const words = allText.split(/\s+/).filter((w) => w.length > 2);

  const entities = [...new Set(words.filter((w) => /^[A-Z]/.test(w)))];

  return {
    summary: summarizeMessages(messages),
    previousTopics: [],
    previousPlaybooks: [],
    entities
  };
}
