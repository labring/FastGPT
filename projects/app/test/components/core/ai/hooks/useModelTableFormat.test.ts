import { describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

vi.mock('@/components/core/ai/PriceTiersLabel', () => ({
  default: () => 'PriceTiersLabelMock'
}));

import {
  formatModelTableList,
  type BaseFormatModelItem
} from '@/components/core/ai/hooks/useModelTableFormat';

describe('formatModelTableList (pure formatter)', () => {
  const t = (key: string) => key;

  const mockProviders: Record<string, { id: string; name: string; avatar: string; order: number }> =
    {
      openai: { id: 'openai', name: 'OpenAI', avatar: 'avatar-openai', order: 2 },
      anthropic: { id: 'anthropic', name: 'Anthropic', avatar: 'avatar-claude', order: 1 }
    };

  const getModelProvider = (provider?: string) =>
    (provider && mockProviders[provider]) ?? {
      id: provider,
      name: provider,
      avatar: '',
      order: 99
    };

  const sampleModels: BaseFormatModelItem[] = [
    {
      modelId: 'm1',
      name: 'GPT-4o',
      model: 'gpt-4o',
      type: ModelTypeEnum.llm,
      provider: 'openai',
      isActive: true,
      config: {
        maxContext: 128000,
        vision: true,
        reasoning: true
      }
    },
    {
      modelId: 'm2',
      name: 'Text-Embedding-3',
      model: 'text-embedding-3-small',
      type: ModelTypeEnum.embedding,
      provider: 'openai',
      charsPointsPrice: 0.1,
      isActive: false,
      config: {
        maxToken: 8192
      }
    },
    {
      modelId: 'm3',
      name: 'Claude 3.5 Sonnet',
      model: 'claude-3-5-sonnet',
      type: ModelTypeEnum.llm,
      provider: 'anthropic',
      isActive: true,
      config: {
        maxContext: 200000,
        vision: true,
        toolChoice: true
      }
    },
    {
      modelId: 'm4',
      name: 'OpenAI TTS',
      model: 'tts-1',
      type: ModelTypeEnum.tts,
      provider: 'openai',
      charsPointsPrice: 0.2,
      isActive: true,
      config: {}
    },
    {
      modelId: 'm5',
      name: 'Whisper-1',
      model: 'whisper-1',
      type: ModelTypeEnum.stt,
      provider: 'openai',
      charsPointsPrice: 0.3,
      isActive: false,
      config: {}
    },
    {
      modelId: 'm6',
      name: 'BGE Reranker',
      model: 'bge-reranker-large',
      type: ModelTypeEnum.rerank,
      provider: 'openai',
      charsPointsPrice: 0.05,
      isActive: true,
      config: {
        maxToken: 2048
      }
    }
  ];

  it('formats all 5 types of models with corresponding labels and capability tags', () => {
    const formattedList = formatModelTableList({
      models: sampleModels,
      getModelProvider,
      language: 'zh-CN',
      t
    });

    expect(formattedList).toHaveLength(6);

    const llm = formattedList.find((m) => m.modelId === 'm1')!;
    expect(llm.typeLabel).toBe('common:model.type.chat');
    expect(llm.tagColor).toBe('blue');
    expect(llm.contextToken).toBe(128000);
    expect(llm.vision).toBe(true);
    expect(llm.reasoning).toBe(true);
    expect(llm.providerName).toBe('OpenAI');

    const embedding = formattedList.find((m) => m.modelId === 'm2')!;
    expect(embedding.typeLabel).toBe('common:model.type.embedding');
    expect(embedding.tagColor).toBe('yellow');
    expect(embedding.contextToken).toBe(8192);

    const tts = formattedList.find((m) => m.modelId === 'm4')!;
    expect(tts.typeLabel).toBe('common:model.type.tts');
    expect(tts.tagColor).toBe('green');

    const stt = formattedList.find((m) => m.modelId === 'm5')!;
    expect(stt.typeLabel).toBe('common:model.type.stt');
    expect(stt.tagColor).toBe('purple');

    const rerank = formattedList.find((m) => m.modelId === 'm6')!;
    expect(rerank.typeLabel).toBe('common:model.type.reRank');
    expect(rerank.tagColor).toBe('red');
    expect(rerank.contextToken).toBe(2048);
  });

  it('filters by modelType correctly', () => {
    const formattedList = formatModelTableList({
      models: sampleModels,
      modelType: ModelTypeEnum.llm,
      getModelProvider,
      language: 'zh-CN',
      t
    });

    expect(formattedList).toHaveLength(2);
    expect(formattedList.every((m) => m.type === ModelTypeEnum.llm)).toBe(true);
  });

  it('filters by provider correctly', () => {
    const formattedList = formatModelTableList({
      models: sampleModels,
      provider: 'anthropic',
      getModelProvider,
      language: 'zh-CN',
      t
    });

    expect(formattedList).toHaveLength(1);
    expect(formattedList[0].modelId).toBe('m3');
  });

  it('filters by search term matching name or model slug', () => {
    const byName = formatModelTableList({
      models: sampleModels,
      search: 'sonnet',
      getModelProvider,
      language: 'zh-CN',
      t
    });
    expect(byName).toHaveLength(1);
    expect(byName[0].modelId).toBe('m3');

    const byModelSlug = formatModelTableList({
      models: sampleModels,
      search: 'embedding-3',
      getModelProvider,
      language: 'zh-CN',
      t
    });
    expect(byModelSlug).toHaveLength(1);
    expect(byModelSlug[0].modelId).toBe('m2');
  });

  it('filters by showActive to only return active models', () => {
    const formattedList = formatModelTableList({
      models: sampleModels,
      showActive: true,
      getModelProvider,
      language: 'zh-CN',
      t
    });

    expect(formattedList).toHaveLength(4);
    expect(formattedList.every((m) => m.isActive)).toBe(true);
  });

  it('sorts by provider order when sortByOrder is true', () => {
    const formattedList = formatModelTableList({
      models: sampleModels,
      sortByOrder: true,
      getModelProvider,
      language: 'zh-CN',
      t
    });

    // Anthropic has order: 1, OpenAI has order: 2
    expect(formattedList[0].providerId).toBe('anthropic');
    expect(formattedList[1].providerId).toBe('openai');
  });
});
