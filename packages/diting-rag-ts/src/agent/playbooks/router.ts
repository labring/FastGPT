// src/agent/playbooks/router.ts
// Playbook Router - 完整版：6 种 playbook + LLM 分类 + 规则路由

import type { LLMProvider } from '../../ports/llm';
import type { LLMMessage } from '../../types/message';
import { PLAYBOOKS, getPlaybookContent, getAllPlaybookNames } from './templates';
import { detectLang } from '../../utils/lang';
import { isFollowupQuery as checkFollowup } from '../../utils/constants';

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
 * 构建分类器 prompt（完整版）
 */
function buildClassifierPrompt(options: {
  playbookDescriptions: string;
  priorContext: string;
  summary: string;
  question: string;
  lang: string;
}): string {
  const { playbookDescriptions, priorContext, summary, question, lang } = options;

  const systemPrompt =
    lang === 'zh'
      ? `你是一个查询分类专家。根据用户问题的特点，选择最合适的 playbook（处理策略）。`
      : `You are a query classification expert. Select the most appropriate playbook (handling strategy) based on the question characteristics.`;

  const fewShotExamples =
    lang === 'zh'
      ? `
## Few-shot Examples

**Example 1**
Question: "云端部署和本地部署有什么区别？"
Classification: {"playbook": "comparative_analysis", "analysis": "这是一个对比类查询，涉及两个方案的比较", "reason": "包含关键词'区别'"}

**Example 2**
Question: "用户登录失败怎么排查？"
Classification: {"playbook": "troubleshooting", "analysis": "这是一个故障排查查询", "reason": "包含关键词'失败'和'怎么'"}

**Example 3**
Question: "该产品支持哪些操作系统？"
Classification: {"playbook": "deep_research", "analysis": "这是一个需要列举所有支持项的查询", "reason": "包含关键词'哪些'"}

**Example 4**
Question: "那配置步骤呢？"
Classification: {"playbook": "followup_query", "analysis": "这是对前文的追问", "reason": "包含追问关键词'那'"}`
      : `
## Few-shot Examples

**Example 1**
Question: "What are the differences between cloud deployment and on-premise deployment?"
Classification: {"playbook": "comparative_analysis", "analysis": "This is a comparison query", "reason": "Contains keyword 'differences'"}

**Example 2**
Question: "User login failed, how to troubleshoot?"
Classification: {"playbook": "troubleshooting", "analysis": "This is a troubleshooting query", "reason": "Contains keyword 'failed'"}

**Example 3**
Question: "What operating systems does this product support?"
Classification: {"playbook": "deep_research", "analysis": "This requires listing all supported items", "reason": "Contains keyword 'what'}"`;

  return `${systemPrompt}

## Available Playbooks
${playbookDescriptions}

## Context (optional hints for Search):
${priorContext || 'No additional context'}

## Chat History Summary
${summary}

## User Question
${question}

${fewShotExamples}

## Output
Please classify the question and respond with JSON:
{"playbook": "<playbook_name>", "analysis": "<analysis>", "reason": "<reason>"}`;
}

/**
 * 提取历史摘要
 */
function extractHistorySummary(history: LLMMessage[]): string {
  if (!history || history.length === 0) {
    return 'No additional chat_history';
  }

  // 取最近 3 轮
  const recent = history.slice(-3);
  return recent.map((m) => `${m.role}: ${m.content.substring(0, 100)}`).join('\n');
}

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

  // 生成 chat history 摘要
  const summary = chatHistory ? extractHistorySummary(chatHistory) : 'No additional chat_history';

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
    { temperature: 0.3, maxTokens: 512 }
  );

  // 解析响应
  try {
    // 尝试提取 JSON
    const content = response.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;
    const parsed = JSON.parse(jsonStr);

    if (parsed && parsed.playbook) {
      // 验证 playbook 有效性
      const validPlaybooks = getAllPlaybookNames();
      if (validPlaybooks.includes(parsed.playbook)) {
        return {
          playbook: parsed.playbook,
          analysis: parsed.analysis || '',
          reason: parsed.reason || ''
        };
      }
    }
  } catch (e) {
    // 日志在调用处处理
  }

  // 解析失败，返回默认
  return {
    playbook: 'simple_query',
    analysis: 'Failed to parse LLM response, using default',
    reason: 'Default fallback'
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
