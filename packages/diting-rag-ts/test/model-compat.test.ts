#!/usr/bin/env tsx
/// <reference types="vitest/globals" />
// test/model-compat.test.ts
// 模型兼容性测试脚本 - 验证任意 LLM 在 diting-rag-ts 中的工具调用行为
//
// 用法:
//   tsx test/model-compat.test.ts [options]
//
// 选项:
//   --model <name>      模型名称 (默认: LLM_MODEL 环境变量)
//   --endpoint <url>    API 端点 (默认: LLM_BASE_URL 环境变量)
//   --api-key <key>     API 密钥 (默认: LLM_API_KEY 环境变量)
//   --layer <layer>     测试层: api | agent | both (默认: both)
//   --output <file>     输出 JSON 报告文件路径 (可选)
//   --timeout <ms>      单个用例超时毫秒数 (默认: 30000)
//   --help, -h          显示帮助

// ============================================================
// 依赖 import（ESM 中所有 import 必须在顶部）
// ============================================================

import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// dotenv 必须在使用 env 变量之前加载（parseArgs 读 process.env.*）
const __scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__scriptDir, '..', '.env') });

// src/ 工具函数（仅 import，不修改）
import { TOOL_DEFINITIONS, getSystemPrompt, buildTextReactPrompt } from '../src/agent/tools.js';
import { MockVectorSearchProvider } from '../src/adapters/mock/vector_search.js';
import { MockFullTextSearchProvider } from '../src/adapters/mock/full_text_search.js';
import { MockEmbeddingProvider } from '../src/adapters/mock/embedding.js';
import { createAgenticSearch } from '../src/agent/runner.js';
import { BuiltInLLMAdapter } from '../src/adapters/builtIn/llm/adapter.js';
import { ConsoleLogger } from '../src/builtIn/logger/consoleLogger.js';
import { LogLevel } from '../src/ports/logger.js';
import type { ChunkResult } from '../src/types/chunk.js';
import type { AgenticSearchResult } from '../src/agent/runner.js';
import type { LLMProvider } from '../src/ports/llm';
import type { LLMMessage, LLMResponse, LLMCallOptions, ToolCall } from '../src/types/message';

// 全局logger
const logger = new ConsoleLogger({ level: LogLevel.DEBUG, prefix: 'compat testing' });

// ============================================================
// 自定义 LLM Provider（直接基于端口约定，不走 BuiltInLLMAdapter）
// ============================================================

/**
 * 直接调用 OpenAI 兼容 /chat/completions，支持 native function calling。
 * 与 API 层测试使用完全相同的调用逻辑，避免 BuiltInLLMAdapter 中可能的差异。
 */
class DirectLLMProvider implements LLMProvider {
  constructor(
    private model: string,
    private endpoint: string,
    private apiKey: string,
    private timeoutMs: number,
    private globalLogger: ConsoleLogger
  ) {}

