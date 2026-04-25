#!/usr/bin/env tsx
/// <reference types="vitest/globals" />
// test/multi-lang-search.test.ts
// 多语言 Agentic Search 测试脚本 - 验证语言检测与自适应搜索行为
//
// 用法:
//   tsx test/multi-lang-search.test.ts [options]
//
// 选项:
//   --model <name>      模型名称 (默认: LLM_MODEL 环境变量)
//   --endpoint <url>    API 端点 (默认: LLM_BASE_URL 环境变量)
//   --api-key <key>     API 密钥 (默认: LLM_API_KEY 环境变量)
//   --env-file <file>   指定 .env 文件路径 (默认: ../.env)
//   --layer <layer>     测试层: unit | agent | both (默认: both)
//   --output <file>     输出 JSON 报告文件路径 (可选)
//   --timeout <ms>      单个用例超时毫秒数 (默认: 120000)
//   --help, -h          显示帮助

// ============================================================
// 依赖 import
// ============================================================

import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __scriptDir = dirname(fileURLToPath(import.meta.url));

// dotenv 延迟加载：parseArgs 需要先读取 --env-file 参数
function loadEnv(envFile?: string): void {
  if (envFile) {
    const resolved = resolve(envFile);
    dotenv.config({ path: resolved });
    console.log(`[dotenv] Loaded: ${resolved}`);
  } else {
    // 默认加载 .env
    dotenv.config({ path: join(__scriptDir, '..', '.env') });
  }
}

import { detectLang } from '../src/utils/lang';
import {
  LanguageTracker,
  buildLanguageConfig,
  getTargetLanguages,
  type LanguageTrackerConfig
} from '../src/utils/lang_directive';
import { MockVectorSearchProvider } from '../src/adapters/mock/vector_search';
import { MockFullTextSearchProvider } from '../src/adapters/mock/full_text_search';
import { MockEmbeddingProvider } from '../src/adapters/mock/embedding';
import { createSearchResult, type SearchResult } from '../src/ports/search';
import { subQueryFilter } from '../src/skills/atomic/chunk_selector';
import { createAgenticSearch } from '../src/agent/runner';
import { ConsoleLogger } from '../src/builtIn/logger/consoleLogger';
import { LogLevel } from '../src/ports/logger';
import type { ChunkResult, ChunkItem } from '../src/types/chunk';
import type { AgenticSearchResult } from '../src/agent/runner';
import type { LLMProvider } from '../src/ports/llm';
import type { LLMMessage, LLMResponse, ToolCall } from '../src/types/message';

const logger = new ConsoleLogger({ level: LogLevel.DEBUG, prefix: 'multi-lang testing' });

// ============================================================
// DirectLLMProvider（与 model-compat.test.ts 相同）
// ============================================================

class DirectLLMProvider implements LLMProvider {
  constructor(
    private model: string,
    private endpoint: string,
    private apiKey: string,
    private timeoutMs: number,
    private globalLogger: ConsoleLogger
  ) {}

  async chat(
    messages: LLMMessage[],
    options?: import('../src/types/message').LLMCallOptions
  ): Promise<LLMResponse> {
    const model = options?.model || this.model;
    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0,
      max_tokens: options?.maxTokens ?? 8192,
      stream: false
    };
    if (body.model === 'kimi-k2.5') {
      body.temperature = 1;
    }

