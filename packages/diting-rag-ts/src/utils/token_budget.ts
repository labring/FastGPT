// src/utils/token_budget.ts
// Token 预算管理 - 对齐 Python token_budget.py

import type { LLMMessage } from '../types/message';
import type { ChunkItem } from '../types/chunk';
import { DEFAULT_SEARCH_CONFIG } from './constants';

// Conservative token estimation ratio.
// 对齐 Python _CHARS_PER_TOKEN = 2
const CHARS_PER_TOKEN = 2;

// Max chars for assistant messages in chat history compression.
// 对齐 Python _MAX_ASSISTANT_CHARS = 80
const MAX_ASSISTANT_CHARS = 80;

// Reserved tokens for summary message in fit_messages.
// 对齐 Python _SUMMARY_RESERVE = 200
const SUMMARY_RESERVE = 200;

/**
 * 估算 token 数量（对齐 Python TokenBudget.estimate_tokens）
 * 保守估算：中文 ~1.5 token/char，英文 ~0.25 token/word
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(Math.ceil(text.length / CHARS_PER_TOKEN), 1);
}

/**
 * 估算 messages 的总 token 数（对齐 Python TokenBudget.estimate_tokens）
 */
export function estimateMessagesTokens(messages: LLMMessage[]): number {
  return messages.reduce((sum, msg) => {
    const overhead = 4;
    return sum + estimateTokens(msg.content) + overhead;
  }, 0);
}

/**
 * 估算 chunks 的总 token 数（对齐 Python）
 */
export function estimateChunksTokens(chunks: ChunkItem[]): number {
  return chunks.reduce((sum, chunk) => sum + estimateTokens(chunk.content), 0);
}

/**
 * 根据 model context size 计算 token budget（对齐 Python TokenBudget.remaining）
 */
export function calculateTokenBudget(
  contextWindow: number,
  fixedTokens: number = 0,
  maxOutput: number = 1000,
  safetyMargin: number = 500
): number {
  return Math.max(contextWindow - fixedTokens - maxOutput - safetyMargin, 0);
}

/**
 * 计算剩余可用 token budget（对齐 Python TokenBudget.remaining）
 */
export function remainingTokens(
  modelContextSize: number,
  fixedTokens: number,
  maxOutput: number,
  safetyMargin: number = 500
): number {
  return calculateTokenBudget(modelContextSize, fixedTokens, maxOutput, safetyMargin);
}

/**
 * 将 chunks 调整为适合 token budget（对齐 Python TokenBudget.fit_chunks）
 * 优先保留高分数 chunk，保持顺序
 */
export function fitChunks(chunks: ChunkItem[], budget: number): ChunkItem[] {
  if (!chunks || chunks.length === 0) {
    return [];
  }

  const selected: ChunkItem[] = [];
  let used = 0;

  for (const chunk of chunks) {
    const cost = estimateTokens(chunk.content) + 30; // metadata overhead
    if (used + cost > budget && selected.length > 0) {
      break;
    }
    selected.push(chunk);
    used += cost;
  }

  if (selected.length === 0 && chunks.length > 0) {
    selected.push(chunks[0]);
  }

  return selected;
}

/**
 * 内部函数：获取消息角色（对齐 Python TokenBudget._get_msg_role）
 */
function getMsgRole(msg: LLMMessage): string {
  return (msg.role || '').toLowerCase();
}

/**
 * 内部函数：获取消息内容（对齐 Python TokenBudget._get_msg_content）
 */
function getMsgContent(msg: LLMMessage): string {
  return msg.content || '';
}

/**
 * 内部函数：创建新消息并设置内容（对齐 Python TokenBudget._set_msg_content）
 */
function setMsgContent(msg: LLMMessage, content: string): LLMMessage {
  return { ...msg, content };
}

/**
 * 截断 assistant 消息（对齐 Python TokenBudget._truncate_assistant）
 * 清除 citations，然后截断
 */
