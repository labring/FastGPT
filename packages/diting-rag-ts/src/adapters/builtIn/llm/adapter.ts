// src/adapters/built-in/llm/adapter.ts
// Built-in LLM 适配器 - 调用兼容 OpenAI API 的远程服务

import type { LLMProvider } from '../../../ports/llm';
import { resolveLLMCallOptions } from '../../../ports/llm';
import type { LLMMessage, LLMResponse, LLMCallOptions } from '../../../types/message';
import type { Logger } from '../../../ports/logger';
import { stripThinkBlocks } from '../../../utils/text';

/**
 * Built-in LLM 配置
 */
export interface BuiltInLLMConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeout?: number;
  logger?: Logger;
  /** 固定温度（某些模型如 kimi-k2.5 必须为 1） */
  fixedTemperature?: number;
  /**
   * 该模型是否启用 thinking 模式。
   * 由外部探测（如模型兼容性测试）填充，adapter 不自测。
   * 影响 maxTokens 默认值：thinking 模型默认 16384，否则 8192。
   */
  defaultEnableThinking?: boolean;
}

function resolveTemperature(requested: number | undefined, fixed: number | undefined): number {
  // fixedTemperature 由外部探测后注入（如 kimi-k2.5 必须为 1），adapter 不自维护模型名列表
  return fixed ?? requested ?? 0.7;
}

/**
 * 从 content 中提取 <think>...</think> 块内的思考内容
 * @param content LLM 返回的原始 content
 * @returns 提取的思考内容，如果没有则返回 null
 */
function extractThinkContent(content: string): string | null {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    return thinkMatch[1].trim();
  }
  return null;
}

/**
 * 检测响应是否被截断
 * @param content LLM 返回的 content
 * @returns 是否疑似截断
 */
function detectTruncation(content: string): boolean {
  // 1. <think> 标签完整性检查
  const thinkOpenCount = (content.match(/<think[\s>]/gi) || []).length;
  const thinkCloseCount = (content.match(/<\/think>/gi) || []).length;
  if (thinkOpenCount > thinkCloseCount) {
    return true; // <think> 未闭合，疑似截断
  }

  // 2. JSON 截断检查：查找 JSON 块，检查括号/引号是否平衡
  // 匹配 ```json ... ``` 或 ``` ... ``` 块
  const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (jsonBlockMatch) {
    const jsonText = jsonBlockMatch[1];
    if (isTruncatedJson(jsonText)) return true;
  }

  // 3. 裸 JSON 截断（不以 ``` 包围，直接以 { 或 [ 开头）
  const trimmed = content.trim();
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && isTruncatedJson(trimmed)) {
    return true;
  }

  return false;
}

/**
 * 判断 JSON 字符串是否疑似截断（括号、引号不平衡）
 */
function isTruncatedJson(text: string): boolean {
  let braceDepth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\') {
      escaped = true;
      continue;
    }
    if (c === '"' && !escaped) {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (c === '{') braceDepth++;
    else if (c === '}') {
      braceDepth--;
      if (braceDepth < 0) return true;
    }
  }
  // 字符串未闭合也算截断
  if (inString) return true;
  if (braceDepth !== 0) return true;
  return false;
}

/**
 * 计算最终 maxTokens。
 * 仅依赖显式传入的 enableThinking 或 adapter 构造时的 defaultEnableThinking。
 * 不硬编码模型名列表，外部探测后通过配置注入。
 */
function resolveMaxTokens(
  requested: number | undefined,
  enableThinking: boolean | undefined,
  defaultEnableThinking: boolean
): number {
  const effectiveThinking = enableThinking ?? defaultEnableThinking;
  // 有明确 thinking 标志时为 thinking 模型分配更大空间；未指定时保守用较大值兜底
  return requested ?? (effectiveThinking ? 16384 : 8192);
}

/**
 * Built-in LLM 适配器
 * 通过环境变量配置，调用兼容 OpenAI API 的远程服务（如 Ollama、vLLM 等）
 */
export class BuiltInLLMAdapter implements LLMProvider {
  public readonly type = 'builtin' as const;
  public readonly modelName: string;

  private apiKey: string;
  private endpoint: string;
  private timeout: number;
  private logger?: Logger;
  private fixedTemperature?: number;
  private defaultEnableThinking: boolean;

  constructor(config: BuiltInLLMConfig = {}) {
    this.apiKey = config.apiKey || process.env.LLM_API_KEY || '';
    this.endpoint = config.endpoint || process.env.LLM_ENDPOINT || 'http://fastgpt-aiproxy:3000/v1';
    this.modelName = config.model || process.env.LLM_MODEL || 'Qwen3-Next-80B-A3B-Instruct-FP8';
    this.timeout = config.timeout || 120000;
    this.logger = config.logger;
    this.fixedTemperature = config.fixedTemperature;
    this.defaultEnableThinking = config.defaultEnableThinking ?? false;
  }

