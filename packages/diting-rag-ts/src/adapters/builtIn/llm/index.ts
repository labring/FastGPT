// src/adapters/built-in/llm/index.ts
// Built-in LLM Adapter - 调用兼容 OpenAI API 的远程服务

export { BuiltInLLMAdapter, type BuiltInLLMConfig } from './adapter';
export { createBuiltInLLMProvider } from './wrappers';