  async chat(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMResponse> {
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

    this.globalLogger.debug('[DirectLLM] chat request', {
      model,
      messageCount: messages.length,
      hasTools: !!options?.tools?.length
    });

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

      this.globalLogger.debug('[DirectLLM] response', {
        hasToolCalls: !!msg?.tool_calls?.length,
        contentLen: (msg?.content ?? '').length
      });
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
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.globalLogger.error(`[DirectLLM] chat failed: ${err}`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async *chatStream(messages: LLMMessage[], options?: LLMCallOptions): AsyncIterable<LLMResponse> {
    const model = options?.model || this.model;
    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0,
      max_tokens: options?.maxTokens ?? 8192,
      stream: true
    };
    if (body.model === 'kimi-k2.5') {
      body.temperature = 1;
    }

    if (options?.tools?.length) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice ?? 'auto';
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

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${text}`);
      }
      if (!resp.body) throw new Error('No response body');

      this.globalLogger.debug('[DirectLLM] chatStream connected', { model });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.globalLogger.error(`[DirectLLM] chatStream request failed: ${err}`);
      clearTimeout(timer);
      throw e;
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
              choices?: Array<{ delta: { content?: string; reasoning_content?: string } }>;
            };
            const delta = data.choices?.[0]?.delta;
            if (delta) {
              yield { content: delta.content || '', reasoning: delta.reasoning_content };
            }
          } catch (e) {
            this.globalLogger.debug(
              `[DirectLLM] chatStream parse error: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.globalLogger.error(`[DirectLLM] chatStream stream error: ${err}`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  getModelInfo() {
    return { name: this.model, contextWindow: 16000, maxOutputTokens: 8192 };
  }
}

// ============================================================
// 配置类型 & CLI 解析
// ============================================================

export type LLMType = 'direct' | 'builtin';
export type Layer = 'api' | 'agent' | 'both';

export interface CompatConfig {
  model: string;
  endpoint: string; // 例如: http://10.74.124.139:30001/v1
  apiKey: string;
  layer: Layer;
  llmType: LLMType; // direct = DirectLLMProvider, builtin = BuiltInLLMAdapter
  output?: string; // 输出 JSON 文件路径（可选）
  timeoutMs: number; // 单个用例超时（默认 30000ms）
  enableThinking?: boolean; // 是否开启思考模式（默认关闭，--thinking 开启）
}

function parseArgs(): CompatConfig {
  const args = process.argv.slice(2);

  // 从 .env 读取默认值
  const config: CompatConfig = {
    model: process.env.LLM_MODEL || 'unknown-model',
    endpoint: (process.env.LLM_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, ''),
    apiKey: process.env.LLM_API_KEY || '',
    layer: 'both',
    llmType: 'direct',
    timeoutMs: 300_000
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
      case '--thinking':
        config.enableThinking = true;
        break;
      case '--llm-type':
        config.llmType = args[++i] as LLMType;
        break;
      case '--builtin':
        config.llmType = 'builtin';
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: tsx test/model-compat.test.ts [options]

Options:
  --model <name>      Model name (default: LLM_MODEL env var)
  --endpoint <url>    API endpoint (default: LLM_BASE_URL env var)
  --api-key <key>     API key (default: LLM_API_KEY env var)
  --layer <layer>     Which layer to test: api | agent | both (default: both)
  --llm-type <type>   LLM provider: direct | builtin (default: direct)
  --builtin           Alias for --llm-type builtin
  --output <file>     Write JSON report to file (optional)
  --timeout <ms>      Per-test timeout in ms (default: 30000)
  --thinking          Enable thinking/reasoning mode (default: off, sends enable_thinking=false)
  --help, -h          Show this help

Examples:
  # Test current model from .env
  tsx test/model-compat.test.ts

  # Test specific model, API layer only
  tsx test/model-compat.test.ts --model kimi-k2.5 --endpoint http://... --layer api

  # Test with thinking mode enabled (Qwen3, deepseek-r1, etc.)
  tsx test/model-compat.test.ts --thinking

  # Test with BuiltInLLMAdapter (includes truncation auto-retry)
  tsx test/model-compat.test.ts --builtin --layer agent

  # Test and save report
  tsx test/model-compat.test.ts --output /tmp/report.json
`);
        process.exit(0);
        break;
    }
  }

  if (!['api', 'agent', 'both'].includes(config.layer)) {
    console.error(`Invalid --layer value: "${config.layer}". Must be: api | agent | both`);
    process.exit(1);
  }
  if (!['direct', 'builtin'].includes(config.llmType)) {
    console.error(`Invalid --llm-type value: "${config.llmType}". Must be: direct | builtin`);
    process.exit(1);
  }

  return config;
}

// ============================================================
// 测试结果类型
// ============================================================

export type TestStatus = 'pass' | 'fail' | 'error' | 'skip' | 'info';

export interface TestCase {
  id: string;
  name: string;
  status: TestStatus;
  durationMs: number;
  detail?: string; // 失败/错误时的说明
  info?: Record<string, unknown>; // T6 推理探测等附加信息
  /** 完整响应内容（用于 T1-T4 调试） */
  fullResponse?: string;
}

export interface LayerResult {
  passed: number; // pass 状态数量（info/skip 不计入）
  total: number; // pass + fail + error 数量（info/skip 不计入）
  cases: TestCase[];
}

export interface CompatReport {
  model: string;
  endpoint: string;
  timestamp: string;
  layers: {
    api?: LayerResult;
    agent?: LayerResult;
  };
  recommendations: string[];
}

// ============================================================
// 报告输出（终端带颜色）
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
  const sep = '─'.repeat(Math.max(0, 54 - title.length));
  console.log(`\n${BOLD}─── ${title} ${sep}${RESET}`);
  for (const tc of layer.cases) {
    const dur = tc.durationMs > 0 ? `  ${DIM}(${tc.durationMs}ms)${RESET}` : '';
    const det = tc.detail ? `  ${DIM}${tc.detail}${RESET}` : '';
    console.log(`${tc.id.padEnd(4)} ${tc.name.padEnd(32)} ${statusIcon(tc.status)}${dur}${det}`);
    if (tc.info && Object.keys(tc.info).length > 0) {
      for (const [k, v] of Object.entries(tc.info)) {
        console.log(`     ${DIM}${k}: ${JSON.stringify(v)}${RESET}`);
      }
    }
    if (tc.fullResponse) {
      // pretty print the full response
      try {
        const parsed = JSON.parse(tc.fullResponse);
        console.log(
          `${DIM}     full_response: ${JSON.stringify(parsed, null, 2).split('\n').join('\n     ')}${RESET}`
        );
      } catch {
        console.log(`${DIM}     full_response: ${tc.fullResponse}${RESET}`);
      }
    }
  }
}

export function printReport(report: CompatReport, llmType?: string): void {
  const W = 62;
  const llmNote = llmType ? ` [${llmType}]` : '';
  console.log(`\n${BOLD}╔${'═'.repeat(W)}╗`);
  console.log(
    `║  Model Compatibility Report${llmNote}${' '.repeat(Math.max(0, W - 28 - llmNote.length))}║`
  );
  console.log(`║  Model:    ${report.model.slice(0, W - 14).padEnd(W - 12)}║`);
  console.log(`║  Endpoint: ${report.endpoint.slice(0, W - 14).padEnd(W - 12)}║`);
  console.log(`║  Time:     ${report.timestamp.padEnd(W - 12)}║`);
  console.log(`╚${'═'.repeat(W)}╝${RESET}`);

  if (report.layers.api) printLayerResults('API Layer', report.layers.api);
  if (report.layers.agent) printLayerResults('Agent Layer', report.layers.agent);

  console.log(`\n${BOLD}─── Summary ${'─'.repeat(51)}${RESET}`);
  if (report.layers.api) {
    console.log(`API Layer:   ${report.layers.api.passed}/${report.layers.api.total} passed`);
  }
  if (report.layers.agent) {
    console.log(`Agent Layer: ${report.layers.agent.passed}/${report.layers.agent.total} passed`);
  }
  const totalPassed = (report.layers.api?.passed ?? 0) + (report.layers.agent?.passed ?? 0);
  const totalTests = (report.layers.api?.total ?? 0) + (report.layers.agent?.total ?? 0);
  console.log(`Overall:     ${totalPassed}/${totalTests} passed`);

  if (report.recommendations.length > 0) {
    console.log(`\n${BOLD}─── Recommendations ${'─'.repeat(43)}${RESET}`);
    for (const rec of report.recommendations) {
      console.log(`${YELLOW}⚠  ${rec}${RESET}`);
    }
  }
  console.log();
}

export function makeLayerResult(cases: TestCase[]): LayerResult {
  const countable = cases.filter((c) => c.status !== 'info' && c.status !== 'skip');
  return {
    passed: countable.filter((c) => c.status === 'pass').length,
    total: countable.length,
    cases
  };
}

export function buildRecommendations(report: CompatReport): string[] {
  const recs: string[] = [];
  const allCases = [...(report.layers.api?.cases ?? []), ...(report.layers.agent?.cases ?? [])];
  const hints: Record<string, string> = {
    T1: 'T1 FAILED: model does not support native function calling → use text agent mode.',
    T2: 'T2 FAILED: model selects wrong tool in native mode → validate system prompt or switch to text mode.',
    T3: 'T3 FAILED: model returns malformed tool arguments → parse error will break agent.',
    T5: 'T5 FAILED: model does not follow @tool ReAct format → text agent mode will not work either.',
    A1: 'A1 FAILED: agent pipeline did not complete search+answer → check model instruction following.',
    A2: 'A2 FAILED: tool call loop detected → model may repeat same tools; consider adding stop tokens.',
    A3: 'A3 FAILED: agent did not stop on irrelevant query → may waste search budget.',
    A4: 'A4 FAILED: playbook routing incorrect → comparative questions routed to wrong playbook.'
  };
  // Detect AI SDK fallback success in T1/T2
  const t1 = allCases.find((c) => c.id === 'T1');
  const t2 = allCases.find((c) => c.id === 'T2');
  for (const tc of [t1, t2]) {
    if (tc && tc.status === 'pass' && tc.detail?.includes('AI SDK')) {
      recs.push(
        `${tc.id} passed via AI SDK fallback — model supports tools through SDK even though raw API returns null tool_calls`
      );
    }
  }
  for (const tc of allCases) {
    if (tc.status === 'fail' || tc.status === 'error') {
      const hint = hints[tc.id] || `${tc.id} FAILED: ${tc.detail ?? '(no detail)'}`;
      recs.push(hint);
    }
  }
  return recs;
}

// ============================================================
// API 层 HTTP 工具函数
// ============================================================

/** OpenAI 兼容 API 的原始响应类型（宽松，包含各厂商扩展字段） */
interface RawLLMResponse {
  id?: string;
  choices?: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
      reasoning_content?: string; // MiniMax / Qwen3 等思考字段
    };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message: string; type?: string; code?: string };
}

/** 发送给 API 的请求体 */
interface LLMAPIRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  tools?: unknown[];
  tool_choice?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: false;
  enable_thinking?: boolean; // vLLM / Qwen3 等支持，关闭思考模式
  [key: string]: unknown; // 透传其他字段
}

/**
 * 直接 fetch 调用 LLM 兼容 API（/chat/completions），带超时保护
 * 返回 { ok: true, data } 或 { ok: false, error: string }
 */
async function callLLMAPI(
  cfg: CompatConfig,
  body: LLMAPIRequest
): Promise<{ ok: true; data: RawLLMResponse } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  if (body.model === 'kimi-k2.5') {
    body.temperature = 1;
  }
  body.enable_thinking = (body.enable_thinking ?? false) || (cfg.enableThinking ?? false);

  try {
    const resp = await fetch(`${cfg.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        ...body,
        stream: false
        // 默认关闭思考模式（除非 --thinking），减少 token 浪费，让工具调用更直接
        // enable_thinking: cfg.enableThinking ?? false,
        // reasoning_split: true
      }),
      signal: controller.signal
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { ok: false, error: `HTTP ${resp.status}: ${text}` };
    }

    const data = (await resp.json()) as RawLLMResponse;
    if (data.error) {
      return { ok: false, error: `API error: ${data.error.message}` };
    }
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (controller.signal.aborted) {
      return { ok: false, error: `Timeout after ${cfg.timeoutMs}ms` };
    }
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 包装单个测试用例的执行，捕获异常 + 记录耗时
 * 不会因单个用例失败而影响其他用例
 */
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
      detail: e instanceof Error ? `${e.message}` : String(e)
    };
  }
}

// ============================================================
// Anthropic 格式 Fallback（raw fetch，不依赖 AI SDK）
// ============================================================

/**
 * 通过 Anthropic Messages API 格式尝试检测工具调用。
 * 用于 OpenAI 兼容格式 (callLLMAPI) 无法检测到 tool_calls 时的后备方案，
 * 覆盖原生使用 Anthropic 格式的模型（如 MiniMax）。
 * Returns { ok: true, toolCalls: string[] } or { ok: false, error: string }
 */
async function tryAnthropicFormatToolCall(
  cfg: CompatConfig,
  messages: Array<{ role: string; content: string }>,
  tools: unknown[]
): Promise<{ ok: true; toolCalls: string[] } | { ok: false; error: string }> {
  try {
    // 将 OpenAI-style tools 转为 Anthropic input_schema 格式
    const anthropicTools = (tools as any[]).map((t: any) => {
      const fn = t.function ?? t;
      return {
        name: fn.name,
        description: fn.description ?? '',
        input_schema: fn.parameters ?? { type: 'object', properties: {} }
      };
    });

    const resp = await fetch(`${cfg.endpoint}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1024,
        messages,
        tools: anthropicTools
      }),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 30000)
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return { ok: false, error: `Anthropic format HTTP ${resp.status}: ${errText.slice(0, 200)}` };
    }

    const data = (await resp.json()) as any;
    const toolCalls: string[] = [];

    // Anthropic 响应中 tool_use 在 content 数组里
    for (const block of data.content ?? []) {
      if (block.type === 'tool_use') {
        toolCalls.push(block.name);
      }
    }

    if (toolCalls.length > 0) {
      return { ok: true, toolCalls };
    }

    return {
      ok: false,
      error: `No tool_use blocks in Anthropic response (stop_reason=${data.stop_reason})`
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ============================================================
// API 层测试用例 T1-T6
// ============================================================

/** 用于测试工具选择的简单问题（中文，明确需要搜索） */
const SIMPLE_QUESTION = '超融合的默认密码是什么';

/**
 * 剥离 <think>...<\/think> 块，返回纯内容
 * 部分 <think> 未闭合时也尝试截断
 */
function stripThink(content: string): { stripped: string; hadThink: boolean } {
  const hadThink = content.includes('<think');
  // 完整闭合的 <think>...<\/think>
  let stripped = content.replace(/<think[\s\S]*?<\/think>/g, '').trim();
  // 未闭合的 <think>...（到末尾）
  // 未闭合的 ...</think>
  if (!stripped && hadThink) {
    const idx1 = content.indexOf('<think');
    stripped = content.substring(0, idx1).trim();
    if (!stripped && stripped.includes('<think')) {
      const idx2 = stripped.indexOf('</think');
      stripped = stripped.substring(0, idx2).trim();
    }
  }
  return { stripped: stripped || content.trim(), hadThink };
}

/** 检测 text-react 格式的工具调用（@search / XML / JSON / <invoke> / <search>） */
function detectTextReact(content: string): { found: boolean; format: string; toolName: string } {
  // 直接标签格式: <search>...</search>, <query_rewrite>...</query_rewrite>, <summary>...</summary>
  if (/<search\b/.test(content)) return { found: true, format: '<search>', toolName: 'search' };
  if (/<query_rewrite\b/.test(content))
    return { found: true, format: '<query_rewrite>', toolName: 'query_rewrite' };
  if (/<summary\b/.test(content)) return { found: true, format: '<summary>', toolName: 'summary' };
  // Anthropic-style: <invoke name="search"> args => {"query": "..."}
  if (/<invoke\s+name="search"/.test(content))
    return { found: true, format: '<invoke search>', toolName: 'search' };
  if (/<invoke\s+name="query_rewrite"/.test(content))
    return { found: true, format: '<invoke query_rewrite>', toolName: 'query_rewrite' };
  if (/<invoke\s+name="summary"/.test(content))
    return { found: true, format: '<invoke summary>', toolName: 'summary' };
  // @search / @summary 等
  if (content.includes('@search')) return { found: true, format: '@search', toolName: 'search' };
  if (content.includes('@query_rewrite'))
    return { found: true, format: '@query_rewrite', toolName: 'query_rewrite' };
  if (content.includes('@summary')) return { found: true, format: '@summary', toolName: 'summary' };
  // XML 工具调用格式
  if (/<tool\s+name\s*=\s*"search"/.test(content) || content.includes('<tool name="search"'))
    return { found: true, format: 'XML', toolName: 'search' };
  // JSON 对象格式（含 queries / query 字段）
  if (/"queries"\s*:/.test(content) || /"query"\s*:/.test(content))
    return { found: true, format: 'JSON', toolName: 'search' };
  return { found: false, format: '', toolName: '' };
}

/**
 * T1: Function Calling 基础可用性
 * 只传 1 个工具（search），验证模型是否会返回 tool_calls
 */
async function testT1FunctionCallingAvailability(cfg: CompatConfig): Promise<TestCase> {
  return runCase('T1', 'Function Calling 基础可用性', async () => {
    const systemPrompt = getSystemPrompt('simple_query', true);
    const res = await callLLMAPI(cfg, {
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: SIMPLE_QUESTION }
      ],
      tools: TOOL_DEFINITIONS,
      tool_choice: 'auto',
      temperature: 0,
      max_tokens: 8192, // 思考型模型需要足够的 token 空间完成思考 + 工具调用
      enable_thinking: false
    });

    if (!res.ok) return { status: 'error', detail: res.error, fullResponse: res.error };

    const choice = res.data.choices?.[0];
    const msg = choice?.message;
    if (!msg)
      return {
        status: 'fail',
        detail: 'No message in response',
        fullResponse: JSON.stringify(res.data)
      };

    const finishReason = choice?.finish_reason ?? 'unknown';
    const hasCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;

    // 优先：native function calling
    if (hasCalls) {
      return {
        status: 'pass',
        detail: `tool_calls count=${msg.tool_calls!.length}, finish_reason=${finishReason}`,
        fullResponse: JSON.stringify(res.data)
      };
    }

    // Fallback：检查 content 中是否有 JSON / @search 等工具调用格式
    const rawContent = msg.content ?? '';
    const { stripped } = stripThink(rawContent);
    const hasThink = rawContent.includes('<think>');
    const contentCall = detectTextReact(rawContent);
    const hasQueries = /"queries"\s*:/.test(stripped) || /"query"\s*:/.test(stripped);

    if (contentCall.found || hasQueries) {
      return {
        status: 'pass',
        detail: [
          `No tool_calls but content contains`,
          contentCall.found ? `${contentCall.format} (tool=${contentCall.toolName})` : '',
          hasQueries ? 'JSON queries format' : ''
        ]
          .filter(Boolean)
          .join(' + '),
        fullResponse: JSON.stringify(res.data)
      };
    }

    if (finishReason === 'length') {
      return {
        status: 'fail',
        detail: `Truncated (finish_reason=length): content_len=${rawContent.length}`,
        fullResponse: JSON.stringify(res.data)
      };
    }

    // Tier 3: Anthropic format fallback
    const aiResult = await tryAnthropicFormatToolCall(
      cfg,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: SIMPLE_QUESTION }
      ],
      [TOOL_DEFINITIONS[0]]
    );
    if (aiResult.ok && aiResult.toolCalls.length > 0) {
      return {
        status: 'pass',
        detail: `No tool_calls from raw API but Anthropic format detected: [${aiResult.toolCalls.join(', ')}]`,
        fullResponse: JSON.stringify({
          rawFetch: res.data,
          anthropicFormat: { toolCalls: aiResult.toolCalls }
        })
      };
    }

    return {
      status: 'fail',
      detail: [
        `No tool_calls (finish_reason=${finishReason})`,
        hasThink ? `think=YES` : `think=NO`,
        `stripped="${stripped}"`,
        aiResult.ok
          ? `anthropic format: failed (${aiResult.toolCalls.length} calls)`
          : `anthropic format: ${aiResult.error}`
      ].join(', '),
      fullResponse: JSON.stringify(res.data)
    };
  });
}

/**
 * T2: 工具选择准确性
 * 有 tool_calls 时验证第一个工具为 search；无 tool_calls 时检查 content fallback。
 */
async function testT2ToolSelectionAccuracy(cfg: CompatConfig): Promise<TestCase> {
  return runCase('T2', '工具选择准确性', async () => {
    const systemPrompt = getSystemPrompt('simple_query', true);
    const res = await callLLMAPI(cfg, {
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: SIMPLE_QUESTION }
      ],
      tools: TOOL_DEFINITIONS,
      tool_choice: 'auto',
      temperature: 0,
      max_tokens: 8192,
      enable_thinking: false
    });

    if (!res.ok) return { status: 'error', detail: res.error, fullResponse: res.error };

    const choice = res.data.choices?.[0];
    const msg = choice?.message;
    if (!msg)
      return {
        status: 'fail',
        detail: 'No message in response',
        fullResponse: JSON.stringify(res.data)
      };

    const finishReason = choice?.finish_reason ?? 'unknown';
    const toolCalls = msg.tool_calls ?? [];
    const rawContent = msg.content ?? '';
    const { stripped } = stripThink(rawContent);
    const hasThink = rawContent.includes('<think>');

    if (toolCalls.length > 0) {
      const firstTool = toolCalls[0].function.name;
      if (firstTool === 'search') {
        return {
          status: 'pass',
          detail: `correct: first_tool=${firstTool}`,
          fullResponse: JSON.stringify(res.data)
        };
      }
      return {
        status: 'fail',
        detail: `selected '${firstTool}' first, expected 'search'. all_calls=[${toolCalls.map((t) => t.function.name).join(',')}]`,
        fullResponse: JSON.stringify(res.data)
      };
    }

    // Fallback：检查 content 中的工具调用格式
    const contentCall = detectTextReact(rawContent);
    const hasQueries = /"queries"\s*:/.test(stripped) || /"query"\s*:/.test(stripped);
    if (contentCall.found || hasQueries) {
      return {
        status: 'pass',
        detail: [
          `No tool_calls but content contains`,
          contentCall.found ? `${contentCall.format} (tool=${contentCall.toolName})` : '',
          hasQueries ? 'JSON queries format' : ''
        ]
          .filter(Boolean)
          .join(' + '),
        fullResponse: JSON.stringify(res.data)
      };
    }

    if (finishReason === 'length') {
      return {
        status: 'fail',
        detail: `Truncated (finish_reason=length): content_len=${rawContent.length}`,
        fullResponse: JSON.stringify(res.data)
      };
    }

    // Tier 3: Anthropic format fallback
    const aiResult = await tryAnthropicFormatToolCall(
      cfg,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: SIMPLE_QUESTION }
      ],
      TOOL_DEFINITIONS
    );
    if (aiResult.ok && aiResult.toolCalls.length > 0) {
      return {
        status: 'pass',
        detail: `No tool_calls from raw API but Anthropic format detected: [${aiResult.toolCalls.join(', ')}]`,
        fullResponse: JSON.stringify({
          rawFetch: res.data,
          anthropicFormat: { toolCalls: aiResult.toolCalls }
        })
      };
    }

    return {
      status: 'fail',
      detail: [
        `No tool_calls (finish_reason=${finishReason})`,
        hasThink ? `think=YES` : `think=NO`,
        `stripped="${stripped}"`,
        aiResult.ok
          ? `anthropic format: failed (${aiResult.toolCalls.length} calls)`
          : `anthropic format: ${aiResult.error}`
      ].join(', '),
      fullResponse: JSON.stringify(res.data)
    };
  });
}

/**
 * T3: 工具参数结构正确性
 * 强制调用（tool_choice=required），验证 arguments 是合法 JSON 且含 query/queries 字段
 */
async function testT3ToolArgStructure(cfg: CompatConfig): Promise<TestCase> {
  return runCase('T3', '工具参数结构正确性', async () => {
    const systemPrompt = getSystemPrompt('simple_query', true);
    const res = await callLLMAPI(cfg, {
      model: cfg.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        { role: 'user', content: SIMPLE_QUESTION }
      ],
      tools: TOOL_DEFINITIONS,
      // tool_choice: 'required',      // 强制必须调用工具
      temperature: 0,
      max_tokens: 8192,
      enable_thinking: false
    });

    if (!res.ok) return { status: 'error', detail: res.error, fullResponse: res.error };

    const msg = res.data.choices?.[0]?.message;
    const toolCalls = msg?.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return {
        status: 'fail',
        detail: `No tool_calls returned (tool_choice=required ignored or unsupported)`,
        fullResponse: JSON.stringify(res.data)
      };
    }

    const args = toolCalls[0].function.arguments;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(args) as Record<string, unknown>;
    } catch {
      return {
        status: 'fail',
        detail: `arguments is not valid JSON: "${args}"`,
        fullResponse: JSON.stringify(res.data)
      };
    }

    const hasQuery = 'query' in parsed || 'queries' in parsed;
    if (!hasQuery) {
      return {
        status: 'fail',
        detail: `parsed args has no query/queries field: ${JSON.stringify(parsed)}`,
        fullResponse: JSON.stringify(res.data)
      };
    }
    return { status: 'pass', detail: `args=${JSON.stringify(parsed)}` };
  });
}

/**
 * T4: 无工具时正常回复
 * 不传 tools，验证基础对话能力
 */
async function testT4NormalReply(cfg: CompatConfig): Promise<TestCase> {
  return runCase('T4', '无工具时正常回复', async () => {
    const res = await callLLMAPI(cfg, {
      model: cfg.model,
      messages: [{ role: 'user', content: 'Only Greet' }],
      temperature: 0,
      max_tokens: 8192,
      enable_thinking: false
    });

    if (!res.ok) return { status: 'error', detail: res.error, fullResponse: res.error };

    const msg = res.data.choices?.[0]?.message;
    const content = msg?.content ?? '';
    if (!content || content.trim().length < 5) {
      return {
        status: 'fail',
        detail: `Empty or too-short content: "${content}"`,
        fullResponse: JSON.stringify(res.data)
      };
    }
    if (Array.isArray(msg?.tool_calls) && msg!.tool_calls!.length > 0) {
      return {
        status: 'fail',
        detail: 'Unexpected tool_calls in no-tools request',
        fullResponse: JSON.stringify(res.data)
      };
    }
    return {
      status: 'pass',
      detail: `content="${content}"`,
      fullResponse: JSON.stringify(res.data)
    };
  });
}

/**
 * T5: Text ReAct 格式兼容性
 * 不传 tools，只用文本系统提示，验证模型是否遵循 @search(...) 格式
 *
 * 检测以下几种格式（先剥离 <think> 块）：
 *   1. @search(...)          — diting text ReAct 格式
 *   2. <tool_call> / <tool name=  — XML 工具调用格式
 *   3. {"tool":"search"...} / {"name":"search"...}  — JSON 工具调用格式（部分模型）
 */
async function testT5TextReActFormat(cfg: CompatConfig): Promise<TestCase> {
  return runCase('T5', 'Text ReAct 格式兼容性', async () => {
    const systemPrompt = buildTextReactPrompt();
    const res = await callLLMAPI(cfg, {
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: SIMPLE_QUESTION }
      ],
      // 注意：不传 tools 参数（纯文本 ReAct 模式）
      temperature: 0,
      max_tokens: 8192,
      enable_thinking: false
    });

    if (!res.ok) return { status: 'error', detail: res.error };

    const rawContent = res.data.choices?.[0]?.message?.content ?? '';

    // 剥离 <think>...</think> 块，只看模型实际输出部分
    const strippedContent = rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    // 部分模型 <think> 未闭合时也尝试截断
    const contentToCheck = strippedContent || rawContent;

    const hasAtSearch = contentToCheck.includes('@search');
    const hasXmlCall =
      contentToCheck.includes('<tool_call>') || contentToCheck.includes('<tool name=');
    // JSON 格式工具调用：{"tool":"search"} 或 {"name":"search"} 或 "tool": "search"
    const hasJsonCall =
      /"tool"\s*:\s*"search"/.test(contentToCheck) ||
      /"name"\s*:\s*"search"/.test(contentToCheck) ||
      /"function"\s*:\s*"search"/.test(contentToCheck);
    const hadThinkBlock = rawContent.includes('<think>');

    const thinkNote = hadThinkBlock ? ' (after stripping <think> block)' : '';

    if (hasAtSearch) return { status: 'pass', detail: `found @search in response${thinkNote}` };
    if (hasXmlCall) return { status: 'pass', detail: `found <tool_call> XML format${thinkNote}` };
    if (hasJsonCall) return { status: 'pass', detail: `found JSON tool call format${thinkNote}` };

    return {
      status: 'fail',
      detail: `No tool call format found${thinkNote}. content="${contentToCheck}"`
    };
  });
}

/**
 * T6: 推理/思考过程字段探测（INFO 级别，不计入 pass/fail）
 * 探测三种格式：reasoning_content 字段、<think> 标签、无标签混入 content
 */
async function testT6ReasoningDetection(cfg: CompatConfig): Promise<TestCase> {
  return runCase('T6', '推理/思考过程字段探测', async () => {
    const systemPrompt = getSystemPrompt('simple_query', true);
    const res = await callLLMAPI(cfg, {
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: SIMPLE_QUESTION }
      ],
      tools: TOOL_DEFINITIONS,
      tool_choice: 'auto',
      temperature: 0,
      max_tokens: 8192,
      enable_thinking: true
    });

    if (!res.ok) {
      return { status: 'info', detail: `Cannot probe (API error): ${res.error}` };
    }

    const msg = res.data.choices?.[0]?.message;
    const content = msg?.content ?? '';
    const reasoningContent = msg?.reasoning_content;

    const hasReasoningField = typeof reasoningContent === 'string' && reasoningContent.length > 0;
    const hasThinkTags = content.includes('<think>');
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    const thinkLen = thinkMatch ? thinkMatch[1].length : 0;
    const contentAfterStrip = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // 无标签思考：content 很长、没有 tool_calls、不以 @search 开头、没有 <think> 标签
    const hasUnlabelledThinking =
      !hasReasoningField &&
      !hasThinkTags &&
      content.length > 200 &&
      (msg?.tool_calls ?? []).length === 0 &&
      !content.startsWith('@') &&
      !content.includes('<tool_call>');

    const info: Record<string, unknown> = {
      reasoning_content_field: hasReasoningField
        ? `present (${(reasoningContent as string).length} chars)`
        : 'absent',
      think_tags_in_content: hasThinkTags ? `present (${thinkLen} chars inside)` : 'absent',
      unlabelled_thinking_suspected: hasUnlabelledThinking,
      content_after_strip: contentAfterStrip || '(empty)'
    };

    let detail = 'no thinking format detected';
    if (hasReasoningField) detail = 'reasoning_content field present';
    else if (hasThinkTags) detail = '<think> tags in content';
    else if (hasUnlabelledThinking)
      detail = '⚠ unlabelled thinking in content — may break tool parsing';

    return { status: 'info', detail, info };
  });
}

/**
 * T7: 思考模式开关验证
 * 发送 enable_thinking=false，验证思考模式是否真正关闭。
 * 若模型仍输出 reasoning_content 或 <think> 块，说明该参数无效。
 */
async function testT7ThinkingToggle(cfg: CompatConfig): Promise<TestCase> {
  return runCase('T7', '思考模式关闭验证', async () => {
    const systemPrompt = getSystemPrompt('simple_query', true);
    const res = await callLLMAPI(cfg, {
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: SIMPLE_QUESTION }
      ],
      tools: TOOL_DEFINITIONS,
      tool_choice: 'auto',
      temperature: 0,
      max_tokens: 8192,
      enable_thinking: false
    });

    if (!res.ok) return { status: 'error', detail: res.error };

    const msg = res.data.choices?.[0]?.message;
    if (!msg) return { status: 'error', detail: 'No message in response' };

    const content = msg.content ?? '';
    const hasReasoningField =
      typeof msg.reasoning_content === 'string' && msg.reasoning_content!.length > 0;
    const hasThinkTags = content.includes('<think>');

    if (hasReasoningField || hasThinkTags) {
      return {
        status: 'fail',
        detail: [
          'enable_thinking=false was ignored — model still outputs thinking content',
          hasReasoningField
            ? `reasoning_content: ${(msg.reasoning_content as string).length} chars`
            : '',
          hasThinkTags ? '<think> tags present in content' : ''
        ]
          .filter(Boolean)
          .join(', ')
      };
    }

    return {
      status: 'pass',
      detail: 'Thinking content absent with enable_thinking=false'
    };
  });
}

/** 运行 T1-T4（并行） */
async function runAPILayerT1T4(cfg: CompatConfig): Promise<TestCase[]> {
  console.log('\n  Running T1-T4 (API Layer - native function calling)...');
  return Promise.all([
    testT1FunctionCallingAvailability(cfg),
    testT2ToolSelectionAccuracy(cfg),
    testT3ToolArgStructure(cfg),
    testT4NormalReply(cfg)
  ]);
}

/** 运行 T5-T7（并行） */
async function runAPILayerT5T7(cfg: CompatConfig): Promise<TestCase[]> {
  console.log('  Running T5-T7 (Text ReAct + Reasoning detection + Thinking toggle)...');
  return Promise.all([
    testT5TextReActFormat(cfg),
    testT6ReasoningDetection(cfg),
    testT7ThinkingToggle(cfg)
  ]);
}

// ============================================================
// Agent 层：Mock providers + 运行器
// ============================================================

/**
 * 高相关性 Mock chunks（用于 A1/A2）
 * 模拟知识库中有相关内容的场景
 */
const HIGH_RELEVANCE_CHUNKS: ChunkResult[] = [
  {
    id: 'mock-chunk-1',
    content: '超融合 HCI 默认管理员账号为 admin，默认密码为 Fit@12345，首次登录后请立即修改密码。',
    score: 0.85,
    datasetId: 'test-dataset',
    sourceName: 'HCI管理手册.pdf',
    searchSource: 'vector'
  },
  {
    id: 'mock-chunk-2',
    content: '超融合系统初始化完成后，通过浏览器访问管理界面，使用默认凭据 admin/Fit@12345 登录。',
    score: 0.8,
    datasetId: 'test-dataset',
    sourceName: 'HCI快速入门.pdf',
    searchSource: 'vector'
  },
  {
    id: 'mock-chunk-3',
    content: '安全建议：超融合系统部署后应立即修改默认密码，避免使用出厂设置 Fit@12345。',
    score: 0.72,
    datasetId: 'test-dataset',
    sourceName: '安全规范.pdf',
    searchSource: 'fulltext'
  }
];

/**
 * 低相关性 Mock chunks（用于 A3）
 * 模拟知识库中无相关内容的场景（不相关查询）
 */
const LOW_RELEVANCE_CHUNKS: ChunkResult[] = [
  {
    id: 'mock-irrelevant-1',
    content: '公司员工手册第三章：考勤制度与请假流程说明。',
    score: 0.08,
    datasetId: 'test-dataset',
    sourceName: 'HR手册.pdf',
    searchSource: 'vector'
  },
  {
    id: 'mock-irrelevant-2',
    content: '财务报销流程：员工出差报销需在返程后7个工作日内提交报销申请。',
    score: 0.06,
    datasetId: 'test-dataset',
    sourceName: '财务制度.pdf',
    searchSource: 'fulltext'
  }
];

/**
 * 高相关性 Mock chunks（用于 A4） vNGAF 和 vADC 的区别是什么，哪个更适合边缘部署
 * 模拟知识库中有相关内容的场景
 */
const HIGH_RELEVANCE_CHUNKS_A4: ChunkResult[] = [
  {
    id: 'mock-chunk-1',
    content: 'vAF是虚拟防火墙设备',
    score: 0.85,
    datasetId: 'test-dataset',
    sourceName: 'HCI管理手册.pdf',
    searchSource: 'vector'
  },
  {
    id: 'mock-chunk-2',
    content: 'vADC是虚拟应用交付设备',
    score: 0.8,
    datasetId: 'test-dataset',
    sourceName: 'HCI快速入门.pdf',
    searchSource: 'vector'
  },
  {
    id: 'mock-chunk-3',
    content: '安全建议：超融合系统部署后应立即修改默认密码，避免使用出厂设置 Fit@12345。',
    score: 0.02,
    datasetId: 'test-dataset',
    sourceName: '安全规范.pdf',
    searchSource: 'fulltext'
  }
];

/** 构建用于 Agent 测试的 providers（真实 LLM + Mock 搜索） */
function buildAgentProviders(cfg: CompatConfig, mockChunks: ChunkResult[], logger: ConsoleLogger) {
  const llm: LLMProvider =
    cfg.llmType === 'builtin'
      ? new BuiltInLLMAdapter({
          apiKey: cfg.apiKey,
          endpoint: cfg.endpoint,
          model: cfg.model,
          timeout: cfg.timeoutMs,
          logger,
          defaultEnableThinking: cfg.enableThinking ?? false
        })
      : new DirectLLMProvider(cfg.model, cfg.endpoint, cfg.apiKey, cfg.timeoutMs, logger);

  return {
    llm,
    vectorSearch: new MockVectorSearchProvider(mockChunks),
    fullTextSearch: new MockFullTextSearchProvider(mockChunks),
    embed: new MockEmbeddingProvider(1536),
    // reranker: 不传，减少变量，让评测更聚焦于 LLM 行为
    logger: logger
  };
}

/** 运行 agent，返回结果 */
async function runAgent(
  cfg: CompatConfig,
  question: string,
  mockChunks: ChunkResult[],
  case_label: string
): Promise<AgenticSearchResult> {
  const case_logger = new ConsoleLogger({ level: LogLevel.DEBUG, prefix: `Case ${case_label}` });
  const providers = buildAgentProviders(cfg, mockChunks, case_logger);
  const agent = createAgenticSearch({
    providers,
    config: {
      maxSearchCalls: 3, // 限制搜索轮次，防止无限循环
      maxToolCalls: 8,
      tokenBudget: 16000
    },
    mode: 'auto' // native 优先，无 tool_calls 时降级 text 解析
  });

  const stream = agent.stream({
    query: question,
    datasetIds: ['test-dataset'],
    history: [],
    priorContext: ''
  });

  let result: AgenticSearchResult | undefined;
  for await (const item of stream) {
    if ('chunks' in item && 'searchCount' in item) {
      result = item as AgenticSearchResult;
    }
  }

  if (!result) throw new Error('No result from stream');
  return result;
}

// ============================================================
// Agent 层测试用例 A1-A4
// ============================================================

const IRRELEVANT_QUESTION = '公司目前一共有多少名员工';
const COMPARISON_QUESTION = 'vNGAF 和 vADC 的区别是什么，哪个更适合边缘部署';

/**
 * A1: Agent 完整流程
 * 验证基本的搜索→回答流程能否走通
 */
async function testA1AgentPipeline(cfg: CompatConfig): Promise<TestCase> {
  return runCase('A1', 'Agent 完整流程', async () => {
    const case_label = 'A1';
    logger.info(`Case ${case_label}: ${SIMPLE_QUESTION}`);

    let result: AgenticSearchResult;
    try {
      result = await runAgent(cfg, SIMPLE_QUESTION, HIGH_RELEVANCE_CHUNKS, case_label);
    } catch (e) {
      return { status: 'error', detail: e instanceof Error ? e.message : String(e) };
    }

    const hasSearch = result.executionPath.some((p) => p.includes('search'));
    const hasAnswer = typeof result.answer === 'string' && result.answer.trim().length > 5;

    if (!hasSearch) {
      return {
        status: 'fail',
        detail: `No search in executionPath. path=[${result.executionPath.join(' → ')}]`
      };
    }
    if (!hasAnswer) {
      return {
        status: 'fail',
        detail: `No answer generated. answer="${result.answer ?? ''}"`
      };
    }
    return {
      status: 'pass',
      detail: `searchCount=${result.searchCount}, toolCalls=${result.toolCallCount}, answer="${result.answer}"`
    };
  });
}

/**
 * A2: 工具调用序列合理性
 * 验证不会出现死循环（连续重复相同 tool），toolCallCount 不超限
 */
async function testA2ToolCallLoop(cfg: CompatConfig): Promise<TestCase> {
  return runCase('A2', '工具调用序列合理性', async () => {
    const case_label = 'A2';
    logger.info(`Case ${case_label}: ${SIMPLE_QUESTION}`);
    let result: AgenticSearchResult;
    try {
      result = await runAgent(cfg, SIMPLE_QUESTION, HIGH_RELEVANCE_CHUNKS, case_label);
    } catch (e) {
      return { status: 'error', detail: e instanceof Error ? e.message : String(e) };
    }

    const MAX_TOOL_CALLS = 8;
    if (result.toolCallCount > MAX_TOOL_CALLS) {
      return {
        status: 'fail',
        detail: `toolCallCount=${result.toolCallCount} > limit=${MAX_TOOL_CALLS} (possible loop)`
      };
    }

    // 检查连续重复的 tools 节点（连续 4 次以上视为可疑循环）
    const path = result.executionPath;
    let maxConsecutive = 1;
    let consecutive = 1;
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1].split('(')[0];
      const curr = path[i].split('(')[0];
      if (curr === prev && curr === 'tools') {
        consecutive++;
        maxConsecutive = Math.max(maxConsecutive, consecutive);
      } else {
        consecutive = 1;
      }
    }
    if (maxConsecutive >= 4) {
      return {
        status: 'fail',
        detail: `Suspected loop: ${maxConsecutive} consecutive tool-node calls. path=[${path.join(' → ')}]`
      };
    }

    return {
      status: 'pass',
      detail: `toolCalls=${result.toolCallCount}, path=[${path.join(' → ')}]`
    };
  });
}

/**
 * A3: 不相关查询早停
 * mock 搜索只返回低分 chunk，验证 agent 能识别并拒绝回答/不无限搜索
 */
async function testA3IrrelevantQueryStop(cfg: CompatConfig): Promise<TestCase> {
  return runCase('A3', '不相关查询早停', async () => {
    const case_label = 'A3';
    logger.info(`Case ${case_label}: ${IRRELEVANT_QUESTION}`);
    let result: AgenticSearchResult;
    try {
      result = await runAgent(cfg, IRRELEVANT_QUESTION, LOW_RELEVANCE_CHUNKS, case_label);
    } catch (e) {
      return { status: 'error', detail: e instanceof Error ? e.message : String(e) };
    }

    const MAX_SEARCH = 3;
    const isRefuse = result.refuse === true;
    const withinBudget = result.searchCount <= MAX_SEARCH;

    if (isRefuse || withinBudget) {
      return {
        status: 'pass',
        detail: `refuse=${isRefuse}, searchCount=${result.searchCount}/${MAX_SEARCH}`
      };
    }
    return {
      status: 'fail',
      detail: `refuse=${isRefuse}, searchCount=${result.searchCount} exceeded ${MAX_SEARCH} (no early stop on irrelevant query)`
    };
  });
}

/**
 * A4: Playbook 路由准确性
 * 对比类问题应路由到 comparative_analysis 或 deep_research
 */
async function testA4PlaybookRouting(cfg: CompatConfig): Promise<TestCase> {
  return runCase('A4', 'Playbook 路由准确性', async () => {
    const case_label = 'A4';
    logger.info(`Case ${case_label}: ${COMPARISON_QUESTION}`);
    let result: AgenticSearchResult;
    try {
      result = await runAgent(cfg, COMPARISON_QUESTION, HIGH_RELEVANCE_CHUNKS_A4, case_label);
    } catch (e) {
      return { status: 'error', detail: e instanceof Error ? e.message : String(e) };
    }

    const EXPECTED = new Set(['comparative_analysis', 'deep_research']);
    const actual = result.playbook;

    if (EXPECTED.has(actual)) {
      return { status: 'pass', detail: `playbook=${actual}` };
    }
    return {
      status: 'fail',
      detail: `playbook=${actual}, expected one of [${[...EXPECTED].join(', ')}]`
    };
  });
}

/** 运行 Agent 层全部用例 A1-A4（并行执行，各用例互相独立） */
async function runAgentLayer(cfg: CompatConfig): Promise<TestCase[]> {
  console.log('\n  Running A1 (Agent Layer - requires real LLM + mock search)...');
  const onlya1 = await testA1AgentPipeline(cfg);
  return [onlya1];

  // console.log('\n  Running A1-A4 (Agent Layer - requires real LLM + mock search)...');
  // const [a1, a2, a3, a4] = await Promise.all([
  //   testA1AgentPipeline(cfg),
  //   testA2ToolCallLoop(cfg),
  //   testA3IrrelevantQueryStop(cfg),
  //   testA4PlaybookRouting(cfg)
  // ]);
  // return [a1, a2, a3, a4];
}

// ============================================================
// 主程序入口
// ============================================================

async function main(): Promise<void> {
  const cfg = parseArgs();

  console.log(`\n${BOLD}Testing model: ${cfg.model}${RESET}`);
  console.log(`${DIM}  Endpoint: ${cfg.endpoint}`);
  console.log(`  Layer:    ${cfg.layer}`);
  console.log(`  LLM Type: ${cfg.llmType}${RESET}`);

  const report: CompatReport = {
    model: cfg.model,
    endpoint: cfg.endpoint,
    timestamp: new Date().toISOString(),
    layers: {},
    recommendations: []
  };

  // API 层测试
  if (cfg.layer === 'api' || cfg.layer === 'both') {
    const t1t4 = await runAPILayerT1T4(cfg);
    const t5t7 = await runAPILayerT5T7(cfg);
    report.layers.api = makeLayerResult([...t1t4, ...t5t7]);
  }

  // Agent 层测试
  if (cfg.layer === 'agent' || cfg.layer === 'both') {
    const agentCases = await runAgentLayer(cfg);
    report.layers.agent = makeLayerResult(agentCases);
  }

  report.recommendations = buildRecommendations(report);
  printReport(report, cfg.llmType);

  // 输出 JSON 报告文件（可选）
  if (cfg.output) {
    const { writeFile } = await import('fs/promises');
    await writeFile(cfg.output, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`${CYAN}Report written to: ${cfg.output}${RESET}\n`);
  }

  // 退出码：全部通过 → 0；有失败/错误 → 1
  const allCases = [...(report.layers.api?.cases ?? []), ...(report.layers.agent?.cases ?? [])];
  const hasFail = allCases.some((c) => c.status === 'fail' || c.status === 'error');
  process.exit(hasFail ? 1 : 0);
}

// ============================================================
// 入口分发：区分 vitest 加载 与 tsx 直接执行
// ============================================================

const isVitestRuntime = typeof process.env.VITEST !== 'undefined';
const hasCustomEndpoint = !!(process.env.LLM_BASE_URL || process.env.LLM_ENDPOINT);

if (!isVitestRuntime) {
  // 直接执行模式（tsx test/model-compat.test.ts）
  main().catch((e) => {
    console.error('Fatal error:', e);
    process.exit(2);
  });
} else if (hasCustomEndpoint) {
  // vitest 模式 + 已配置真实 LLM 端点 → 运行兼容性测试
  describe('Model Compatibility (real LLM)', () => {
    it('run full compatibility suite', async () => {
      // 将 process.exit 替换为 throw，避免杀掉 vitest 进程
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
      // 正常情况下 main() 的 process.exit(0/1) 会 throw，只有无异常走完才是成功
    });
  });
} else {
  // vitest 模式 + 无真实 LLM 端点 → 跳过
  describe('Model Compatibility (real LLM)', () => {
    it.skip('no LLM endpoint configured — set LLM_BASE_URL to enable', () => {});
  });
}
