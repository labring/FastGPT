// src/utils/constants.ts
// 全局常量定义

/**
 * 默认配置值
 */
export const DEFAULT_SEARCH_CONFIG = {
  SEARCH_MODE: 'mixedRecall' as const,
  MAX_SEARCH_ROUNDS: 5,
  MAX_TOOL_CALLS: 10,
  EMBEDDING_WEIGHT: 0.5,
  SIMILARITY_THRESHOLD: 0.0,
  RERANK_TOP_K: parseInt(process.env['AGENTIC_RERANK_TOP_K'] ?? '20', 10) || 20,
  RETRIEVE_LIMIT: parseInt(process.env['AGENTIC_RETRIEVE_LIMIT'] ?? '50', 10) || 50,
  DEFAULT_TOKEN_BUDGET_RATIO: 0.8,
  ANSWER_MAX_CHUNKS: 15,
  ANSWER_MAX_TOKENS: 4096
} as const;

/**
 * Playbook 名称
 */
export const PLAYBOOKS = {
  SIMPLE_QUERY: 'simple_query',
  COMPARATIVE_ANALYSIS: 'comparative_analysis',
  TROUBLESHOOTING: 'troubleshooting',
  DEEP_RESEARCH: 'deep_research',
  FOLLOWUP_QUERY: 'followup_query',
  GENERAL: 'general'
} as const;

/**
 * 工具名称（Agent 可调用）
 */
export const TOOLS = {
  RETRIEVE: 'retrieve',
  RERANK: 'rerank',
  QUERY_REWRITE: 'query_rewrite',
  SUMMARY: 'summary',
  CHUNK_SELECTOR: 'chunk_selector',
  SEARCH: 'search',
  ASSESS: 'assess'
} as const;

/**
 * 反思标签
 */
export const REFLECTION_LABELS = {
  SUCCESS: 'success',
  PARTIAL: 'partial',
  FAILURE: 'failure',
  REFUSE: 'refuse'
} as const;

/**
 * 信息增益阈值
 */
export const INFO_GAIN_THRESHOLD = {
  LOW: 0.1,
  MEDIUM: 0.3,
  HIGH: 0.5
} as const;

/**
 * Token 预算相关
 */
export const TOKEN_LIMITS = {
  QWEN3_NEXT_80B: 16000,
  QWEN3_5_35B: 32000,
  GPT4_TURBO: 128000
} as const;

// ============================================================
// FOLLOWUP_PATTERNS
// ============================================================

export const FOLLOWUP_PATTERNS: string[] = [
  // Chinese
  '那(么|么|些)',
  '那(个|些)',
  '然后',
  '之后',
  '还有',
  '另外',
  '接着',
  '如果',
  '怎样',
  '怎么',
  '如何',
  '为什么',
  '那(个|种)',
  '它(的|们|是)',
  '这个',
  '那个',
  '这些',
  '那些',
  '关于.*呢',
  '.*呢[?？]',
  '呢[?？]$',
  // English
  'then',
  'next',
  'also',
  'what about',
  'how about',
  'what if',
  'why',
  'how to',
  "what's the",
  'what is the',
  'can you',
  'could you',
  'and what',
  'what else',
  'after that',
  'furthermore',
  'additionally',
  'about that',
  'that one',
  'this one',
  'those',
  '\\?$'
];

// ============================================================
// STOP_WORDS
// ============================================================

