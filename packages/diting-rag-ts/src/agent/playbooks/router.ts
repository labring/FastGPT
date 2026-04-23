// src/agent/playbooks/router.ts
// Playbook Router - 完整版：6 种 playbook + LLM 分类 + 规则路由

import type { LLMProvider } from '../../ports/llm';
import type { LLMMessage } from '../../types/message';
import { PLAYBOOKS, getPlaybookContent, getAllPlaybookNames } from './templates';
import { detectLang } from '../../utils/lang';
import { getLogger } from '../../utils/logger';
import { isFollowupQuery as checkFollowup } from '../../utils/constants';
import { compressChatHistory } from '../../utils/compression';
import { buildClassifierPrompt } from '../../utils/prompt_loader';
import { parseJSON } from '../../utils/json_parser';

/**
 * 规则路由结果
 */
export interface RuleBasedRouteResult {
  playbook: string;
  matched: boolean;
}

/**
 * 路由规则定义
 */
interface RouteRule {
  playbook: string;
  triggers: string[];
  anti_triggers: string[];
}

// ============================================================
// 规则定义（完整版）- anti-triggers 防止误匹配
// ============================================================

const RULES: RouteRule[] = [
  {
    playbook: 'comparative_analysis',
    triggers: [
      // 中文
      '对比',
      '区别',
      '哪个更好',
      '比较',
      '优缺点',
      '不同',
      'vs',
      'v.s.',
      // 英文
      'compare',
      'comparison',
      'difference',
      'differ',
      'which is better',
      'pros and cons',
      'advantages',
      'disadvantages',
      'versus'
    ],
    anti_triggers: [
      // 排除排查类查询
      '排查',
      '失败',
      '报错',
      '故障',
      '解决',
      '修复',
      'troubleshoot',
      'troubleshooting',
      'fail',
      'failed',
      'error',
      'issue'
    ]
  },
  {
    playbook: 'troubleshooting',
    triggers: [
      // 中文
      '失败',
      '报错',
      '不工作',
      '无法连接',
      '排查',
      '故障',
      '错误',
      '问题',
      '怎么解决',
      '如何解决',
      '为什么不行',
      '为什么出错',
      '连接不上',
      // 英文
      'fail',
      'failed',
      'error',
      'not working',
      'cannot connect',
      'troubleshoot',
      'troubleshooting',
      'issue',
      'problem',
      'broken',
      'fix'
    ],
    anti_triggers: [
      // 排除对比类查询
      '对比',
      'compare',
      'difference',
      'vs'
    ]
  },
  {
    playbook: 'deep_research',
    triggers: [
      // 中文
      '有哪些',
      '全部',
      '所有',
      '列表',
      '版本',
      '特性',
      '功能列表',
      // 英文
      'list',
      'all',
      'every',
      'versions',
      'features',
      'everything'
    ],
    anti_triggers: []
  },
  {
    playbook: 'followup_query',
    triggers: [
      // 中文
      '那',
      '那么',
      '还有',
      '然后',
      '接下来',
      '呢',
      '吗',
      '另外',
      // 英文
      'then',
      'next',
      'also',
      'what about',
      'how about',
      'further'
    ],
    anti_triggers: []
  }
];

// ============================================================
// 规则路由
// ============================================================

/**
 * 规则匹配路由
 */
export function ruleBasedRoute(question: string, chatHistory?: LLMMessage[]): RuleBasedRouteResult {
  const lowerQuestion = question.toLowerCase();

  // 阶段 0: 追问检测（优先于其他规则）
  if (chatHistory && chatHistory.length > 0) {
    const isFollowup = isFollowupQuery(question, chatHistory);
    if (isFollowup) {
      return { playbook: 'followup_query', matched: true };
    }
  }

  // 阶段 1: 规则匹配
  for (const rule of RULES) {
    // 先检查 anti_triggers
    const hasAntiTrigger = rule.anti_triggers.some((t) => lowerQuestion.includes(t.toLowerCase()));
    if (hasAntiTrigger) continue;

    // 检查 triggers
    const hasTrigger = rule.triggers.some((t) => lowerQuestion.includes(t.toLowerCase()));
    if (hasTrigger) {
      return { playbook: rule.playbook, matched: true };
    }
  }

  // 阶段 2: 短查询默认 simple_query
  if (question.length < 30) {
    return { playbook: 'simple_query', matched: false };
  }

  // 默认 general
  return { playbook: 'general', matched: false };
}

