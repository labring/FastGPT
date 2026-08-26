import { describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { repairSystemModelDocument } from '@fastgpt/service/core/ai/config/repair';

const canonicalLlm = {
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'gpt-test',
  name: 'GPT test',
  scope: 'system' as const,
  isActive: true,
  config: {
    maxContext: 32000,
    maxResponse: 16000,
    quoteMaxToken: 24000,
    toolChoice: true
  }
};

describe('repairSystemModelDocument', () => {
  it('keeps a valid canonical document and never lets residual metadata overwrite it', () => {
    const result = repairSystemModelDocument({
      record: {
        ...canonicalLlm,
        metadata: {
          ...canonicalLlm,
          maxContext: 1
        }
      }
    });

    expect(result).toMatchObject({
      status: 'unchanged',
      document: { config: { maxContext: 32000 } }
    });
  });

  it('writes scope for canonical documents that only persisted the legacy isSystem field', () => {
    const { scope: _scope, ...legacyCanonical } = canonicalLlm;
    const result = repairSystemModelDocument({
      record: { ...legacyCanonical, isSystem: true }
    });

    expect(result).toMatchObject({
      status: 'repaired',
      document: { scope: 'system', model: 'gpt-test' }
    });
  });

  it('migrates legacy metadata, coerces known values and removes invalid optional fields', () => {
    const result = repairSystemModelDocument({
      record: {
        model: ' legacy-llm ',
        metadata: {
          type: ModelTypeEnum.llm,
          provider: ' OpenAI ',
          name: '',
          maxContext: '64000',
          maxResponse: 'invalid',
          quoteMaxToken: null,
          maxTemperature: 'invalid',
          toolChoice: 'true',
          defaultConfig: '',
          charsPointsPrice: '2.5',
          priceTiers: JSON.stringify([
            { inputPrice: '0.1', outputPrice: '0.2' },
            { inputPrice: 'invalid', outputPrice: 1 }
          ])
        }
      }
    });

    expect(result).toMatchObject({
      status: 'repaired',
      document: {
        model: 'legacy-llm',
        name: 'legacy-llm',
        provider: 'OpenAI',
        charsPointsPrice: 2.5,
        priceTiers: [{ inputPrice: 0.1, outputPrice: 0.2 }],
        config: {
          maxContext: 64000,
          maxResponse: 16000,
          quoteMaxToken: 13000,
          toolChoice: true
        }
      }
    });
    if (result.status !== 'invalid') {
      expect(result.document.config).not.toHaveProperty('maxTemperature');
      expect(result.document.config).not.toHaveProperty('defaultConfig');
    }
  });

  it('repairs invalid canonical fields with plugin values before type defaults', () => {
    const result = repairSystemModelDocument({
      record: {
        ...canonicalLlm,
        provider: 1,
        config: {
          maxContext: 'invalid',
          maxResponse: '8000',
          quoteMaxToken: 'invalid'
        }
      },
      pluginDocument: {
        ...canonicalLlm,
        config: {
          maxContext: 128000,
          maxResponse: 32000,
          quoteMaxToken: 100000
        }
      }
    });

    expect(result).toMatchObject({
      status: 'repaired',
      document: {
        provider: 'OpenAI',
        config: {
          maxContext: 128000,
          maxResponse: 8000,
          quoteMaxToken: 100000
        }
      }
    });
  });

  it.each([
    {
      record: {
        type: ModelTypeEnum.embedding,
        provider: 'OpenAI',
        model: 'embedding',
        name: 'Embedding',
        config: { defaultToken: '500', maxToken: null, weight: 'invalid', hidden: 'false' }
      },
      expected: { config: { defaultToken: 500, maxToken: 3000, weight: 0, hidden: false } }
    },
    {
      record: {
        type: ModelTypeEnum.rerank,
        provider: 'Cohere',
        model: 'rerank',
        name: 'Rerank',
        config: { maxToken: '4096', defaultConfig: '' }
      },
      expected: { config: { maxToken: 4096 } }
    },
    {
      record: {
        type: ModelTypeEnum.tts,
        provider: 'MiniMax',
        model: 'tts',
        name: 'TTS',
        config: {
          voices: [{ label: ' Voice ', value: ' voice-id ' }, { label: '', value: 'invalid' }, null]
        }
      },
      expected: { config: { voices: [{ label: 'Voice', value: 'voice-id' }] } }
    },
    {
      record: {
        type: ModelTypeEnum.stt,
        provider: 'OpenAI',
        model: 'stt',
        name: 'STT',
        config: 'invalid'
      },
      expected: { config: {} }
    }
  ])('repairs $record.type model-specific config', ({ record, expected }) => {
    expect(repairSystemModelDocument({ record })).toMatchObject({
      status: 'repaired',
      document: expected
    });
  });

  it('returns invalid when model identity cannot be recovered', () => {
    expect(
      repairSystemModelDocument({
        record: { model: '', provider: null, type: 'unknown', metadata: {} }
      })
    ).toMatchObject({ status: 'invalid' });
  });
});
