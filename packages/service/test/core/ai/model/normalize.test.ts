import { describe, expect, it } from 'vitest';
import {
  normalizeSystemModel,
  normalizeLegacyModelDoc
} from '@fastgpt/service/core/ai/model/normalize';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

describe('normalizeSystemModel', () => {
  const validLLM = {
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

  it('should strip id field from output', () => {
    const result = normalizeSystemModel({ ...validLLM, id: 'some-id' });
    expect(result).not.toHaveProperty('id');
  });

  it('should pass through valid LLM fields', () => {
    const result = normalizeSystemModel(validLLM);
    expect(result.model).toBe('gpt-4o');
    expect(result.maxContext).toBe(128000);
  });

  it('should reject missing required fields', () => {
    expect(() => normalizeSystemModel({ type: 'llm', provider: 'test' })).toThrow();
  });

  it('should strip unknown fields not in schema', () => {
    const result = normalizeSystemModel({ ...validLLM, unknownField: 'should-be-removed' });
    expect(result).not.toHaveProperty('unknownField');
  });

  it('should fill schema defaults for optional fields', () => {
    const result = normalizeSystemModel(validLLM);
    // Schema defaults are Zod defaults, not explicit values
    expect(result).toHaveProperty('model');
  });

  it('should handle embedding type', () => {
    const result = normalizeSystemModel({
      type: 'embedding' as const,
      provider: 'test',
      model: 'emb-3',
      name: 'Embedding',
      defaultToken: 512,
      maxToken: 8192,
      weight: 100
    });
    expect(result.model).toBe('emb-3');
    expect(result.defaultToken).toBe(512);
  });

  it('should handle tts type with voices', () => {
    const result = normalizeSystemModel({
      type: 'tts' as const,
      provider: 'test',
      model: 'tts-1',
      name: 'TTS',
      voices: [{ label: 'A', value: 'a' }]
    });
    expect(result.model).toBe('tts-1');
    expect(result.voices).toEqual([{ label: 'A', value: 'a' }]);
  });

  it('should handle stt type', () => {
    const result = normalizeSystemModel({
      type: 'stt' as const,
      provider: 'test',
      model: 'whisper-1',
      name: 'Whisper'
    });
    expect(result.model).toBe('whisper-1');
  });

  it('should handle rerank type', () => {
    const result = normalizeSystemModel({
      type: 'rerank' as const,
      provider: 'test',
      model: 'rerank-3',
      name: 'Rerank'
    });
    expect(result.model).toBe('rerank-3');
  });
});

describe('normalizeLegacyModelDoc (hot-upgrade legacy schema)', () => {
  it('passes flat docs through unchanged', () => {
    const result = normalizeLegacyModelDoc({
      _id: 'id-1',
      model: 'gpt-4o',
      type: 'llm',
      isSystem: true,
      isActive: true
    });
    expect(result.model).toBe('gpt-4o');
    expect(result.isSystem).toBe(true);
    expect(result.id).toBe('id-1');
  });

  it('fills missing top-level fields from legacy metadata (top-level wins)', () => {
    const result = normalizeLegacyModelDoc({
      _id: 'id-1',
      model: 'legacy-gpt',
      type: 'llm', // top-level wins over metadata.type
      metadata: {
        type: 'embedding',
        provider: 'openai',
        name: 'Legacy GPT',
        isActive: true,
        isDefault: true,
        isCustom: false,
        requestUrl: 'https://legacy.example.com',
        requestAuth: 'legacy-key'
      }
    });
    expect(result.type).toBe('llm'); // top-level preferred
    expect(result.provider).toBe('openai'); // filled from metadata
    expect(result.name).toBe('Legacy GPT');
    expect(result.isActive).toBe(true);
    // legacy default flag preserved (resolveSystemDefaults reads it)
    expect(result.isDefault).toBe(true);
    // requestUrl/requestAuth NOT flattened (channels own them now)
    expect(result.requestUrl).toBeUndefined();
    expect(result.requestAuth).toBeUndefined();
    // nested metadata dropped from the in-memory shape
    expect(result.metadata).toBeUndefined();
  });

  it('derives isSystem from isCustom', () => {
    expect(normalizeLegacyModelDoc({ model: 'a', metadata: { isCustom: false } }).isSystem).toBe(
      true
    );
    expect(normalizeLegacyModelDoc({ model: 'b', metadata: { isCustom: true } }).isSystem).toBe(
      false
    );
  });

  it('derives isSystem from owner presence when isCustom is missing', () => {
    // no owner → system model
    expect(normalizeLegacyModelDoc({ model: 'a' }).isSystem).toBe(true);
    // has tmbId → private model
    expect(
      normalizeLegacyModelDoc({ model: 'b', tmbId: '507f1f77bcf86cd799439011' }).isSystem
    ).toBe(false);
  });

  it('keeps an explicit isSystem (never overwritten)', () => {
    expect(
      normalizeLegacyModelDoc({ model: 'a', isSystem: true, metadata: { isCustom: true } }).isSystem
    ).toBe(true);
  });
});