/**
 * 判断是否为追问（使用 constants.ts 中完整的 FOLLOWUP_PATTERNS）
 */
function isFollowupQuery(question: string, history: LLMMessage[]): boolean {
  // 使用 constants.ts 中的 isFollowupQuery
  if (checkFollowup(question)) {
    return true;
  }

  // 额外检查：指代词 + 有历史
  const pronouns = ['它', '这个', '那个', 'this', 'that', 'it', 'they'];
  const lowerQuestion = question.toLowerCase();
  if (pronouns.some((p) => lowerQuestion.includes(p)) && history.length > 0) {
    // 检查词汇重叠
    const overlap = extractOverlapWords(question, history.map((m) => m.content).join(' '));
    return overlap > 0.3;
  }

  return false;
}

/**
 * 提取词汇重叠度
 */
function extractOverlapWords(question: string, history: string): number {
  const qWords = new Set(
    question
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1)
  );
  const hWords = new Set(
    history
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1)
  );

  if (qWords.size === 0) return 0;

  let overlap = 0;
  for (const word of qWords) {
    if (hWords.has(word)) overlap++;
  }

  return overlap / qWords.size;
}

// ============================================================
// LLM 分类（完整版 few-shot）
// ============================================================

/**
 * LLM 分类路由
 */
export async function llmClassify(
  llm: LLMProvider,
  question: string,
  chatHistory?: LLMMessage[],
  priorContext?: string
): Promise<{ playbook: string; analysis: string; reason: string }> {
  // 构建 playbook 描述
  const playbookNames = getAllPlaybookNames();
  const playbookDescriptions = playbookNames
    .map((name) => {
      const p = PLAYBOOKS[name];
      return `- ${p.name}: ${p.description}`;
    })
    .join('\n');

  // 生成结构化 chat history 摘要（对齐 Python compress_chat_history）
  const summary = chatHistory && chatHistory.length > 0 ? compressChatHistory(chatHistory) : null;

  // 检测语言
  const lang = detectLang(question);

  // 构建分类器 prompt
  const prompt = buildClassifierPrompt({
    playbookDescriptions,
    priorContext: priorContext || '',
    summary,
    question,
    lang
  });

  // 调用 LLM
  const response = await llm.chat(
    [
      { role: 'system', content: 'You are a query classifier.' },
      { role: 'user', content: prompt }
    ],
    {
      temperature: 0.3,
      maxTokens: 1024,
      enableThinking: false,
      extra: {
        enable_thinking: false,
        chat_template_kwargs: { enable_thinking: false }
      }
    }
  );

  // 解析响应
  const parsed = parseJSON<{
    playbook?: string;
    analysis?: string;
    reason?: string;
  }>(response.content);

  if (!parsed || !parsed.playbook) {
    throw new Error(`LLM response missing playbook field. LLM response: ${response.content}`);
  }

  // 验证 playbook 有效性
  const validPlaybooks = getAllPlaybookNames();
  if (!validPlaybooks.includes(parsed.playbook)) {
    throw new Error(`Invalid playbook returned by LLM: ${parsed.playbook}`);
  }

  return {
    playbook: parsed.playbook,
    analysis: parsed.analysis || '',
    reason: parsed.reason || ''
  };
}

// ============================================================
// 主路由函数
// ============================================================

/**
 * 主路由函数：LLM 分类优先 → 规则兜底
 */
export async function routePlaybook(
  llm: LLMProvider,
  question: string,
  chatHistory?: LLMMessage[],
  priorContext?: string,
  useLLM: boolean = true
): Promise<{ playbook: string; analysis: string; reason: string; method: 'llm' | 'rule' }> {
  // 优先尝试 LLM 分类
  if (useLLM) {
    try {
      const result = await llmClassify(llm, question, chatHistory, priorContext);
      return { ...result, method: 'llm' };
    } catch (error) {
      // LLM classification failed, will fallback to rules
      getLogger()?.error(`LLM classification failed, will fallback to rules. ${error}`);
    }
  }

  // 规则兜底
  const ruleResult = ruleBasedRoute(question, chatHistory);
  return {
    playbook: ruleResult.playbook,
    analysis: '',
    reason: ruleResult.matched ? 'Matched by rules' : 'Default rule fallback',
    method: 'rule'
  };
}

/**
 * 获取 playbook 内容
 */
export { getPlaybookContent };