    if (options?.tools?.length) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice ?? 'auto';
    }

    // 透传 extra 字段（enable_thinking 等模型特定参数）
    if (options?.extra) {
      Object.assign(body, options.extra);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resp = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${text}`);
      }

      const data = (await resp.json()) as {
        choices?: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{
              id: string;
              type: string;
              function: { name: string; arguments: string };
            }>;
            reasoning_content?: string;
          };
          finish_reason?: string;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const choice = data.choices?.[0];
      const msg = choice?.message;
      return {
        content: msg?.content ?? '',
        toolCalls: (msg?.tool_calls ?? []).map(
          (tc): ToolCall => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.function.name, arguments: tc.function.arguments }
          })
        ),
        reasoning: msg?.reasoning_content,
        usage: {
          inputTokens: data.usage?.prompt_tokens,
          outputTokens: data.usage?.completion_tokens
        }
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async *chatStream(
    messages: LLMMessage[],
    options?: import('../src/types/message').LLMCallOptions
  ): AsyncIterable<LLMResponse> {
    const model = options?.model || this.model;
    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0,
      max_tokens: options?.maxTokens ?? 8192,
      stream: true
    };

    if (options?.tools?.length) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice ?? 'auto';
    }

    // 透传 extra 字段
    if (options?.extra) {
      Object.assign(body, options.extra);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let resp: Response;
    try {
      resp = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      if (!resp.body) throw new Error('No response body');
    } finally {
      clearTimeout(timer);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') return;
          try {
            const data = JSON.parse(dataStr) as {
              choices?: Array<{ delta: { content?: string } }>;
            };
            const delta = data.choices?.[0]?.delta;
            if (delta) yield { content: delta.content || '' };
          } catch {
            /* skip parse errors */
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }

  getModelInfo() {
    return { name: this.model, contextWindow: 16000, maxOutputTokens: 8192 };
  }
}

// ============================================================
// 配置 & CLI 解析
// ============================================================

export type Layer = 'unit' | 'agent' | 'both';

export interface MultiLangConfig {
  model: string;
  endpoint: string;
  apiKey: string;
  layer: Layer;
  envFile?: string;
  cases?: string[];
  output?: string;
  timeoutMs: number;
  provider: 'direct' | 'builtin';
}

function parseArgs(): MultiLangConfig {
  const args = process.argv.slice(2);

  // 先提取 --env-file 和 --help
  let envFile: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env-file' && i + 1 < args.length) {
      envFile = args[i + 1];
      break;
    }
    if (args[i] === '--help' || args[i] === '-h') {
      // 帮助信息在 loadEnv 前即可输出
      break;
    }
  }

  // 加载 env（先于读取 process.env.*）
  loadEnv(envFile);

  const config: MultiLangConfig = {
    model: process.env.LLM_MODEL || 'unknown-model',
    endpoint: (process.env.LLM_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, ''),
    apiKey: process.env.LLM_API_KEY || '',
    layer: 'both',
    envFile,
    timeoutMs: 120_000,
    provider: 'direct' as const
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--model':
        config.model = args[++i];
        break;
      case '--endpoint':
        config.endpoint = args[++i].replace(/\/$/, '');
        break;
      case '--api-key':
        config.apiKey = args[++i];
        break;
      case '--layer':
        config.layer = args[++i] as Layer;
        break;
      case '--output':
        config.output = args[++i];
        break;
      case '--timeout':
        config.timeoutMs = parseInt(args[++i], 10);
        break;
      case '--provider':
        config.provider = args[++i] as 'direct' | 'builtin';
        break;
      case '--cases':
        config.cases = args[++i]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case '--env-file':
        i++;
        break; // 已在 pre-scan 中处理
      case '--help':
      case '-h':
        console.log(`
Usage: tsx test/multi-lang-search.test.ts [options]

Options:
  --model <name>      Model name (default: LLM_MODEL env var)
  --endpoint <url>    API endpoint (default: LLM_BASE_URL env var)
  --api-key <key>     API key (default: LLM_API_KEY env var)
  --env-file <file>   Custom .env file path (default: ../.env)
  --cases <ids>      Comma-separated test IDs/prefixes (default: all)
                     e.g. --cases A1a,A2a  or  --cases U1,U7
  --layer <layer>     Test layer: unit | agent | both (default: both)
  --output <file>     Write JSON report to file (optional)
  --timeout <ms>      Per-test timeout in ms (default: 120000)
  --provider <name>   LLM provider: direct | builtin (default: direct)
  --help, -h          Show this help

Examples:
  # Unit tests only (no LLM needed)
  tsx test/multi-lang-search.test.ts --layer unit

  # Specific agent cases
  tsx test/multi-lang-search.test.ts --env-file .lab.env.qwen35 --layer agent --cases A1a,A2a,A9a

  # Specific unit cases
  tsx test/multi-lang-search.test.ts --cases U1,U6,U7,U8

  # Full test with report
  tsx test/multi-lang-search.test.ts --env-file .lab.env.qwen35 --output /tmp/report.json
`);
        process.exit(0);
    }
  }

  if (!['unit', 'agent', 'both'].includes(config.layer)) {
    console.error(`Invalid --layer value: "${config.layer}". Must be: unit | agent | both`);
    process.exit(1);
  }
  return config;
}

// ============================================================
// 测试结果类型（对齐 model-compat.test.ts）
// ============================================================

export type TestStatus = 'pass' | 'fail' | 'error' | 'info';

export interface TestCase {
  id: string;
  name: string;
  status: TestStatus;
  durationMs: number;
  detail?: string;
  info?: Record<string, unknown>;
}

export interface LayerResult {
  passed: number;
  total: number;
  cases: TestCase[];
}

export interface MultiLangReport {
  model: string;
  endpoint: string;
  timestamp: string;
  layers: { unit?: LayerResult; agent?: LayerResult };
  recommendations: string[];
}

// ============================================================
// 终端输出
// ============================================================

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function statusIcon(s: TestStatus): string {
  if (s === 'pass') return `${GREEN}✓ PASS${RESET}`;
  if (s === 'fail') return `${RED}✗ FAIL${RESET}`;
  if (s === 'error') return `${RED}! ERROR${RESET}`;
  if (s === 'info') return `${CYAN}i INFO${RESET}`;
  return `${DIM}○ SKIP${RESET}`;
}

function printLayerResults(title: string, layer: LayerResult): void {
  console.log(`\n${BOLD}─── ${title} ${'─'.repeat(54 - title.length)}${RESET}`);
  for (const tc of layer.cases) {
    const dur = tc.durationMs > 0 ? `  ${DIM}(${tc.durationMs}ms)${RESET}` : '';
    const det = tc.detail ? `  ${DIM}${tc.detail}${RESET}` : '';
    console.log(`${tc.id.padEnd(4)} ${tc.name.padEnd(36)} ${statusIcon(tc.status)}${dur}${det}`);
    if (tc.info && Object.keys(tc.info).length > 0) {
      for (const [k, v] of Object.entries(tc.info)) {
        console.log(`     ${DIM}${k}: ${JSON.stringify(v)}${RESET}`);
      }
    }
  }
}

function printReport(report: MultiLangReport): void {
  const W = 64;
  console.log(`\n${BOLD}╔${'═'.repeat(W)}╗`);
  console.log(`║  Multi-Lang Agentic Search Report${' '.repeat(W - 34)}║`);
  console.log(`║  Model:    ${report.model.slice(0, W - 14).padEnd(W - 12)}║`);
  console.log(`║  Endpoint: ${report.endpoint.slice(0, W - 14).padEnd(W - 12)}║`);
  console.log(`║  Time:     ${report.timestamp.padEnd(W - 12)}║`);
  console.log(`╚${'═'.repeat(W)}╝${RESET}`);

  if (report.layers.unit) printLayerResults('Unit Layer (no LLM)', report.layers.unit);
  if (report.layers.agent) printLayerResults('Agent Layer (real LLM)', report.layers.agent);

  console.log(`\n${BOLD}─── Summary ${'─'.repeat(53)}${RESET}`);
  if (report.layers.unit) {
    console.log(`Unit Layer:   ${report.layers.unit.passed}/${report.layers.unit.total} passed`);
  }
  if (report.layers.agent) {
    console.log(`Agent Layer:  ${report.layers.agent.passed}/${report.layers.agent.total} passed`);
  }
  const totalPassed = (report.layers.unit?.passed ?? 0) + (report.layers.agent?.passed ?? 0);
  const totalTests = (report.layers.unit?.total ?? 0) + (report.layers.agent?.total ?? 0);
  console.log(`Overall:      ${totalPassed}/${totalTests} passed`);

  if (report.recommendations.length > 0) {
    console.log(`\n${BOLD}─── Recommendations ${'─'.repeat(45)}${RESET}`);
    for (const rec of report.recommendations) {
      console.log(`${YELLOW}⚠  ${rec}${RESET}`);
    }
  }
  console.log();
}

function makeLayerResult(cases: TestCase[]): LayerResult {
  const countable = cases.filter((c) => c.status !== 'info' && c.status !== 'skip');
  return {
    passed: countable.filter((c) => c.status === 'pass').length,
    total: countable.length,
    cases
  };
}

function buildRecommendations(cases: TestCase[]): string[] {
  const recs: string[] = [];
  for (const tc of cases) {
    if (tc.status === 'fail' || tc.status === 'error') {
      recs.push(`${tc.id} FAILED: ${tc.detail ?? '(no detail)'}`);
    }
  }
  return recs;
}

// ============================================================
// 测试用例包装
// ============================================================

async function runCase(
  id: string,
  name: string,
  fn: () => Promise<Omit<TestCase, 'id' | 'name' | 'durationMs'>>
): Promise<TestCase> {
  const start = Date.now();
  try {
    const result = await fn();
    return { id, name, durationMs: Date.now() - start, ...result };
  } catch (e) {
    return {
      id,
      name,
      durationMs: Date.now() - start,
      status: 'error',
      detail: e instanceof Error ? e.message : String(e)
    };
  }
}

// ============================================================
// Mock Chunks 工厂：生成不同语言的 chunks
// ============================================================

function makeChunk(overrides: Partial<ChunkItem> = {}): ChunkItem {
  return {
    id: 'c1',
    content: 'test content',
    score: 0.5,
    datasetId: 'test-ds',
    sourceName: 'test.pdf',
    ...overrides
  };
}

/** 中文 chunks — 模拟中文知识库 */
const ZH_CHUNKS: ChunkResult[] = [
  {
    id: 'zh-1',
    content: '超融合 HCI 默认管理员账号为 admin，默认密码为 Fit@12345，首次登录后请立即修改密码。',
    score: 0.9,
    datasetId: 'test-ds',
    sourceName: 'HCI手册.pdf',
    searchSource: 'vector',
    detectedLanguage: 'zh'
  },
  {
    id: 'zh-2',
    content: '超融合系统初始化完成后，通过浏览器访问管理界面，使用默认凭据 admin/Fit@12345 登录。',
    score: 0.85,
    datasetId: 'test-ds',
    sourceName: '快速入门.pdf',
    searchSource: 'vector',
    detectedLanguage: 'zh'
  },
  {
    id: 'zh-3',
    content: '安全建议：超融合系统部署后应立即修改默认密码，避免使用出厂设置。',
    score: 0.7,
    datasetId: 'test-ds',
    sourceName: '安全规范.pdf',
    searchSource: 'fulltext',
    detectedLanguage: 'zh'
  }
];

/** 英文 chunks — 模拟英文知识库 */
const EN_CHUNKS: ChunkResult[] = [
  {
    id: 'en-1',
    content:
      'The HCI default administrator account is admin with password Fit@12345. Change this immediately after first login.',
    score: 0.9,
    datasetId: 'test-ds',
    sourceName: 'HCI-Manual.pdf',
    searchSource: 'vector',
    detectedLanguage: 'en'
  },
  {
    id: 'en-2',
    content:
      'After initialization, access the HCI management console via browser using default credentials admin/Fit@12345.',
    score: 0.85,
    datasetId: 'test-ds',
    sourceName: 'QuickStart.pdf',
    searchSource: 'vector',
    detectedLanguage: 'en'
  },
  {
    id: 'en-3',
    content:
      'Security best practice: Change the default HCI password immediately after deployment.',
    score: 0.7,
    datasetId: 'test-ds',
    sourceName: 'Security.pdf',
    searchSource: 'fulltext',
    detectedLanguage: 'en'
  }
];

/** 日文 chunks — 模拟日文知识库 */
const JA_CHUNKS: ChunkResult[] = [
  {
    id: 'ja-1',
    content:
      'HCIのデフォルト管理者アカウントはadminで、パスワードはFit@12345です。初回ログイン後はすぐに変更してください。',
    score: 0.9,
    datasetId: 'test-ds',
    sourceName: 'HCIマニュアル.pdf',
    searchSource: 'vector',
    detectedLanguage: 'ja'
  },
  {
    id: 'ja-2',
    content:
      '初期化後、ブラウザからHCI管理画面にアクセスし、デフォルト認証情報admin/Fit@12345でログインします。',
    score: 0.85,
    datasetId: 'test-ds',
    sourceName: 'クイックスタート.pdf',
    searchSource: 'vector',
    detectedLanguage: 'ja'
  },
  {
    id: 'ja-3',
    content: 'セキュリティ対策：展開後すぐにHCIのデフォルトパスワードを変更してください。',
    score: 0.7,
    datasetId: 'test-ds',
    sourceName: 'セキュリティ.pdf',
    searchSource: 'fulltext',
    detectedLanguage: 'ja'
  }
];

/** 韩文 chunks — 模拟韩文知识库 */
const KO_CHUNKS: ChunkResult[] = [
  {
    id: 'ko-1',
    content:
      'HCI 기본 관리자 계정은 admin이며 비밀번호는 Fit@12345입니다. 첫 로그인 후 즉시 변경하십시오.',
    score: 0.9,
    datasetId: 'test-ds',
    sourceName: 'HCI매뉴얼.pdf',
    searchSource: 'vector',
    detectedLanguage: 'ko'
  },
  {
    id: 'ko-2',
    content:
      '초기화 후 브라우저를 통해 HCI 관리 콘솔에 접속하고 기본 자격 증명 admin/Fit@12345로 로그인합니다.',
    score: 0.85,
    datasetId: 'test-ds',
    sourceName: '빠른시작.pdf',
    searchSource: 'vector',
    detectedLanguage: 'ko'
  }
];

/** 泰文 chunks — 模拟泰文知识库（小语种，无 ISO 639-1 映射的边界情况） */
const TH_CHUNKS: ChunkResult[] = [
  {
    id: 'th-1',
    content:
      'บัญชีผู้ดูแลระบบเริ่มต้นของ HCI คือ admin รหัสผ่านคือ Fit@12345 กรุณาเปลี่ยนทันทีหลังจากเข้าสู่ระบบครั้งแรก',
    score: 0.9,
    datasetId: 'test-ds',
    sourceName: 'HCIคู่มือ.pdf',
    searchSource: 'vector',
    detectedLanguage: 'th'
  },
  {
    id: 'th-2',
    content:
      'หลังจากเริ่มต้นระบบ ให้เข้าถึงคอนโซลการจัดการ HCI ผ่านเบราว์เซอร์โดยใช้ข้อมูลประจำตัวเริ่มต้น admin/Fit@12345',
    score: 0.85,
    datasetId: 'test-ds',
    sourceName: 'เริ่มต้นอย่างรวดเร็ว.pdf',
    searchSource: 'vector',
    detectedLanguage: 'th'
  }
];

/** 中英混合 chunks（模拟多语言 KB） */
const MIXED_ZH_EN_CHUNKS: ChunkResult[] = [
  {
    id: 'mix-1',
    content: '超融合 HCI 默认管理员账号为 admin，默认密码为 Fit@12345。',
    score: 0.95,
    datasetId: 'test-ds',
    sourceName: 'HCI手册.pdf',
    searchSource: 'vector',
    detectedLanguage: 'zh'
  },
  {
    id: 'mix-2',
    content: 'The HCI system supports multiple authentication methods including LDAP and SAML.',
    score: 0.88,
    datasetId: 'test-ds',
    sourceName: 'Auth-Guide.pdf',
    searchSource: 'vector',
    detectedLanguage: 'en'
  },
  {
    id: 'mix-3',
    content: '超融合平台支持分布式部署，最小集群规模为3节点。',
    score: 0.82,
    datasetId: 'test-ds',
    sourceName: '部署指南.pdf',
    searchSource: 'fulltext',
    detectedLanguage: 'zh'
  },
  {
    id: 'mix-4',
    content: 'For high availability, deploy at least 3 nodes in the HCI cluster.',
    score: 0.78,
    datasetId: 'test-ds',
    sourceName: 'HA-Guide.pdf',
    searchSource: 'fulltext',
    detectedLanguage: 'en'
  },
  {
    id: 'mix-5',
    content: '性能优化建议：建议使用 SSD 存储池用于缓存加速。',
    score: 0.75,
    datasetId: 'test-ds',
    sourceName: '性能调优.pdf',
    searchSource: 'vector',
    detectedLanguage: 'zh'
  }
];

/** 低相关 chunks（用于测试不相关查询早停） */
const LOW_RELEVANCE_CHUNKS: ChunkResult[] = [
  {
    id: 'low-1',
    content: '公司员工手册第三章：考勤制度与请假流程说明。',
    score: 0.08,
    datasetId: 'test-ds',
    sourceName: 'HR手册.pdf',
    searchSource: 'vector',
    detectedLanguage: 'zh'
  },
  {
    id: 'low-2',
    content: 'Company holiday schedule for the fiscal year 2026.',
    score: 0.06,
    datasetId: 'test-ds',
    sourceName: 'HR-Policy.pdf',
    searchSource: 'fulltext',
    detectedLanguage: 'en'
  }
];

// ============================================================
// Unit Layer: 语言检测 & LanguageTracker 单元测试
// ============================================================

// ===== U1-U2: detectLang 准确性 =====

async function testU1CJKDetection(): Promise<TestCase> {
  return runCase('U1', 'detectLang CJK 检测', async () => {
    const cases: Array<{ text: string; expected: string }> = [
      { text: '超融合的默认密码是什么', expected: 'zh' },
      { text: '如何配置系统参数', expected: 'zh' },
      { text: 'システムの設定方法を教えてください', expected: 'ja' },
      { text: '日本語のテストです', expected: 'ja' },
      { text: 'HCI 기본 비밀번호는 무엇입니까', expected: 'ko' },
      { text: '안녕하세요', expected: 'ko' }
    ];
    const failures: string[] = [];
    for (const { text, expected } of cases) {
      const result = detectLang(text);
      if (result !== expected) {
        failures.push(`"${text.slice(0, 20)}..." → ${result} (expected ${expected})`);
      }
    }
    if (failures.length > 0) {
      return { status: 'fail', detail: failures.join('; ') };
    }
    return { status: 'pass', detail: `${cases.length} CJK texts detected correctly` };
  });
}

async function testU2NonCJKDetection(): Promise<TestCase> {
  return runCase('U2', 'detectLang 非CJK检测', async () => {
    const cases: Array<{ text: string; expected: string }> = [
      { text: 'What is the default password for HCI', expected: 'en' },
      { text: 'How do I configure the system settings', expected: 'en' },
      { text: 'Quel est le mot de passe par défaut', expected: 'fr' },
      { text: 'Was ist das Standardpasswort', expected: 'de' }
    ];
    const failures: string[] = [];
    for (const { text, expected } of cases) {
      const result = detectLang(text);
      if (result !== expected) {
        failures.push(`"${text.slice(0, 20)}..." → ${result} (expected ${expected})`);
      }
    }
    if (failures.length > 0) {
      return { status: 'fail', detail: failures.join('; ') };
    }
    return { status: 'pass', detail: `${cases.length} non-CJK texts detected` };
  });
}

// ===== U3-U5: buildLanguageConfig =====

async function testU3BuildConfigAuthoritative(): Promise<TestCase> {
  return runCase('U3', 'buildLanguageConfig L1 authoritative', async () => {
    // 中文占 83% > 70% → authoritative
    const { directive, trackerConfig } = buildLanguageConfig({ zh: 150, en: 30 }, 'en');
    const checks: string[] = [];
    if (trackerConfig.confidence !== 'authoritative')
      checks.push(`confidence=${trackerConfig.confidence}`);
    if (trackerConfig.defaultLang !== 'zh') checks.push(`defaultLang=${trackerConfig.defaultLang}`);
    if (!directive.includes('DEFAULT SEARCH LANGUAGE'))
      checks.push('missing DEFAULT SEARCH LANGUAGE');
    if (!directive.includes('Final answer MUST be in'))
      checks.push('missing Final answer directive');
    if (!directive.includes('User asked')) checks.push('missing user language hint');

    if (checks.length > 0) return { status: 'fail', detail: checks.join('; ') };
    return {
      status: 'pass',
      detail: `confidence=${trackerConfig.confidence}, default=${trackerConfig.defaultLang}`
    };
  });
}

async function testU4BuildConfigTentative(): Promise<TestCase> {
  return runCase('U4', 'buildLanguageConfig L2 tentative', async () => {
    const { directive, trackerConfig } = buildLanguageConfig({ zh: 60, en: 40, ja: 30 }, 'zh');
    const checks: string[] = [];
    if (trackerConfig.confidence !== 'tentative')
      checks.push(`confidence=${trackerConfig.confidence}`);
    if (!directive.includes('Monitor results')) checks.push('missing Monitor results hint');

    if (checks.length > 0) return { status: 'fail', detail: checks.join('; ') };
    return {
      status: 'pass',
      detail: `confidence=${trackerConfig.confidence}, default=${trackerConfig.defaultLang}`
    };
  });
}

async function testU5BuildConfigFallback(): Promise<TestCase> {
  return runCase('U5', 'buildLanguageConfig L3 fallback', async () => {
    const nullResult = buildLanguageConfig(null, 'ja');
    const undefinedResult = buildLanguageConfig(undefined, 'ko');
    const emptyResult = buildLanguageConfig({}, 'en');

    const checks: string[] = [];
    if (nullResult.trackerConfig.confidence !== 'fallback') checks.push('null→not fallback');
    if (undefinedResult.trackerConfig.confidence !== 'fallback')
      checks.push('undefined→not fallback');
    if (emptyResult.trackerConfig.confidence !== 'fallback') checks.push('empty→not fallback');
    if (!nullResult.directive.includes('Start with user language'))
      checks.push('null: missing user lang hint');
    if (!undefinedResult.directive.includes('Start with user language'))
      checks.push('undefined: missing user lang hint');

    if (checks.length > 0) return { status: 'fail', detail: checks.join('; ') };
    return { status: 'pass', detail: 'null/undefined/empty stats all → fallback' };
  });
}

// ===== U6-U10: LanguageTracker =====

async function testU6TrackerNormalPath(): Promise<TestCase> {
  return runCase('U6', 'LanguageTracker 正常路径', async () => {
    const tracker = LanguageTracker.fromConfig({
      defaultLang: 'zh',
      userLang: 'zh',
      confidence: 'authoritative'
    });
    // 中文 query → 中文结果 → 正常
    tracker.recordSearch('系统配置', [
      makeChunk({ id: '1', detectedLanguage: 'zh', score: 0.5 }),
      makeChunk({ id: '2', detectedLanguage: 'zh', score: 0.5 })
    ]);
    const result = tracker.buildGuidance([makeChunk({ score: 0.8 })]);
    if (result.shouldPush !== false || result.guidance !== null) {
      return {
        status: 'fail',
        detail: `shouldPush=${result.shouldPush}, guidance=${result.guidance}`
      };
    }
    return { status: 'pass', detail: 'no guidance on language match' };
  });
}

async function testU7TrackerAnomalyDetection(): Promise<TestCase> {
  return runCase('U7', 'LanguageTracker 异常检测', async () => {
    const tracker = LanguageTracker.fromConfig({
      defaultLang: 'ja',
      userLang: 'zh',
      confidence: 'authoritative'
    });
    // 中文 query → 英文结果 ≠ ja default → 异常
    tracker.recordSearch('API认证配置', [
      makeChunk({ id: '1', detectedLanguage: 'en' }),
      makeChunk({ id: '2', detectedLanguage: 'en' }),
      makeChunk({ id: '3', detectedLanguage: 'en' })
    ]);
    // 低分 → 确认异常
    const result = tracker.buildGuidance([makeChunk({ score: 0.1 })]);
    if (!result.shouldPush || !result.suppressEarlyStop) {
      return {
        status: 'fail',
        detail: `shouldPush=${result.shouldPush}, suppressEarlyStop=${result.suppressEarlyStop}`
      };
    }
    if (!result.guidance?.includes('⚠ LANGUAGE')) {
      return { status: 'fail', detail: `guidance missing ⚠ LANGUAGE: ${result.guidance}` };
    }
    return { status: 'pass', detail: `guidance: ${result.guidance}` };
  });
}

async function testU8TrackerDedup(): Promise<TestCase> {
  return runCase('U8', 'LanguageTracker 去重', async () => {
    const tracker = LanguageTracker.fromConfig({
      defaultLang: 'ja',
      userLang: 'zh',
      confidence: 'authoritative'
    });
    tracker.recordSearch('测试', [
      makeChunk({ id: '1', detectedLanguage: 'en' }),
      makeChunk({ id: '2', detectedLanguage: 'en' })
    ]);
    // 第一次 → push
    const r1 = tracker.buildGuidance([makeChunk({ score: 0.1 })]);
    if (!r1.shouldPush) return { status: 'fail', detail: 'first call should push' };

    // 第二次相同 anomaly → 去重
    const r2 = tracker.buildGuidance([makeChunk({ score: 0.1 })]);
    if (r2.shouldPush !== false || r2.suppressEarlyStop !== true) {
      return {
        status: 'fail',
        detail: `dedup failed: shouldPush=${r2.shouldPush}, suppress=${r2.suppressEarlyStop}`
      };
    }
    return { status: 'pass', detail: 'first push, second dedup+suppress' };
  });
}

async function testU9TrackerCrossLingualBypass(): Promise<TestCase> {
  return runCase('U9', 'LanguageTracker 跨语言绕过', async () => {
    const tracker = LanguageTracker.fromConfig({
      defaultLang: 'ja',
      userLang: 'zh',
      confidence: 'authoritative'
    });
    tracker.recordSearch('API', [
      makeChunk({ id: '1', detectedLanguage: 'en' }),
      makeChunk({ id: '2', detectedLanguage: 'en' })
    ]);
    // 语言不匹配但高分 → 跨语言 embedding 生效，沉默
    const result = tracker.buildGuidance([makeChunk({ score: 0.5, rerankScore: 0.6 })]);
    if (result.shouldPush !== false) {
      return {
        status: 'fail',
        detail: `cross-lingual bypass failed: shouldPush=${result.shouldPush}`
      };
    }
    return { status: 'pass', detail: 'high score bypassed language anomaly' };
  });
}

async function testU10TrackerUserLangDisconnect(): Promise<TestCase> {
  return runCase('U10', 'LanguageTracker 用户语言断连', async () => {
    // KB 泰文为主，用户英文提问
    const tracker = LanguageTracker.fromConfig({
      defaultLang: 'th',
      userLang: 'en',
      confidence: 'authoritative'
    });
    tracker.recordSearch('ผู้เขียนหนังสือสามก๊ก', [
      makeChunk({ id: '1', detectedLanguage: 'th' }),
      makeChunk({ id: '2', detectedLanguage: 'th' })
    ]);
    const result = tracker.buildGuidance([makeChunk({ score: 0.1 })]);
    if (!result.shouldPush || !result.guidance?.includes('en')) {
      return {
        status: 'fail',
        detail: `shouldPush=${result.shouldPush}, guidance=${result.guidance}`
      };
    }
    return { status: 'pass', detail: `guidance: ${result.guidance}` };
  });
}

// ===== U12: LanguageTracker 多轮语言切换 =====

async function testU12MultiRoundSwitch(): Promise<TestCase> {
  return runCase('U12', 'LanguageTracker 多轮语言切换不互相干扰', async () => {
    // 场景：KB 中英混合(tentative)，用户多轮搜索中多次触发语言异常
    // 验证 clearAnomaly 后新一轮异常不会被旧 activeAnomaly 误压制
    const tracker = LanguageTracker.fromConfig({
      defaultLang: 'zh',
      userLang: 'en',
      confidence: 'tentative'
    });

    const lowScore = makeChunk({ score: 0.1 }); // 触发异常的低分 chunk
    const highScore = makeChunk({ score: 0.5, rerankScore: 0.5 }); // 高分 chunk

    // ── Round 1: zh query → en results → 语言不匹配 + 低分 → 异常 ──
    tracker.recordSearch('超融合默认密码', [
      makeChunk({ id: '1', detectedLanguage: 'en' }),
      makeChunk({ id: '2', detectedLanguage: 'en' }),
      makeChunk({ id: '3', detectedLanguage: 'en' })
    ]);
    const r1 = tracker.buildGuidance([lowScore]);
    if (!r1.shouldPush || !r1.suppressEarlyStop) {
      return {
        status: 'fail',
        detail: `Round1: expected anomaly pushed, got shouldPush=${r1.shouldPush} suppress=${r1.suppressEarlyStop}`
      };
    }
    if (!r1.guidance?.includes('MISMATCH')) {
      return { status: 'fail', detail: `Round1: guidance missing anomaly marker: ${r1.guidance}` };
    }

    // ── Round 2: 相同异常再次触发 → 去重 ──
    const r2 = tracker.buildGuidance([lowScore]);
    if (r2.shouldPush !== false || r2.suppressEarlyStop !== true) {
      return {
        status: 'fail',
        detail: `Round2: expected dedup (shouldPush=false, suppress=true), got shouldPush=${r2.shouldPush} suppress=${r2.suppressEarlyStop}`
      };
    }

    // ── 模拟 agent 处理了改写 guidance → clearAnomaly ──
    tracker.clearAnomaly();

    // ── Round 3: 改写后 en query → en results → 正常（语言匹配）──
    tracker.recordSearch('HCI default password', [
      makeChunk({ id: '4', detectedLanguage: 'en' }),
      makeChunk({ id: '5', detectedLanguage: 'en' })
    ]);
    const r3 = tracker.buildGuidance([highScore]);
    if (r3.shouldPush !== false) {
      return {
        status: 'fail',
        detail: `Round3: expected normal (no push) after rewrite, got shouldPush=${r3.shouldPush}`
      };
    }

    // ── Round 4: ja query → ko results → 新的语言不匹配 + 低分 → 新异常 ──
    tracker.recordSearch('パスワードをリセットする方法', [
      makeChunk({ id: '6', detectedLanguage: 'ko' }),
      makeChunk({ id: '7', detectedLanguage: 'ko' }),
      makeChunk({ id: '8', detectedLanguage: 'ko' })
    ]);
    const r4 = tracker.buildGuidance([lowScore]);
    if (!r4.shouldPush || !r4.suppressEarlyStop) {
      return {
        status: 'fail',
        detail: `Round4: expected NEW anomaly (ja→ko) pushed, got shouldPush=${r4.shouldPush} suppress=${r4.suppressEarlyStop}`
      };
    }
    if (!r4.guidance?.includes('MISMATCH')) {
      return { status: 'fail', detail: `Round4: guidance missing anomaly marker: ${r4.guidance}` };
    }

    // ── Round 5: 相同 ja→ko 异常 → 去重 ──
    const r5 = tracker.buildGuidance([lowScore]);
    if (r5.shouldPush !== false || r5.suppressEarlyStop !== true) {
      return {
        status: 'fail',
        detail: `Round5: expected dedup for ja→ko, got shouldPush=${r5.shouldPush} suppress=${r5.suppressEarlyStop}`
      };
    }

    // ── clearAnomaly → 新一轮 ──
    tracker.clearAnomaly();

    // ── Round 6: 再次 zh query → en results → 应作为新一轮异常触发（不是旧 zh→en 的延续）──
    tracker.recordSearch('超融合管理员密码', [
      makeChunk({ id: '9', detectedLanguage: 'en' }),
      makeChunk({ id: '10', detectedLanguage: 'en' })
    ]);
    const r6 = tracker.buildGuidance([lowScore]);
    if (!r6.shouldPush) {
      return {
        status: 'fail',
        detail: `Round6: expected fresh anomaly after clearAnomaly, got shouldPush=${r6.shouldPush}`
      };
    }

    return {
      status: 'pass',
      detail:
        'multi-round switch: zh→en(ok) dedup(ok) clear→normal(ok) ja→ko(ok) dedup(ok) clear→zh→en(ok)'
    };
  });
}

async function testU11GetTargetLanguages(): Promise<TestCase> {
  return runCase('U11', 'getTargetLanguages 目标语言', async () => {
    // authoritative → 空
    const authResult = getTargetLanguages(
      { defaultLang: 'zh', userLang: 'en', confidence: 'authoritative' },
      { zh: 150, en: 30 }
    );
    if (authResult.length !== 0)
      return { status: 'fail', detail: `authoritative should return empty, got ${authResult}` };

    // tentative with en > 10% → 应返回 en
    const tentResult = getTargetLanguages(
      { defaultLang: 'zh', userLang: 'en', confidence: 'tentative' },
      { zh: 60, en: 40, ja: 5 }
    );
    if (!tentResult.includes('en'))
      return { status: 'fail', detail: `should include en, got ${tentResult}` };

    return { status: 'pass', detail: `authoritative=[], tentative=${JSON.stringify(tentResult)}` };
  });
}

// ===== U13: sampleLanguageDistribution 等效逻辑验证 =====

async function testU13SampleLanguageLogic(): Promise<TestCase> {
  return runCase('U13', 'sampleLanguageDistribution 语言检测等价逻辑', async () => {
    // 模拟 sampleLanguageDistribution 对 doc.q 做 detectLang 的逻辑
    // 验证移除 q.length >= 10 门控后，短中文文本也能正确识别
    const docs: Array<{ q: string; expected: string }> = [
      {
        q: '超融合 HCI 默认管理员账号为 admin，默认密码为 Fit@12345，首次登录后请立即修改密码。',
        expected: 'zh'
      },
      { q: '默认密码', expected: 'zh' },
      { q: 'What is the default password for HCI', expected: 'en' },
      { q: 'パスワード', expected: 'ja' },
      { q: '超融合', expected: 'zh' },
      { q: 'admin', expected: 'en' },
      { q: '系统配置', expected: 'zh' },
      { q: 'การกำหนดค่า', expected: 'th' },
      { q: '短', expected: 'zh' },
      { q: 'HCI', expected: 'en' }
    ];
    const failures: string[] = [];
    for (const { q, expected } of docs) {
      const result = detectLang(q);
      if (result !== expected) {
        failures.push(`"${q}" → ${result} (expected ${expected})`);
      }
    }
    if (failures.length > 0) {
      return { status: 'fail', detail: failures.join('; ') };
    }
    return { status: 'pass', detail: `${docs.length} docs detected correctly` };
  });
}

// ============================================================
// Agent Layer: 多语言执行轨迹验证（需要真实 LLM + Mock 搜索）
// ============================================================
//
// 坐标系:
//   - 语言探测: queryLanguage 字段是否与用户问题语言一致
//   - Prompt 信号注入: L1/L2/L3 配置下搜索行为差异
//   - 搜索语言选择: searchQueries 是否使用正确的默认搜索语言
//   - 回答语言合规: answer 是否以用户语言输出
//   - 高分早停: 相关 chunks 命中后是否在预算内停止搜索
//   - 低分停止: 不相关查询是否早停或 refuse
//   - 语种不匹配压制: 跨语言高分场景是否绕过异常信号

// ============================================================
// 轨迹分析辅助
// ============================================================

/** 从 AgenticSearchResult 提取关键轨迹信息 */
interface TrajectoryInfo {
  queryLanguage: string;
  playbook: string;
  analysis: string;
  executionPath: string[];
  searchQueries: string[];
  searchCount: number;
  toolCallCount: number;
  refuse: boolean;
  hasAnswer: boolean;
  answerPreview: string;
  answerInUserLang: boolean;
  chunksCount: number;
  chunkLanguages: Record<string, number>;
  confidence?: number;
  reasoningText: string;
  ttftMs?: number;
  citedIds: string[];
  reflectionLabel: string;
  reflectionReason: string;
  embeddingTokens: number;
  rerankInputTokens: number;
  llmInputTokens: number;
  llmOutputTokens: number;
}

function analyzeTrajectory(result: AgenticSearchResult, expectedUserLang: string): TrajectoryInfo {
  const answer = result.answer ?? '';
  const hasAnswer = answer.trim().length > 5;

  const userLangLower = expectedUserLang.toLowerCase();
  let answerInUserLang = false;
  if (userLangLower === 'zh') {
    answerInUserLang = /[一-鿿]/.test(answer);
  } else if (userLangLower === 'en') {
    answerInUserLang = /^[A-Za-z]/.test(answer.trim()) && !/[一-鿿]/.test(answer);
  } else if (userLangLower === 'ja') {
    answerInUserLang = /[぀-ゟ゠-ヿ]/.test(answer);
  } else if (userLangLower === 'ko') {
    answerInUserLang = /[가-힯]/.test(answer);
  } else {
    answerInUserLang = true;
  }

  // 统计 chunks 语言分布
  const chunkLanguages: Record<string, number> = {};
  for (const c of result.chunks) {
    const lang = c.detectedLanguage || 'unknown';
    chunkLanguages[lang] = (chunkLanguages[lang] || 0) + 1;
  }

  return {
    queryLanguage: result.queryLanguage ?? 'N/A',
    playbook: result.playbook,
    analysis: result.analysis ?? '',
    executionPath: result.executionPath,
    searchQueries: result.searchQueries,
    searchCount: result.searchCount,
    toolCallCount: result.toolCallCount,
    refuse: result.refuse ?? false,
    hasAnswer,
    answerPreview: answer.slice(0, 100),
    answerInUserLang,
    chunksCount: result.chunks.length,
    chunkLanguages,
    confidence: result.confidence,
    reasoningText: result.reasoningText ?? '',
    ttftMs: result.ttftMs,
    citedIds: result.citedIds ?? [],
    reflectionLabel: result.reflectionLabel ?? '',
    reflectionReason: result.reflectionReason ?? '',
    embeddingTokens: result.embeddingTokens,
    rerankInputTokens: result.rerankInputTokens,
    llmInputTokens: result.llmInputTokens,
    llmOutputTokens: result.llmOutputTokens
  };
}

/** 将轨迹信息渲染为 info Record，供 printLayerResults 展示 */
function renderTrajectoryInfo(t: TrajectoryInfo): Record<string, unknown> {
  return {
    query_lang: t.queryLanguage,
    playbook: t.playbook,
    analysis: t.analysis ? t.analysis.replace(/\n/g, '\\n') : '(none)',
    exec_path: t.executionPath.join(' → '),
    path_steps: t.executionPath.length,
    search_queries: t.searchQueries.length > 0 ? `[${t.searchQueries.join(' | ')}]` : '(none)',
    search_count: t.searchCount,
    tool_calls: t.toolCallCount,
    refuse: t.refuse,
    answer_lang_ok: t.answerInUserLang,
    answer_preview: t.answerPreview.replace(/\n/g, '\\n'),
    chunks: `${t.chunksCount} chunks ${JSON.stringify(t.chunkLanguages)}`,
    confidence: t.confidence ?? 'N/A',
    reasoning: t.reasoningText ? t.reasoningText.slice(0, 200).replace(/\n/g, '\\n') : '(none)',
    ttft_ms: t.ttftMs ?? 'N/A',
    cited_ids: t.citedIds.length > 0 ? `[${t.citedIds.join(', ')}]` : '(none)',
    reflection: t.reflectionLabel
      ? `${t.reflectionLabel}${t.reflectionReason ? ': ' + t.reflectionReason : ''}`
      : '(none)',
    tokens: `embed=${t.embeddingTokens} rerank=${t.rerankInputTokens} llm_in=${t.llmInputTokens} llm_out=${t.llmOutputTokens}`
  };
}

/** 构建 pass TestCase，附带完整轨迹 info */
function passTrajectory(
  detail: string,
  t: TrajectoryInfo
): Omit<TestCase, 'id' | 'name' | 'durationMs'> {
  return { status: 'pass', detail, info: renderTrajectoryInfo(t) };
}

function buildAgentProviders(cfg: MultiLangConfig, mockChunks: ChunkResult[]) {
  const llm = new DirectLLMProvider(cfg.model, cfg.endpoint, cfg.apiKey, cfg.timeoutMs, logger);
  return {
    llm,
    vectorSearch: new MockVectorSearchProvider(mockChunks),
    fullTextSearch: new MockFullTextSearchProvider(mockChunks),
    embed: new MockEmbeddingProvider(1536),
    logger
  };
}

async function runAgent(
  cfg: MultiLangConfig,
  question: string,
  mockChunks: ChunkResult[],
  initialLanguageStats?: Record<string, number> | null
): Promise<AgenticSearchResult> {
  const providers = buildAgentProviders(cfg, mockChunks);
  const agent = createAgenticSearch({
    providers,
    config: { maxSearchCalls: 3, maxToolCalls: 8, tokenBudget: 16000 },
    mode: 'auto'
  });

  const stream = agent.stream({
    query: question,
    datasetIds: ['test-dataset'],
    history: [],
    priorContext: '',
    initialLanguageStats
  });

  let result: AgenticSearchResult | undefined;
  for await (const item of stream) {
    if ('chunks' in item && 'searchCount' in item) {
      result = item as AgenticSearchResult;
    }
  }
  if (!result) throw new Error('No result from agent stream');
  return result;
}

// ============================================================
// A1: 单语 — query/answer 语言一致性
// ============================================================

// —— A1a: 中文 query+KB → 搜索词为中文，回答为中文
async function testA1aZhMonoLang(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A1a', '单语:中文query→中文搜索+回答', async () => {
    const result = await runAgent(cfg, '超融合的默认密码是什么', ZH_CHUNKS, { zh: 200, en: 10 });
    const t = analyzeTrajectory(result, 'zh');
    const issues: string[] = [];
    if (!t.hasAnswer) issues.push('no answer');
    if (!t.answerInUserLang) issues.push(`answer not in zh: "${t.answerPreview}"`);
    // L1 authoritative zh → 搜索词应为中文
    if (t.searchQueries.length > 0 && !/[一-鿿]/.test(t.searchQueries.join(' '))) {
      issues.push(`search queries not in zh: ${JSON.stringify(t.searchQueries)}`);
    }
    if (t.searchCount > 2) issues.push(`excessive searches: ${t.searchCount}`);
    if (issues.length > 0) return { status: 'fail', detail: issues.join('; ') };
    return passTrajectory(
      [
        `queryLang=${t.queryLanguage}`,
        `playbook=${t.playbook}`,
        `searches=${t.searchCount}`,
        `queries=${JSON.stringify(t.searchQueries.slice(0, 2))}`,
        `answer_zh=${t.answerInUserLang}`,
        `path=${t.executionPath}`
      ].join(', '),
      t
    );
  });
}

// —— A1b: 英文 query+KB → 搜索词为英文，回答为英文
async function testA1bEnMonoLang(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A1b', '单语:英文query→英文搜索+回答', async () => {
    const result = await runAgent(cfg, 'What is the default password for HCI', EN_CHUNKS, {
      en: 200,
      zh: 10
    });
    const t = analyzeTrajectory(result, 'en');
    const issues: string[] = [];
    if (!t.hasAnswer) issues.push('no answer');
    if (!t.answerInUserLang) issues.push(`answer not in en: "${t.answerPreview}"`);
    if (t.searchCount > 2) issues.push(`excessive searches: ${t.searchCount}`);
    if (issues.length > 0) return { status: 'fail', detail: issues.join('; ') };
    return passTrajectory(
      [
        `queryLang=${t.queryLanguage}`,
        `playbook=${t.playbook}`,
        `searches=${t.searchCount}`,
        `queries=${JSON.stringify(t.searchQueries.slice(0, 2))}`,
        `answer_en=${t.answerInUserLang}`,
        `path=${t.executionPath}`
      ].join(', '),
      t
    );
  });
}

// —— A1c: 日文 query+KB
async function testA1cJaMonoLang(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A1c', '单语:日文query→日文搜索+回答', async () => {
    const result = await runAgent(cfg, 'HCIのデフォルトパスワードは何ですか', JA_CHUNKS, {
      ja: 200
    });
    const t = analyzeTrajectory(result, 'ja');
    const issues: string[] = [];
    if (!t.hasAnswer) issues.push('no answer');
    if (!t.answerInUserLang) issues.push(`answer not in ja: "${t.answerPreview}"`);
    if (t.searchCount > 2) issues.push(`excessive searches: ${t.searchCount}`);
    if (issues.length > 0) return { status: 'fail', detail: issues.join('; ') };
    return passTrajectory(
      [
        `queryLang=${t.queryLanguage}`,
        `playbook=${t.playbook}`,
        `searches=${t.searchCount}`,
        `queries=${JSON.stringify(t.searchQueries.slice(0, 2))}`,
        `answer_ja=${t.answerInUserLang}`,
        `path=${t.executionPath}`
      ].join(', '),
      t
    );
  });
}

// —— A1d: 韩文 query+KB
async function testA1dKoMonoLang(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A1d', '单语:韩文query→韩文搜索+回答', async () => {
    const result = await runAgent(cfg, 'HCI 기본 비밀번호는 무엇입니까', KO_CHUNKS, { ko: 150 });
    const t = analyzeTrajectory(result, 'ko');
    const issues: string[] = [];
    if (!t.hasAnswer) issues.push('no answer');
    if (!t.answerInUserLang) issues.push(`answer not in ko: "${t.answerPreview}"`);
    if (t.searchCount > 2) issues.push(`excessive searches: ${t.searchCount}`);
    if (issues.length > 0) return { status: 'fail', detail: issues.join('; ') };
    return passTrajectory(
      [
        `queryLang=${t.queryLanguage}`,
        `playbook=${t.playbook}`,
        `searches=${t.searchCount}`,
        `queries=${JSON.stringify(t.searchQueries.slice(0, 2))}`,
        `answer_ko=${t.answerInUserLang}`,
        `path=${t.executionPath}`
      ].join(', '),
      t
    );
  });
}

// ============================================================
// A2: 跨语言 L1 Authoritative — 搜索语言≠用户语言，回答必须用用户语言
// ============================================================

// —— A2a: KB 中文为主(L1)，用户英文提问 → 搜索用中文，回答用英文
async function testA2aCrossL1EnZh(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A2a', '跨语言L1:EN用户+ZH KB→ZH搜索EN回答', async () => {
    const result = await runAgent(cfg, 'What is the default password for HCI', ZH_CHUNKS, {
      zh: 180,
      en: 20
    });
    const t = analyzeTrajectory(result, 'en');
    const issues: string[] = [];
    if (!t.hasAnswer) issues.push('no answer');
    if (!t.answerInUserLang) issues.push(`answer not in en: "${t.answerPreview}"`);
    if (t.searchCount > 2) issues.push(`excessive searches: ${t.searchCount}`);
    if (issues.length > 0) return { status: 'fail', detail: issues.join('; ') };
    return passTrajectory(
      [
        `queryLang=${t.queryLanguage}`,
        `playbook=${t.playbook}`,
        `searches=${t.searchCount}`,
        `queries=${JSON.stringify(t.searchQueries.slice(0, 2))}`,
        `answer_en=${t.answerInUserLang}`,
        `path=${t.executionPath}`
      ].join(', '),
      t
    );
  });
}

// —— A2b: KB 英文为主(L1)，用户中文提问 → 搜索用英文，回答用中文
async function testA2bCrossL1ZhEn(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A2b', '跨语言L1:ZH用户+EN KB→EN搜索ZH回答', async () => {
    const result = await runAgent(cfg, '超融合的默认密码是什么', EN_CHUNKS, { en: 180, zh: 20 });
    const t = analyzeTrajectory(result, 'zh');
    const issues: string[] = [];
    if (!t.hasAnswer) issues.push('no answer');
    if (!t.answerInUserLang) issues.push(`answer not in zh: "${t.answerPreview}"`);
    if (t.searchCount > 2) issues.push(`excessive searches: ${t.searchCount}`);
    if (issues.length > 0) return { status: 'fail', detail: issues.join('; ') };
    return passTrajectory(
      [
        `queryLang=${t.queryLanguage}`,
        `playbook=${t.playbook}`,
        `searches=${t.searchCount}`,
        `queries=${JSON.stringify(t.searchQueries.slice(0, 2))}`,
        `answer_zh=${t.answerInUserLang}`,
        `path=${t.executionPath}`
      ].join(', '),
      t
    );
  });
}

// —— A2c: KB 日文为主(L1)，用户中文提问 → 搜索用日文，回答用中文
async function testA2cCrossL1ZhJa(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A2c', '跨语言L1:ZH用户+JA KB→JA搜索ZH回答', async () => {
    const result = await runAgent(cfg, 'HCI的默认管理员密码是什么', JA_CHUNKS, { ja: 200, zh: 10 });
    const t = analyzeTrajectory(result, 'zh');
    const issues: string[] = [];
    if (!t.hasAnswer) issues.push('no answer');
    if (!t.answerInUserLang) issues.push(`answer not in zh: "${t.answerPreview}"`);
    if (t.searchCount > 2) issues.push(`excessive searches: ${t.searchCount}`);
    if (issues.length > 0) return { status: 'fail', detail: issues.join('; ') };
    return passTrajectory(
      [
        `queryLang=${t.queryLanguage}`,
        `playbook=${t.playbook}`,
        `searches=${t.searchCount}`,
        `queries=${JSON.stringify(t.searchQueries.slice(0, 2))}`,
        `answer_zh=${t.answerInUserLang}`,
        `path=${t.executionPath}`
      ].join(', '),
      t
    );
  });
}

// ============================================================
// A3: 混合 KB L2 Tentative — 多语言探测信号
// ============================================================

// —— A3a: KB 中英混合(tentative zh)，英文提问 → 应监控结果调整
async function testA3aMixedTentative(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A3a', '混合KB L2:EN用户+中英KB→应监控多语言', async () => {
    const result = await runAgent(cfg, 'What is the default password for HCI', MIXED_ZH_EN_CHUNKS, {
      zh: 80,
      en: 70
    });
    const t = analyzeTrajectory(result, 'en');
    const issues: string[] = [];
    if (!t.hasAnswer) issues.push('no answer');
    if (!t.answerInUserLang) issues.push(`answer not in en: "${t.answerPreview}"`);
    if (t.searchCount > 2) issues.push(`excessive searches: ${t.searchCount}`);
    if (issues.length > 0) return { status: 'fail', detail: issues.join('; ') };
    return passTrajectory(
      [
        `queryLang=${t.queryLanguage}`,
        `playbook=${t.playbook}`,
        `searches=${t.searchCount}`,
        `queries=${JSON.stringify(t.searchQueries.slice(0, 2))}`,
        `answer_en=${t.answerInUserLang}`,
        `path=${t.executionPath}`
      ].join(', '),
      t
    );
  });
}

// ============================================================
// A4: Fallback L3 — 无语言统计数据
// ============================================================

async function testA4aFallbackNoStats(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A4a', 'L3 Fallback:无统计数据→用户语言兜底', async () => {
    const result = await runAgent(cfg, 'How do I reset the HCI admin password', EN_CHUNKS, null);
    const t = analyzeTrajectory(result, 'en');
    const issues: string[] = [];
    if (!t.hasAnswer) issues.push('no answer');
    // Fallback 场景：搜索语言应与用户语言一致
    if (t.searchCount > 3) issues.push(`excessive searches without stats: ${t.searchCount}`);
    if (issues.length > 0) return { status: 'fail', detail: issues.join('; ') };
    return passTrajectory(
      [
        `queryLang=${t.queryLanguage}`,
        `playbook=${t.playbook}`,
        `searches=${t.searchCount}`,
        `queries=${JSON.stringify(t.searchQueries.slice(0, 2))}`,
        `answer_en=${t.answerInUserLang}`,
        `path=${t.executionPath}`
      ].join(', '),
      t
    );
  });
}

// ============================================================
// A5: 低分早停 — 不相关查询应在预算内停止
// ============================================================

// —— A5a: 中文不相关查询
async function testA5aIrrelevantZh(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A5a', '低分早停:中文不相关query→应早停', async () => {
    const result = await runAgent(cfg, '公司目前一共有多少名员工', LOW_RELEVANCE_CHUNKS, {
      zh: 50
    });
    const t = analyzeTrajectory(result, 'zh');
    const withinBudget = t.searchCount <= 3;
    const isRefuse = t.refuse;
    if (!isRefuse && !withinBudget) {
      return { status: 'fail', detail: `searchCount=${t.searchCount} exceeded 3, no early stop` };
    }
    return passTrajectory(
      [
        `refuse=${isRefuse}`,
        `searchCount=${t.searchCount}`,
        `toolCalls=${t.toolCallCount}`,
        `queries=${JSON.stringify(t.searchQueries.slice(0, 3))}`,
        `path=${t.executionPath}`
      ].join(', '),
      t
    );
  });
}

// —— A5b: 英文不相关查询（跨语言 low-score）
async function testA5bIrrelevantEn(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A5b', '低分早停:英文不相关query→应早停', async () => {
    const result = await runAgent(
      cfg,
      'How many employees does the company have',
      LOW_RELEVANCE_CHUNKS,
      { zh: 30, en: 20 }
    );
    const t = analyzeTrajectory(result, 'en');
    const withinBudget = t.searchCount <= 3;
    const isRefuse = t.refuse;
    if (!isRefuse && !withinBudget) {
      return { status: 'fail', detail: `searchCount=${t.searchCount} exceeded 3, no early stop` };
    }
    return passTrajectory(
      [
        `refuse=${isRefuse}`,
        `searchCount=${t.searchCount}`,
        `toolCalls=${t.toolCallCount}`,
        `queries=${JSON.stringify(t.searchQueries.slice(0, 3))}`,
        `path=${t.executionPath}`
      ].join(', '),
      t
    );
  });
}

// ============================================================
// A6: 高分早停 — 相关结果命中后不再重复搜索
// ============================================================

async function testA6aHighScoreEarlyStop(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A6a', '高分早停:相关结果→≤2次搜索', async () => {
    const result = await runAgent(cfg, '超融合的默认密码是什么', ZH_CHUNKS, { zh: 200 });
    const t = analyzeTrajectory(result, 'zh');
    // 高分相关 chunks → agent 应在 1-2 次搜索后进入 summary
    if (t.searchCount > 2) {
      return {
        status: 'fail',
        detail: `expected ≤2 searches for high-score case, got ${t.searchCount}. path=${t.executionPath}`
      };
    }
    return passTrajectory(
      [
        `searches=${t.searchCount}`,
        `toolCalls=${t.toolCallCount}`,
        `path=${t.executionPath}`,
        `answer="${t.answerPreview}"`
      ].join(', '),
      t
    );
  });
}

// ============================================================
// A7: 语种不匹配信号压制 — 跨语言高分应绕过异常
// ============================================================

// —— A7a: 英文用户 + 中文 KB(L1) + 高分 → 跨语言生效，不走异常信号
async function testA7aCrossLingualSuppression(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A7a', '信号压制:跨语言高分→绕过语言异常', async () => {
    const result = await runAgent(cfg, 'What is the default HCI password', ZH_CHUNKS, {
      zh: 180,
      en: 20
    });
    const t = analyzeTrajectory(result, 'en');
    // 跨语言高分场景：chunks(中文) 与 query(英文) 语言不匹配，但内容高度相关
    // verify: agent 不会陷入搜索循环，1 次搜索后即 summary
    if (t.searchCount > 2) {
      return {
        status: 'fail',
        detail: `cross-lingual anomaly not suppressed: ${t.searchCount} searches. path=${t.executionPath}`
      };
    }
    if (!t.hasAnswer) return { status: 'fail', detail: 'no answer in cross-lingual scenario' };
    return passTrajectory(
      [
        `searches=${t.searchCount}`,
        `queries=${JSON.stringify(t.searchQueries.slice(0, 2))}`,
        `answer_en=${t.answerInUserLang}`,
        `path=${t.executionPath}`
      ].join(', '),
      t
    );
  });
}

// ============================================================
// A8: 小语种场景 — 泰文 KB + 英文用户（ISO 639-3 边界）
// ============================================================

async function testA8aThaiSmallLang(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A8a', '小语种:泰文KB(tha)+EN用户→健壮运行', async () => {
    const result = await runAgent(cfg, 'What is the HCI default password', TH_CHUNKS, { th: 100 });
    const t = analyzeTrajectory(result, 'en');
    if (!t.hasAnswer) return { status: 'fail', detail: 'agent crashed on Thai KB' };
    if (t.searchCount > 3) {
      return { status: 'fail', detail: `excessive searches on Thai KB: ${t.searchCount}` };
    }
    return passTrajectory(
      [
        `queryLang=${t.queryLanguage}`,
        `playbook=${t.playbook}`,
        `searches=${t.searchCount}`,
        `queries=${JSON.stringify(t.searchQueries.slice(0, 2))}`,
        `answer="${t.answerPreview}"`,
        `path=${t.executionPath}`
      ].join(', '),
      t
    );
  });
}

// ============================================================
// Staged Mock: 分阶段返回不同 chunks，模拟"跨语言首轮低分 →改写→ 同语言高分"
// ============================================================

// ============================================================
// Language-Aware Mock: 根据查询语言返回不同 chunks
// 模拟真实跨语言场景：KB 语言查询 → 高分，非 KB 语言查询 → 低分
// ============================================================

class LanguageAwareFullTextSearchProvider {
  public readonly type = 'fastgpt' as const;

  /** KB 主要语言集合 */
  private kbLangs: Set<string>;
  /** 非 KB 语言查询返回的 chunks（模拟跨语言检索失败） */
  private crossLangChunks: ChunkResult[];
  /** KB 语言查询返回的 chunks（模拟同语言检索成功） */
  private sameLangChunks: ChunkResult[];

  constructor(
    sameLangChunks: ChunkResult[],
    crossLangChunks: ChunkResult[],
    kbLangs: string[] = ['zh', 'en']
  ) {
    this.sameLangChunks = sameLangChunks;
    this.crossLangChunks = crossLangChunks;
    this.kbLangs = new Set(kbLangs);
  }

  async search(
    query: string,
    _datasetIds: string[],
    options: { limit: number }
  ): Promise<SearchResult<ChunkResult>> {
    const queryLang = detectLang(query);
    const isKbLang = this.kbLangs.has(queryLang);
    const chunks = isKbLang ? this.sameLangChunks : this.crossLangChunks;
    return createSearchResult(chunks.slice(0, options.limit), 'fulltext', 'mock-lang-aware');
  }
}

// ============================================================
// 辅助：基于查询语言的路由 Agent（用于多语言动态切换测试）
// LanguageAwareFullTextSearchProvider 根据 query 语言返回不同 chunks：
//   KB 语言(zh/en) → MIXED_ZH_EN_CHUNKS(高分)  非KB语言 → LOW_RELEVANCE_CHUNKS(低分)
// ============================================================

function buildLangAwareAgent(cfg: MultiLangConfig, question: string) {
  const llm = new DirectLLMProvider(cfg.model, cfg.endpoint, cfg.apiKey, cfg.timeoutMs, logger);
  const providers = {
    llm,
    vectorSearch: new MockVectorSearchProvider([]),
    fullTextSearch: new LanguageAwareFullTextSearchProvider(
      MIXED_ZH_EN_CHUNKS,
      LOW_RELEVANCE_CHUNKS,
      ['zh', 'en']
    ),
    embed: new MockEmbeddingProvider(1536),
    logger
  };
  return createAgenticSearch({
    providers: providers as any,
    config: { maxSearchCalls: 3, maxToolCalls: 8, tokenBudget: 16000 },
    mode: 'auto'
  });
}

// ============================================================
// A9: 动态语言检测 → 改写 → 重搜（老知识库无语言探测）
// ============================================================
// 场景：中英混合 KB（老知识库，无 initialLanguageStats），用户用小语种提问。
// Stage 0: 低分 chunks（跨语言检索失败，chunk 语言与 query 语言不匹配）
// Stage 1: 中英高分 chunks（改写后同语言检索成功）
// 预期轨迹：agent(search) → tools(低分+语言异常) → agent(query_rewrite) → tools(同语言高分) → agent(summary)

// —— A9a: 泰语提问 + 中英KB + 无stats → 首轮低分跨语言 → 改写 → 重搜命中
async function testA9aDynamicLangRewrite(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A9a', '动态切换:TH→首搜低分→改写ZH/EN→重搜命中', async () => {
    const agent = buildLangAwareAgent(cfg, 'รหัสผ่านเริ่มต้นของ HCI คืออะไร');
    const stream = agent.stream({
      query: 'รหัสผ่านเริ่มต้นของ HCI คืออะไร',
      datasetIds: ['test-dataset'],
      history: [],
      priorContext: '',
      initialLanguageStats: null
    });
    let result: AgenticSearchResult | undefined;
    for await (const item of stream) {
      if ('chunks' in item && 'searchCount' in item) {
        result = item as AgenticSearchResult;
      }
    }
    if (!result) throw new Error('No result from agent stream');
    const t = analyzeTrajectory(result, 'th');
    const issues: string[] = [];

    // Stage 验证：必须经过 query_rewrite
    const hasRewrite = t.executionPath.some((p) => p.includes('query_rewrite'));
    if (!hasRewrite) {
      issues.push(`expected query_rewrite in path, got: ${t.executionPath.join(' → ')}`);
    }

    // 至少 2 次搜索（首轮失败 + 改写后重搜）
    if (t.searchCount < 2) {
      issues.push(`expected ≥2 searches, got ${t.searchCount}`);
    }

    if (!t.hasAnswer) issues.push('no answer');
    if (t.refuse) issues.push('unexpected refuse after rewrite');

    if (issues.length > 0) return { status: 'fail', detail: issues.join('; ') };
    return passTrajectory(
      [
        `path=${t.executionPath.join(' → ')}`,
        `hasRewrite=${hasRewrite}`,
        `searches=${t.searchCount}`,
        `queries=${JSON.stringify(t.searchQueries)}`,
        `chunks=${JSON.stringify(t.chunkLanguages)}`
      ].join(', '),
      t
    );
  });
}

// —— A9b: 俄语提问 + 中英KB + 无stats → 首轮低分跨语言 → 改写 → 重搜命中
async function testA9bDynamicLangRewriteZhEn(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A9b', '动态切换:RU→首搜低分→改写ZH/EN→重搜命中', async () => {
    const agent = buildLangAwareAgent(cfg, 'Какой пароль по умолчанию для HCI');
    const stream = agent.stream({
      query: 'Какой пароль по умолчанию для HCI',
      datasetIds: ['test-dataset'],
      history: [],
      priorContext: '',
      initialLanguageStats: null
    });
    let result: AgenticSearchResult | undefined;
    for await (const item of stream) {
      if ('chunks' in item && 'searchCount' in item) {
        result = item as AgenticSearchResult;
      }
    }
    if (!result) throw new Error('No result from agent stream');
    const t = analyzeTrajectory(result, 'ru');
    const issues: string[] = [];

    const hasRewrite = t.executionPath.some((p) => p.includes('query_rewrite'));
    if (!hasRewrite) {
      issues.push(`expected query_rewrite in path, got: ${t.executionPath.join(' → ')}`);
    }

    if (t.searchCount < 2) {
      issues.push(`expected ≥2 searches, got ${t.searchCount}`);
    }

    if (!t.hasAnswer) issues.push('no answer');
    if (t.refuse) issues.push('unexpected refuse after rewrite');

    if (issues.length > 0) return { status: 'fail', detail: issues.join('; ') };
    return passTrajectory(
      [
        `path=${t.executionPath.join(' → ')}`,
        `hasRewrite=${hasRewrite}`,
        `searches=${t.searchCount}`,
        `queries=${JSON.stringify(t.searchQueries)}`,
        `chunks=${JSON.stringify(t.chunkLanguages)}`
      ].join(', '),
      t
    );
  });
}

// ============================================================
// A10: Query 语言探测验证
// ============================================================

async function testA10aQueryLangDetection(cfg: MultiLangConfig): Promise<TestCase> {
  return runCase('A10a', '语言探测:多语种queryLang正确', async () => {
    // 依次测试 4 个语种的 queryLanguage
    const cases: Array<{
      question: string;
      chunks: ChunkResult[];
      stats: Record<string, number>;
      expectedLang: string;
    }> = [
      { question: '超融合的默认密码', chunks: ZH_CHUNKS, stats: { zh: 200 }, expectedLang: 'zh' },
      {
        question: 'What is the default password',
        chunks: EN_CHUNKS,
        stats: { en: 200 },
        expectedLang: 'en'
      },
      {
        question: 'デフォルトパスワードは何ですか',
        chunks: JA_CHUNKS,
        stats: { ja: 200 },
        expectedLang: 'ja'
      },
      {
        question: '기본 비밀번호는 무엇입니까',
        chunks: KO_CHUNKS,
        stats: { ko: 150 },
        expectedLang: 'ko'
      }
    ];
    const results: string[] = [];
    for (const { question, chunks, stats, expectedLang } of cases) {
      const result = await runAgent(cfg, question, chunks, stats);
      const actualLang = result.queryLanguage ?? 'N/A';
      if (actualLang !== expectedLang) {
        results.push(`"${question.slice(0, 20)}" → ${actualLang} (expected ${expectedLang})`);
      } else {
        results.push(`${expectedLang}=✓`);
      }
    }
    const failures = results.filter((r) => !r.includes('=✓'));
    if (failures.length > 0) {
      return { status: 'fail', detail: failures.join('; ') };
    }
    return { status: 'pass', detail: results.join(', ') };
  });
}

// ============================================================
// A11: subQueryFilter 关闭思考 + maxTokens 约束下 LLM 打分验证
// ============================================================

async function testA11aSubQueryFilterScoring(cfg: MultiLangConfig): Promise<TestCase> {
  const useBuiltIn = cfg.provider === 'builtin';
  const caseName = useBuiltIn
    ? 'subQueryFilter:BuiltInLLM+maxTokens约束→打分正常'
    : 'subQueryFilter:DirectLLM+maxTokens约束→打分正常';

  return runCase('A11a', caseName, async () => {
    let llm: LLMProvider;

    if (useBuiltIn) {
      // BuiltInLLMAdapter：内部已通过 resolveLLMCallOptions 合并默认选项
      // （enableThinking=false + chat_template_kwargs），同时 maxTokens 条件发送
      const { BuiltInLLMAdapter } = await import('../src/adapters/builtIn/llm/adapter');
      llm = new BuiltInLLMAdapter({
        model: cfg.model,
        endpoint: cfg.endpoint,
        apiKey: cfg.apiKey,
        timeout: cfg.timeoutMs,
        logger
      });
    } else {
      // DirectLLMProvider：需要手动包裹，模拟 wrapProviderWithDefaults 行为
      const rawLlm = new DirectLLMProvider(
        cfg.model,
        cfg.endpoint,
        cfg.apiKey,
        cfg.timeoutMs,
        logger
      );
      llm = {
        ...rawLlm,
        async chat(messages, options) {
          const mergedOptions = {
            ...options,
            enableThinking: false,
            extra: {
              enable_thinking: false,
              chat_template_kwargs: { enable_thinking: false },
              ...(options?.extra as Record<string, unknown>)
            }
          };
          const resp = await rawLlm.chat(messages, mergedOptions);
          console.log(
            `[A11a] LLM raw: content="${resp.content.slice(0, 120)}" len=${resp.content.length}`
          );
          return resp;
        },
        chatStream(messages, options) {
          return rawLlm.chatStream(messages, options);
        },
        getModelInfo() {
          return rawLlm.getModelInfo();
        }
      };
    }

    // 构造 HCI 相关的中文 chunks（模拟真实检索结果）
    const chunks: ChunkItem[] = [
      {
        id: 'hci-1',
        content:
          '超融合 HCI 默认管理员账号为 admin，默认密码为 Fit@12345，首次登录后请立即修改密码。部署要求至少 3 个节点，支持 SSD 缓存加速。',
        score: 0.9,
        datasetId: 'test-ds',
        sourceName: 'HCI手册.pdf',
        detectedLanguage: 'zh'
      },
      {
        id: 'hci-2',
        content:
          '超融合系统初始化完成后，通过浏览器访问管理界面 https://hci-master:8443，使用默认凭据 admin/Fit@12345 登录。',
        score: 0.85,
        datasetId: 'test-ds',
        sourceName: '快速入门.pdf',
        detectedLanguage: 'zh'
      },
      {
        id: 'hci-3',
        content: '安全建议：超融合系统部署后应立即修改默认密码，启用密码复杂度策略和定期过期机制。',
        score: 0.8,
        datasetId: 'test-ds',
        sourceName: '安全规范.pdf',
        detectedLanguage: 'zh'
      },
      {
        id: 'hci-4',
        content:
          '超融合平台支持分布式部署，最小集群规模为 3 节点，推荐使用万兆网络互联。支持在线扩容，单集群最大 64 节点。',
        score: 0.75,
        datasetId: 'test-ds',
        sourceName: '部署指南.pdf',
        detectedLanguage: 'zh'
      },
      {
        id: 'hci-5',
        content:
          '性能优化建议：使用 SSD 存储池用于缓存加速，开启内存去重和压缩功能可提升 IOPS 30% 以上。',
        score: 0.7,
        datasetId: 'test-ds',
        sourceName: '性能调优.pdf',
        detectedLanguage: 'zh'
      },
      {
        id: 'low-1',
        content:
          '公司员工手册第三章：考勤制度与请假流程说明。年假天数按工龄计算，试用期员工不享有年假。',
        score: 0.15,
        datasetId: 'test-ds',
        sourceName: 'HR手册.pdf',
        detectedLanguage: 'zh'
      },
      {
        id: 'low-2',
        content:
          '办公室管理规定：工位清洁检查时间为每周五下午 5 点，请提前整理桌面物品。会议室预订需提前一天。',
        score: 0.1,
        datasetId: 'test-ds',
        sourceName: '行政制度.pdf',
        detectedLanguage: 'zh'
      }
    ];

    // 直接调用 subQueryFilter — 内部传递 { temperature: 0.0, maxTokens: 8 }
    // 经过 runner 的 wrapProviderWithDefaults 后，options 还会合并 enableThinking=false
    const filtered = await subQueryFilter(
      chunks,
      '超融合 HCI 的默认管理员密码是什么',
      '超融合默认密码',
      '我需要检索超融合产品的官方文档或安装手册中关于默认管理员账户密码的说明，直接提取初始登录凭证。',
      llm,
      10,
      'simple_query'
    );

    const issues: string[] = [];

    // 高相关 chunks 应该保留
    if (filtered.length === 0) {
      issues.push('all chunks filtered out — LLM scoring may be broken');
    }

    // 不相关 chunks 应该被过滤掉
    const filteredIds = new Set(filtered.map((c) => c.id));
    if (filteredIds.has('low-1')) {
      issues.push('irrelevant chunk low-1 should have been filtered');
    }
    if (filteredIds.has('low-2')) {
      issues.push('irrelevant chunk low-2 should have been filtered');
    }

    // 相关 chunks 应该保留
    if (!filteredIds.has('hci-1') && !filteredIds.has('hci-2') && !filteredIds.has('hci-3')) {
      issues.push('all relevant HCI chunks were filtered — scores may all be 0');
    }

    if (issues.length > 0) {
      return {
        status: 'fail',
        detail: issues.join('; '),
        info: {
          totalChunks: chunks.length,
          filteredCount: filtered.length,
          filteredIds: filtered.map((c) => c.id),
          scores: filtered.map(
            (c) =>
              `${c.id}:${(c as ChunkItem & { llm_sub_query_score?: number }).llm_sub_query_score ?? 'N/A'}`
          )
        }
      };
    }

    return {
      status: 'pass',
      detail: `${chunks.length} chunks → ${filtered.length} kept, low relevance filtered`,
      info: {
        keptIds: filtered.map((c) => c.id),
        keptCount: filtered.length,
        totalCount: chunks.length
      }
    };
  });
}

// ============================================================
// 运行入口
// ============================================================

/** 检查 testId 是否匹配 cases 过滤列表。空列表 = 全部通过 */
function matchCases(testId: string, cases?: string[]): boolean {
  if (!cases || cases.length === 0) return true;
  return cases.some((pattern) => testId === pattern || testId.startsWith(pattern));
}

async function runUnitLayer(cases?: string[]): Promise<TestCase[]> {
  const allUnitTests: Array<{ id: string; fn: () => Promise<TestCase> }> = [
    { id: 'U1', fn: testU1CJKDetection },
    { id: 'U2', fn: testU2NonCJKDetection },
    { id: 'U3', fn: testU3BuildConfigAuthoritative },
    { id: 'U4', fn: testU4BuildConfigTentative },
    { id: 'U5', fn: testU5BuildConfigFallback },
    { id: 'U6', fn: testU6TrackerNormalPath },
    { id: 'U7', fn: testU7TrackerAnomalyDetection },
    { id: 'U8', fn: testU8TrackerDedup },
    { id: 'U9', fn: testU9TrackerCrossLingualBypass },
    { id: 'U10', fn: testU10TrackerUserLangDisconnect },
    { id: 'U11', fn: testU11GetTargetLanguages },
    { id: 'U12', fn: testU12MultiRoundSwitch },
    { id: 'U13', fn: testU13SampleLanguageLogic }
  ];
  const filtered = allUnitTests.filter((t) => matchCases(t.id, cases));
  if (filtered.length === 0) {
    console.log('\n  (no unit tests matched)');
    return [];
  }
  const names = filtered.map((t) => t.id).join(', ');
  console.log(`\n  Running Unit [${names}]...`);
  return Promise.all(filtered.map((t) => t.fn()));
}

async function runAgentLayer(cfg: MultiLangConfig): Promise<TestCase[]> {
  const allAgentTests: Array<{ id: string; fn: (c: MultiLangConfig) => Promise<TestCase> }> = [
    // A1: 单语一致性
    { id: 'A1a', fn: testA1aZhMonoLang },
    { id: 'A1b', fn: testA1bEnMonoLang },
    { id: 'A1c', fn: testA1cJaMonoLang },
    { id: 'A1d', fn: testA1dKoMonoLang },
    // A2: 跨语言 L1 authoritative
    { id: 'A2a', fn: testA2aCrossL1EnZh },
    { id: 'A2b', fn: testA2bCrossL1ZhEn },
    { id: 'A2c', fn: testA2cCrossL1ZhJa },
    // A3: 混合 KB L2 tentative
    { id: 'A3a', fn: testA3aMixedTentative },
    // A4: L3 fallback
    { id: 'A4a', fn: testA4aFallbackNoStats },
    // A5: 低分早停
    { id: 'A5a', fn: testA5aIrrelevantZh },
    { id: 'A5b', fn: testA5bIrrelevantEn },
    // A6: 高分早停
    { id: 'A6a', fn: testA6aHighScoreEarlyStop },
    // A7: 跨语言信号压制
    { id: 'A7a', fn: testA7aCrossLingualSuppression },
    // A8: 小语种
    { id: 'A8a', fn: testA8aThaiSmallLang },
    // A9: 动态语言检测 → 改写 → 重搜
    { id: 'A9a', fn: testA9aDynamicLangRewrite },
    { id: 'A9b', fn: testA9bDynamicLangRewriteZhEn },
    // A10: query 语言探测
    { id: 'A10a', fn: testA10aQueryLangDetection },
    // A11: subQueryFilter 关闭思考 + maxTokens 约束下打分
    { id: 'A11a', fn: testA11aSubQueryFilterScoring }
  ];
  const filtered = allAgentTests.filter((t) => matchCases(t.id, cfg.cases));
  if (filtered.length === 0) {
    console.log('\n  (no agent tests matched)');
    return [];
  }
  const names = filtered.map((t) => t.id).join(', ');
  console.log(`\n  Running Agent [${names}]...`);
  const results: TestCase[] = [];
  for (const { fn } of filtered) {
    results.push(await fn(cfg));
  }
  return results;
}

async function main(): Promise<void> {
  const cfg = parseArgs();

  console.log(`\n${BOLD}Multi-Lang Agentic Search Test${RESET}`);
  console.log(`${DIM}  Model:    ${cfg.model}`);
  console.log(`  Endpoint: ${cfg.endpoint}`);
  console.log(`  Layer:    ${cfg.layer}${RESET}`);

  const report: MultiLangReport = {
    model: cfg.model,
    endpoint: cfg.endpoint,
    timestamp: new Date().toISOString(),
    layers: {},
    recommendations: []
  };

  // Unit 层
  if (cfg.layer === 'unit' || cfg.layer === 'both') {
    const unitCases = await runUnitLayer(cfg.cases);
    report.layers.unit = makeLayerResult(unitCases);
  }

  // Agent 层
  if (cfg.layer === 'agent' || cfg.layer === 'both') {
    const agentCases = await runAgentLayer(cfg);
    report.layers.agent = makeLayerResult(agentCases);
  }

  const allCases = [...(report.layers.unit?.cases ?? []), ...(report.layers.agent?.cases ?? [])];
  report.recommendations = buildRecommendations(allCases);
  printReport(report);

  // 输出 JSON 报告文件
  if (cfg.output) {
    const { writeFile } = await import('fs/promises');
    await writeFile(cfg.output, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`${CYAN}Report written to: ${cfg.output}${RESET}\n`);
  }

  const hasFail = allCases.some((c) => c.status === 'fail' || c.status === 'error');
  process.exit(hasFail ? 1 : 0);
}

// ============================================================
// 入口分发
// ============================================================

const isVitestRuntime = typeof process.env.VITEST !== 'undefined';
const hasCustomEndpoint = !!process.env.LLM_BASE_URL;

if (!isVitestRuntime) {
  main().catch((e) => {
    console.error('Fatal error:', e);
    process.exit(2);
  });
} else if (hasCustomEndpoint) {
  describe('Multi-Lang Agentic Search (real LLM)', () => {
    it('run full multi-lang suite', async () => {
      const realExit = process.exit;
      let exitCode = 0;
      process.exit = ((code?: number) => {
        exitCode = code ?? 0;
        throw new Error(`process.exit(${code})`);
      }) as any;
      try {
        await main();
      } catch (e: any) {
        if (!e.message?.startsWith('process.exit')) throw e;
      } finally {
        process.exit = realExit;
      }
    });
  });
} else {
  describe('Multi-Lang Agentic Search', () => {
    it('runs unit layer', async () => {
      const cases = await runUnitLayer();
      const result = makeLayerResult(cases);
      // 单元测试必须通过
      for (const c of result.cases) {
        if (c.status === 'fail' || c.status === 'error') throw new Error(`${c.id}: ${c.detail}`);
      }
    });
  });
}
