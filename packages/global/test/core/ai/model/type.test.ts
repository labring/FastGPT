import { describe, expect, it } from 'vitest';
import {
  LLMModelItemSchema,
  EmbeddingModelItemSchema,
  TTSModelItemSchema,
  STTModelItemSchema,
  RerankModelItemSchema,
  BaseModelItemSchema
} from '@fastgpt/global/core/ai/model/type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

describe('BaseModelItemSchema (refactored)', () => {
  it('should accept valid base fields with isSystem', () => {
    const result = BaseModelItemSchema.safeParse({
      id: 'model-id-1',
      provider: 'openai',
      model: 'gpt-4o',
      name: 'GPT-4o',
      avatar: '/icon.svg',
      isActive: true,
      isSystem: true,
      testMode: false,
      tmbId: 'some-tmb-id',
      teamId: 'some-team-id'
    });
    expect(result.success).toBe(true);
  });

  it('should use isSystem instead of isCustom (isCustom not in shape)', () => {
    // isCustom should NOT exist in the schema shape
    const shape = BaseModelItemSchema.shape;
    expect(shape).not.toHaveProperty('isCustom');
    expect(shape).toHaveProperty('isSystem');
  });

  it('should NOT have requestUrl/requestAuth in schema shape', () => {
    const shape = BaseModelItemSchema.shape;
    expect(shape).not.toHaveProperty('requestUrl');
    expect(shape).not.toHaveProperty('requestAuth');
  });

  it('should NOT have isDefault in schema shape', () => {
    const shape = BaseModelItemSchema.shape;
    expect(shape).not.toHaveProperty('isDefault');
  });

  it('should allow isSystem=true without tmbId/teamId (system model)', () => {
    const result = BaseModelItemSchema.safeParse({
      id: 'model-id-2',
      provider: 'openai',
      model: 'gpt-4o',
      name: 'GPT-4o',
      isSystem: true
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tmbId).toBeUndefined();
      expect(result.data.teamId).toBeUndefined();
    }
  });

  it('should allow tmbId/teamId for private models (isSystem: false)', () => {
    const result = BaseModelItemSchema.safeParse({
      id: 'model-id-3',
      provider: 'openai',
      model: 'gpt-4o',
      name: 'GPT-4o',
      isSystem: false,
      tmbId: 'tmb-id',
      teamId: 'team-id'
    });
    expect(result.success).toBe(true);
  });
});

describe('LLMModelItemSchema (refactored)', () => {
  const validLLM = {
    id: 'model-llm-1',
    type: 'llm' as const,
    provider: 'openai',
    model: 'gpt-4o',
    name: 'GPT-4o',
    maxContext: 128000,
    maxResponse: 4096,
    quoteMaxToken: 120000,
    functionCall: true,
    toolChoice: true
  };

  it('should parse valid LLM model', () => {
    const result = LLMModelItemSchema.safeParse(validLLM);
    expect(result.success).toBe(true);
  });

  it('should support isSystem field', () => {
    const result = LLMModelItemSchema.safeParse({ ...validLLM, isSystem: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isSystem).toBe(true);
  });

  it('should reject model without required LLM fields', () => {
    const result = LLMModelItemSchema.safeParse({ type: 'llm', provider: 'openai' });
    expect(result.success).toBe(false);
  });

  it('should support optional LLM fields (vision, audio, reasoning, etc.)', () => {
    const result = LLMModelItemSchema.safeParse({
      ...validLLM,
      vision: true,
      audio: true,
      reasoning: true,
      maxTemperature: 2.0,
      defaultSystemChatPrompt: 'You are helpful.',
      defaultConfig: { temperature: 0.7 },
      fieldMap: { prompt: 'messages' }
    });
    expect(result.success).toBe(true);
  });

  it('should NOT have requestUrl/requestAuth in shape', () => {
    const shape = LLMModelItemSchema.shape;
    expect(shape).not.toHaveProperty('requestUrl');
    expect(shape).not.toHaveProperty('requestAuth');
  });

  it('should NOT have isDefault fields in shape', () => {
    const shape = LLMModelItemSchema.shape;
    expect(shape).not.toHaveProperty('isDefault');
    expect(shape).not.toHaveProperty('isDefaultDatasetTextModel');
    expect(shape).not.toHaveProperty('isDefaultDatasetImageModel');
    expect(shape).not.toHaveProperty('isDefaultChatTitleModel');
  });
});

describe('EmbeddingModelItemSchema (refactored)', () => {
  it('should parse valid embedding model', () => {
    const result = EmbeddingModelItemSchema.safeParse({
      id: 'model-emb-1',
      type: 'embedding' as const,
      provider: 'openai',
      model: 'text-embedding-3-small',
      name: 'Embedding-3-Small',
      defaultToken: 512,
      maxToken: 8192,
      weight: 100
    });
    expect(result.success).toBe(true);
  });

  it('should NOT have requestUrl/requestAuth in shape', () => {
    const shape = EmbeddingModelItemSchema.shape;
    expect(shape).not.toHaveProperty('requestUrl');
    expect(shape).not.toHaveProperty('requestAuth');
  });
});

describe('TTSModelItemSchema (refactored)', () => {
  it('should parse valid TTS model with voices', () => {
    const result = TTSModelItemSchema.safeParse({
      id: 'model-tts-1',
      type: 'tts' as const,
      provider: 'openai',
      model: 'tts-1',
      name: 'TTS-1',
      voices: [{ label: 'Alloy', value: 'alloy' }]
    });
    expect(result.success).toBe(true);
  });

  it('should NOT have requestUrl/requestAuth in shape', () => {
    const shape = TTSModelItemSchema.shape;
    expect(shape).not.toHaveProperty('requestUrl');
    expect(shape).not.toHaveProperty('requestAuth');
  });
});

describe('STTModelItemSchema (refactored)', () => {
  it('should parse valid STT model', () => {
    const result = STTModelItemSchema.safeParse({
      id: 'model-stt-1',
      type: 'stt' as const,
      provider: 'openai',
      model: 'whisper-1',
      name: 'Whisper'
    });
    expect(result.success).toBe(true);
  });
});

describe('RerankModelItemSchema (refactored)', () => {
  it('should parse valid rerank model', () => {
    const result = RerankModelItemSchema.safeParse({
      id: 'model-rerank-1',
      type: 'rerank' as const,
      provider: 'cohere',
      model: 'rerank-3',
      name: 'Rerank-3',
      maxToken: 4096,
      defaultConfig: { top_n: 3 }
    });
    expect(result.success).toBe(true);
  });
});