function truncateAssistant(content: string, maxChars: number = MAX_ASSISTANT_CHARS): string {
  // 清除 [id-xxx] 格式
  let result = content.replace(/\[id-[a-zA-Z0-9_-]+\]/g, '');
  // 清除 [hexstring](CITE) 格式
  result = result.replace(/\[[a-f0-9]{24}\]\(CITE\)/g, '');
  result = result.trim();
  if (result.length <= maxChars) {
    return result;
  }
  return result.slice(0, maxChars) + '…';
}

/**
 * 将 messages 调整为适合 token budget（对齐 Python TokenBudget.fit_messages）
 * 策略：
 * 1. 保留 _SUMMARY_RESERVE tokens 给摘要
 * 2. 截断所有 assistant 消息
 * 3. 如果全部 fit → 返回
 * 4. 否则：从最新往最老遍历，保留能 fit 的
 * 5. 保证：至少保留最近一轮（human + assistant）
 */
export function fitMessages(
  messages: LLMMessage[],
  budget: number,
  maxAssistantChars: number = MAX_ASSISTANT_CHARS
): LLMMessage[] {
  if (!messages || messages.length === 0) {
    return [];
  }

  // Phase 1: 截断 assistant 消息
  const truncated: LLMMessage[] = [];
  for (const msg of messages) {
    const role = getMsgRole(msg);
    if (role === 'ai' || role === 'assistant') {
      const content = getMsgContent(msg);
      const newContent = truncateAssistant(content, maxAssistantChars);
      truncated.push(setMsgContent(msg, newContent));
    } else {
      truncated.push(msg);
    }
  }

  // Phase 2: 检查是否全部 fit
  const effectiveBudget = Math.max(budget - SUMMARY_RESERVE, 0);
  const total = sum(truncated, (m) => estimateTokens(getMsgContent(m)));
  if (total <= effectiveBudget) {
    return truncated;
  }

  // Phase 3: 从最新往最老遍历
  const recent: LLMMessage[] = [];
  let used = 0;
  for (let i = truncated.length - 1; i >= 0; i--) {
    const msg = truncated[i];
    const cost = estimateTokens(getMsgContent(msg));
    if (used + cost > effectiveBudget && recent.length >= 2) {
      break;
    }
    recent.push(msg);
    used += cost;
  }

  recent.reverse();

  // Phase 4: 摘要早期消息
  const keptCount = recent.length;
  const early =
    keptCount < truncated.length ? truncated.slice(0, truncated.length - keptCount) : [];

  if (early.length === 0) {
    return recent;
  }

  // 从早期 human 消息构建摘要主题
  const topics: string[] = [];
  for (const msg of early) {
    const role = getMsgRole(msg);
    if (role === 'human' || role === 'user') {
      const content = getMsgContent(msg);
      let topic = content.slice(0, 50).replace(/\n/g, ' ');
      if (content.length > 50) {
        topic += '...';
      }
      topics.push(topic);
    }
  }

  let summaryText: string;
  if (topics.length > 0) {
    summaryText = `Earlier conversation summary (${topics.length} rounds): ${topics.join('; ')}`;
  } else {
    summaryText = `Earlier conversation summary (${early.length} messages): omitted`;
  }

  // 截断摘要到保留范围内
  const maxSummaryChars = SUMMARY_RESERVE * CHARS_PER_TOKEN;
  if (summaryText.length > maxSummaryChars) {
    summaryText = summaryText.slice(0, maxSummaryChars) + '...';
  }

  // 生成摘要消息
  const summaryMsg: LLMMessage = { role: 'system', content: summaryText };

  return [summaryMsg, ...recent];
}

/**
 * 辅助函数：计算消息列表总 token
 */
function sum(messages: LLMMessage[], selector: (msg: LLMMessage) => number): number {
  return messages.reduce((acc, msg) => acc + selector(msg), 0);
}

/**
 * 兼容旧接口
 */
export function calculateTokenBudgetLegacy(contextWindow: number): number {
  return Math.floor(contextWindow * DEFAULT_SEARCH_CONFIG.DEFAULT_TOKEN_BUDGET_RATIO);
}
