import { describe, expect, it } from 'vitest';

import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import {
  getIsMemberSyncMode,
  getRegisterMethods,
  getWebLLMModel,
  getWebDefaultLLMModel,
  getWebDefaultEmbeddingModel
} from '@/web/common/system/utils';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';

const createFeConfigs = (overrides: Partial<FastGPTFeConfigsType>): FastGPTFeConfigsType => ({
  uploadFileMaxAmount: 10,
  uploadFileMaxSize: 100,
  ...overrides
});

describe('system fe config utils', () => {
  it('uses the shared default-first policy for LLM and embedding candidates', () => {
    const previous = useUserModelStore.getState().defaultModels;
    const llm = global.systemDefaultModel.llm!;
    const embedding = global.systemDefaultModel.embedding!;
    const firstLlm = { ...llm, modelId: 'first-llm' };
    const firstEmbedding = { ...embedding, modelId: 'first-embedding' };
    useUserModelStore.setState({ defaultModels: { llm, embedding } });
    try {
      expect(getWebDefaultLLMModel([firstLlm, llm])).toBe(llm);
      expect(getWebDefaultLLMModel([firstLlm])).toBe(firstLlm);
      expect(getWebDefaultLLMModel([])).toBeUndefined();
      expect(getWebDefaultEmbeddingModel([firstEmbedding, embedding])).toBe(embedding);
      expect(getWebDefaultEmbeddingModel([firstEmbedding])).toBe(firstEmbedding);
      expect(getWebDefaultEmbeddingModel([])).toBeUndefined();
    } finally {
      useUserModelStore.setState({ defaultModels: previous });
    }
  });
  it.each([undefined, '', '   '])(
    'uses the explicit default-model policy consistently for empty values (%s)',
    (value) => {
      const previous = useUserModelStore.getState().defaultModels;
      const model = global.systemDefaultModel.llm!;
      useUserModelStore.setState({ defaultModels: { llm: model } });
      try {
        expect(getWebLLMModel(value, [])?.modelId).toBe(model.modelId);
        expect(getWebLLMModel('missing-id', [])).toBeUndefined();
      } finally {
        useUserModelStore.setState({ defaultModels: previous });
      }
    }
  );
  it('filters legacy sync from register methods', () => {
    expect(getRegisterMethods(createFeConfigs({ register_method: ['sync'] }))).toEqual([]);
    expect(
      getRegisterMethods(createFeConfigs({ register_method: ['email', 'sync', 'phone'] }))
    ).toEqual(['email', 'phone']);
  });

  it('detects member sync mode from new teamMode and legacy register_method', () => {
    expect(getIsMemberSyncMode(createFeConfigs({ teamMode: 'sync', register_method: [] }))).toBe(
      true
    );
    expect(getIsMemberSyncMode(createFeConfigs({ register_method: ['sync'] }))).toBe(true);
    expect(
      getIsMemberSyncMode(createFeConfigs({ teamMode: 'single', register_method: ['sync'] }))
    ).toBe(false);
    expect(
      getIsMemberSyncMode(createFeConfigs({ teamMode: 'multi', register_method: ['sync'] }))
    ).toBe(false);
    expect(
      getIsMemberSyncMode(createFeConfigs({ teamMode: 'multi', register_method: ['phone'] }))
    ).toBe(false);
    expect(getIsMemberSyncMode(createFeConfigs({ teamMode: 'single', register_method: [] }))).toBe(
      false
    );
  });
});