  /**
   * 构建请求头
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`
    };
  }

  /**
   * 同步调用
   */
  async chat(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMResponse> {
    const merged = resolveLLMCallOptions(options);
    const model = merged.model || this.modelName;
    const enableThinking = merged.enableThinking ?? this.defaultEnableThinking;
    const temperature = resolveTemperature(merged.temperature, this.fixedTemperature);
    const maxTokens = resolveMaxTokens(
      merged.maxTokens,
      enableThinking,
      this.defaultEnableThinking
    );

    this.logger?.debug('[LLM] chat called', {
      model,
      messageCount: messages.length,
      enableThinking,
      temperature,
      maxTokens
    });

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content
      })),
      temperature,
      stream: false,
      ...merged.extra
    };

    // 仅当调用方显式传了 maxTokens 时才发送，避免部分模型兼容问题
    if (merged.maxTokens !== undefined) {
      body.max_tokens = maxTokens;
    }

    // 显式传 enable_thinking，避免 Qwen3 等模型默认开启思考模式
    if (enableThinking !== undefined) {
      body.enable_thinking = enableThinking;
      body.chat_template_kwargs = { enable_thinking: enableThinking };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API error: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as {
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
      const rawContent = msg?.content ?? '';
      const finishReason = choice?.finish_reason;
      const reasoningContent = msg?.reasoning_content;

      // 从 content 中提取 <think> 思考内容（kimi-k2.5 等模型将思考输出在 content 中）
      const extractedReasoning = extractThinkContent(rawContent);
      const content = stripThinkBlocks(rawContent);
      const finalReasoning = reasoningContent || extractedReasoning || undefined;

      this.logger?.debug('[LLM] raw response', {
        finishReason,
        contentLen: content.length,
        reasoningLen: typeof finalReasoning === 'string' ? finalReasoning.length : 0,
        content: content || '(empty)'
      });

      // finish_reason=length 说明 token 用尽，强制截断；content 内检测用于兜底
      const truncated =
        finishReason === 'length' || (finishReason !== 'stop' && detectTruncation(content));

      if (truncated) {
        this.logger?.warn('[LLM] response truncated, retrying with 2x maxTokens', {
          model,
          maxTokens,
          nextMaxTokens: maxTokens * 2,
          finishReason,
          truncatedContent: content,
          reasoningContent
        });

        // 重试一次，maxTokens 翻倍
        const retryBody = { ...body, max_tokens: maxTokens * 2 };
        const retryResp = await fetch(`${this.endpoint}/chat/completions`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(retryBody),
          signal: controller.signal
        });

        if (!retryResp.ok) {
          this.logger?.warn('[LLM] retry failed, returning original truncated response', {
            status: retryResp.status
          });
          return {
            content,
            toolCalls: (msg?.tool_calls ?? []).map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.function.name, arguments: tc.function.arguments }
            })),
            reasoning: msg?.reasoning_content,
            usage: {
              inputTokens: data.usage?.prompt_tokens,
              outputTokens: data.usage?.completion_tokens
            }
          };
        }

        const retryData = (await retryResp.json()) as typeof data;
        const retryChoice = retryData.choices?.[0];
        const retryMsg = retryChoice?.message;

        // 重试响应同样处理 thinking 内容
        const retryRawContent = retryMsg?.content ?? '';
        const retryExtractedReasoning = extractThinkContent(retryRawContent);
        const retryContent = stripThinkBlocks(retryRawContent);
        const retryFinalReasoning =
          retryMsg?.reasoning_content || retryExtractedReasoning || undefined;

        return {
          content: retryContent,
          toolCalls: (retryMsg?.tool_calls ?? msg?.tool_calls ?? []).map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments }
          })),
          reasoning: retryFinalReasoning,
          usage: {
            inputTokens: retryData.usage?.prompt_tokens ?? data.usage?.prompt_tokens,
            outputTokens: retryData.usage?.completion_tokens ?? data.usage?.completion_tokens
          }
        };
      }

      return {
        content,
        toolCalls: (msg?.tool_calls ?? []).map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments }
        })),
        reasoning: finalReasoning,
        usage: {
          inputTokens: data.usage?.prompt_tokens,
          outputTokens: data.usage?.completion_tokens
        }
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 流式调用
   */
  async *chatStream(messages: LLMMessage[], options?: LLMCallOptions): AsyncIterable<LLMResponse> {
    const merged = resolveLLMCallOptions(options);
    const model = merged.model || this.modelName;
    const enableThinking = merged.enableThinking ?? this.defaultEnableThinking;
    const temperature = resolveTemperature(merged.temperature, this.fixedTemperature);
    const maxTokens = resolveMaxTokens(merged.maxTokens, enableThinking, this.defaultEnableThinking);

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content
      })),
      temperature,
      // max_tokens: maxTokens,
      stream: true,
      ...merged.extra
    };

    // 仅当调用方显式传了 maxTokens 时才发送，避免部分模型兼容问题
    if (merged.maxTokens !== undefined) {
      body.max_tokens = maxTokens;
    }

    // 显式传 enable_thinking，避免 Qwen3 等模型默认开启思考模式
    if (enableThinking !== undefined) {
      body.enable_thinking = enableThinking;
      body.chat_template_kwargs = { enable_thinking: enableThinking };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API error: ${response.status} ${errorText}`);
      }

      if (!response.body) {
        throw new Error('LLM response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
          if (dataStr === '[DONE]') {
            return;
          }

          try {
            const data = JSON.parse(dataStr) as {
              choices?: Array<{
                delta: { content?: string; reasoning_content?: string; tool_calls?: unknown };
              }>;
            };
            const delta = data.choices?.[0]?.delta;
            if (delta) {
              const rawContent = delta.content || '';
              const reasoningContent = delta.reasoning_content;
              // 流式响应中，thinking 内容可能通过 content 中的 <think> 标签传输（如 kimi-k2.5）
              const extractedReasoning = extractThinkContent(rawContent);
              const content = stripThinkBlocks(rawContent);
              const finalReasoning = reasoningContent || extractedReasoning || undefined;
              yield {
                content,
                reasoning: finalReasoning
              };
            }
          } catch {
            // 跳过解析错误
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 获取模型信息
   */
  getModelInfo() {
    return {
      name: this.modelName,
      contextWindow: 16000,
      maxOutputTokens: 8192
    };
  }
}
