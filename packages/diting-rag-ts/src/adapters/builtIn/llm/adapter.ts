// src/adapters/built-in/llm/adapter.ts
// Built-in LLM 适配器 - 调用兼容 OpenAI API 的远程服务

import type { LLMProvider } from '../../../ports/llm';
import type { LLMMessage, LLMResponse, LLMCallOptions } from '../../../types/message';
import type { Logger } from '../../../ports/logger';

/**
 * Built-in LLM 配置
 */
export interface BuiltInLLMConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeout?: number;
  logger?: Logger;
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

  constructor(config: BuiltInLLMConfig = {}) {
    this.apiKey = config.apiKey || process.env.LLM_API_KEY || '';
    this.endpoint = config.endpoint || process.env.LLM_ENDPOINT || 'http://fastgpt-aiproxy:3000/v1';
    this.modelName = config.model || process.env.LLM_MODEL || 'Qwen3-Next-80B-A3B-Instruct-FP8';
    this.timeout = config.timeout || 120000;
    this.logger = config.logger;
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
    this.logger?.debug('[LLM] chat called', {
      model: options?.model || this.modelName,
      messageCount: messages.length
    });
    const body: Record<string, unknown> = {
      model: options?.model || this.modelName,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 8192,
      stream: false
    };

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
        choices?: Array<{ message: { content: string; reasoning_content?: string } }>;
        content?: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const choice = data.choices?.[0]?.message;
      return {
        content: choice?.content || data.content || '',
        reasoning: choice?.reasoning_content || undefined,
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
    const body: Record<string, unknown> = {
      model: options?.model || this.modelName,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 8192,
      stream: true
    };

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
              choices?: Array<{ delta: { content?: string; reasoning_content?: string } }>;
            };
            const delta = data.choices?.[0]?.delta;
            if (delta) {
              yield {
                content: delta.content || '',
                reasoning: delta.reasoning_content || undefined
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