export const STOP_WORDS: Set<string> = new Set([
  // English stop words
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'need',
  'dare',
  'ought',
  'used',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'also',
  'now',
  'and',
  'or',
  'but',
  'if',
  'because',
  'until',
  'while',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'what',
  'which',
  'who',
  'whom',
  'their',
  'they',
  'them',
  'you',
  'your',
  'we',
  'us',
  'our',
  'he',
  'she',
  'him',
  'her',
  'his',
  'an',
  'am',
  'get',
  'got',
  'make',
  'made',
  'take',
  'took',
  'see',
  'saw',
  'come',
  'came',
  'go',
  'went',
  'know',
  'knew',
  'think',
  'thought',
  'say',
  'said',
  'tell',
  'told',
  'find',
  'found',
  'give',
  'gave',
  'show',
  'showed',
  'keep',
  'kept',
  'let',
  'begin',
  'began',
  'seem',
  'seemed',
  'help',
  'helped',
  'play',
  'ran',
  'run',
  'move',
  'live',
  'believe',
  'hold',
  'bring',
  'write',
  'provide',
  'sit',
  'stand',
  'lose',
  'pay',
  'meet',
  'include',
  'continue',
  'set',
  'learn',
  'change',
  'lead',
  'understand',
  'watch',
  'follow',
  'stop',
  'create',
  'speak',
  'read',
  'allow',
  'add',
  'spend',
  'grow',
  'open',
  'walk',
  'win',
  'offer',
  'remember',
  'love',
  'consider',
  'buy',
  'wait',
  'serve',
  'die',
  'send',
  'expect',
  'build',
  'stay',
  'fall',
  'cut',
  'reach',
  'kill',
  'remain',
  'suggest',
  'raise',
  'pass',
  'sell',
  'require',
  'report',
  'decide',
  'pull',
  'dev',
  'ops',
  'ai',
  'vm',
  'cpu',
  'ram',
  'ip',
  'hello',
  'hi',
  'thanks',
  'thank',
  'please',
  'sorry',
  // Chinese stop words
  '什么',
  '怎么',
  '如何',
  '哪个',
  '哪些',
  '为什么',
  '多少',
  '这个',
  '那个',
  '这些',
  '那些',
  '这里',
  '那里',
  '现在',
  '可以',
  '能够',
  '需要',
  '应该',
  '可能',
  '已经',
  '正在',
  '没有',
  '是不是',
  '有没有',
  '会不会',
  '的',
  '是',
  '了',
  '在',
  '有',
  '和',
  '与',
  '或',
  '不',
  '也',
  '都',
  '就',
  '说',
  '要',
  '去',
  '会',
  '能',
  '对',
  '把',
  '让',
  '给',
  '用',
  '为',
  '从',
  '到',
  '着',
  '过',
  '来',
  '时',
  '而',
  '但',
  '却',
  '又',
  '如',
  '因',
  '所',
  '以',
  '于',
  '等',
  '这',
  '么',
  '呢',
  '吧',
  '啊',
  '吗',
  '呀',
  '哦',
  '哈',
  '我',
  '你',
  '他',
  '她',
  '它',
  '我们',
  '你们',
  '他们',
  '一',
  '二',
  '三',
  '四',
  '五',
  '六',
  '七',
  '八',
  '九',
  '十',
  '第',
  '其',
  '此',
  '些',
  '被',
  '比',
  '才',
  '还',
  '再'
]);

export function getStopWords(): Set<string> {
  return STOP_WORDS;
}

// ============================================================
// 不相关 Query 早停阈值（环境变量可覆盖）
// ============================================================

/**
 * BGE/reranker score 低于此值视为不相关（无 LLM score 时使用）
 * 覆盖：AGENTIC_IRRELEVANT_BGE_THRESHOLD=0.15
 */
const bgeThreshold = parseFloat(process.env['AGENTIC_IRRELEVANT_BGE_THRESHOLD'] ?? '0.2');
export const IRRELEVANT_BGE_THRESHOLD = Number.isNaN(bgeThreshold) ? 0.2 : bgeThreshold;

/**
 * LLM sub_query_score（0–10）低于此值视为不相关（优先使用）
 * 覆盖：AGENTIC_IRRELEVANT_LLM_THRESHOLD=2
 */
const llmThreshold = parseFloat(process.env['AGENTIC_IRRELEVANT_LLM_THRESHOLD'] ?? '3');
export const IRRELEVANT_LLM_THRESHOLD = Number.isNaN(llmThreshold) ? 3 : llmThreshold;

export function isFollowupQuery(text: string): boolean {
  for (const pattern of FOLLOWUP_PATTERNS) {
    const regex = new RegExp(pattern);
    if (regex.test(text)) {
      return true;
    }
  }
  return false;
}
