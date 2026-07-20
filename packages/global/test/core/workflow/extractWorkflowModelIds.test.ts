import { describe, expect, it } from 'vitest';
import { extractWorkflowModelIds } from '@fastgpt/global/core/workflow/utils';

describe('extractWorkflowModelIds', () => {
  const modules = [
    {
      inputs: [
        { key: 'modelId', value: 'llm-1' },
        { key: 'rerankModelId', value: 'rerank-1' },
        { key: 'datasetSearchExtensionModelId', value: 'ext-1' },
        { key: 'datasetDeepSearchModelId', value: 'deep-1' },
        {
          key: 'agent_datasetParams',
          value: { embeddingModelId: 'emb-1', rerankModelId: 'rerank-2' }
        },
        { key: 'other', value: 'not-a-model' }
      ]
    },
    {
      inputs: [{ key: 'modelId', value: 'llm-1' }] // duplicate
    }
  ];

  it('extracts all modelId variants from modules', () => {
    const ids = extractWorkflowModelIds({ modules });
    expect(ids).toEqual(
      expect.arrayContaining(['llm-1', 'rerank-1', 'ext-1', 'deep-1', 'emb-1', 'rerank-2'])
    );
  });

  it('deduplicates', () => {
    const ids = extractWorkflowModelIds({ modules });
    expect(ids.filter((id) => id === 'llm-1')).toHaveLength(1);
  });

  it('ignores non-string values and unrelated keys', () => {
    const ids = extractWorkflowModelIds({
      modules: [
        {
          inputs: [
            { key: 'modelId', value: 42 },
            { key: 'other', value: 'x' }
          ]
        }
      ]
    });
    expect(ids).toEqual([]);
  });

  it('extracts from chatConfig questionGuide and ttsConfig', () => {
    const ids = extractWorkflowModelIds({
      modules: [],
      chatConfig: {
        questionGuide: { open: true, modelId: 'qg-1' },
        ttsConfig: { type: 'model', modelId: 'tts-1' }
      }
    });
    expect(ids).toEqual(expect.arrayContaining(['qg-1', 'tts-1']));
  });

  it('ignores disabled question guide and non-model TTS config', () => {
    const ids = extractWorkflowModelIds({
      modules: [],
      chatConfig: {
        questionGuide: { open: false, model: 'missing-qg-model' },
        ttsConfig: { type: 'web', model: 'missing-tts-model' }
      }
    });

    expect(ids).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(extractWorkflowModelIds({})).toEqual([]);
  });

  // ⚠️ 热升级兼容：legacy key 必须同步识别（热升级技术分析 §6.4 item 4）
  it('extracts legacy input keys (model/rerankModel/...)', () => {
    const ids = extractWorkflowModelIds({
      modules: [
        {
          inputs: [
            { key: 'model', value: 'llm-legacy' },
            { key: 'rerankModel', value: 'rerank-legacy' },
            { key: 'datasetSearchExtensionModel', value: 'ext-legacy' },
            { key: 'datasetDeepSearchModel', value: 'deep-legacy' },
            { key: 'other', value: 'not-a-model' }
          ]
        }
      ]
    });
    expect(ids).toEqual(
      expect.arrayContaining(['llm-legacy', 'rerank-legacy', 'ext-legacy', 'deep-legacy'])
    );
    expect(ids).not.toContain('not-a-model');
  });

  it('extracts legacy datasetParams embedded fields', () => {
    const ids = extractWorkflowModelIds({
      modules: [
        {
          inputs: [
            {
              key: 'agent_datasetParams',
              value: {
                embeddingModel: 'emb-legacy',
                rerankModel: 'rerank-legacy',
                datasetSearchExtensionModel: 'ext-legacy',
                datasetDeepSearchModel: 'deep-legacy'
              }
            }
          ]
        }
      ]
    });
    expect(ids).toEqual(
      expect.arrayContaining(['emb-legacy', 'rerank-legacy', 'ext-legacy', 'deep-legacy'])
    );
  });

  it('extracts legacy chatConfig questionGuide.model / ttsConfig.model', () => {
    const ids = extractWorkflowModelIds({
      modules: [],
      chatConfig: {
        questionGuide: { open: true, model: 'qg-legacy' },
        ttsConfig: { type: 'model', model: 'tts-legacy' }
      }
    });
    expect(ids).toEqual(expect.arrayContaining(['qg-legacy', 'tts-legacy']));
  });

  it('deduplicates when dual keys carry the same value', () => {
    const ids = extractWorkflowModelIds({
      modules: [
        {
          inputs: [
            { key: 'model', value: 'llm-1' },
            { key: 'modelId', value: 'llm-1' }
          ]
        }
      ],
      chatConfig: {
        questionGuide: { open: true, model: 'qg-1', modelId: 'qg-1' }
      }
    });
    expect(ids.filter((id) => id === 'llm-1')).toHaveLength(1);
    expect(ids.filter((id) => id === 'qg-1')).toHaveLength(1);
  });
});
