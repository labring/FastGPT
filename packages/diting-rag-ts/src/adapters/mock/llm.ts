// src/adapters/mock/llm.ts
// Mock LLM Provider

import type { LLMProvider } from '../../ports/llm';
import type { LLMMessage, LLMResponse, LLMCallOptions } from '../../types/message';

export interface MockLLMOptions {
  modelName?: string;
  responses?: string[];
  responseDelay?: number;
  shouldFail?: boolean;
}

export class MockLLMProvider implements LLMProvider {
  private responses: string[];
  private index = 0;
  private responseDelay?: number;
  private shouldFail = false;
  public readonly type = 'openai' as const;
  public readonly modelName: string;

  constructor(options: MockLLMOptions = {}) {
    this.responses = options.responses || ['{"tool": "search", "queries": ["test"]}'];
    this.responseDelay = options.responseDelay;
    this.shouldFail = options.shouldFail || false;
    this.modelName = options.modelName || 'mock-llm';
  }

  async chat(_messages: LLMMessage[], _options?: LLMCallOptions): Promise<LLMResponse> {
    if (this.responseDelay) {
      await new Promise((resolve) => setTimeout(resolve, this.responseDelay));
    }
    if (this.shouldFail) {
      throw new Error('Mock LLM failure');
    }
    const content = this.responses[this.index++ % this.responses.length];
    return { content };
  }

  async *chatStream(
    _messages: LLMMessage[],
    _options?: LLMCallOptions
  ): AsyncIterable<LLMResponse> {
    const response = await this.chat(_messages, _options);
    yield response;
  }

  getModelInfo() {
    return { name: this.modelName, contextWindow: 16000, maxOutputTokens: 8192 };
  }
}
