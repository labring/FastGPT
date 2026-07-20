import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  getLLMModel,
  getEmbeddingModel,
  getTTSModel,
  getSTTModel,
  getRerankModel,
  getVlmModel,
  getDefaultLLMModel,
  getDefaultEmbeddingModel,
  getDefaultTTSModel,
  getDefaultSTTModel,
  getDefaultRerankModel,
  getDefaultVLMModel,
  getDefaultChatTitleModel,
  getDefaultHelperBotModel,
  getModelById,
  isImageEmbeddingModel,
  assertModelActive,
  assertModelUsable
} from '@fastgpt/service/core/ai/model/cache';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import type {
  LLMModelItemType,
  EmbeddingModelItemType,
  TTSModelType,
  STTModelType,
  RerankModelItemType
} from '@fastgpt/global/core/ai/model/type';
import type { SystemModelItemType } from '@fastgpt/service/core/ai/model/type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

// Build minimal model object with id field
const makeLLM = (id: string, overrides?: Partial<LLMModelItemType>): LLMModelItemType => ({
  type: ModelTypeEnum.llm,
  provider: 'test',
  model: 'test-model',
  name: 'Test Model',
  maxContext: 16000,
  maxResponse: 8000,
  quoteMaxToken: 12000,
  functionCall: true,
  toolChoice: true,
  isActive: true,
  isSystem: true,
  id,
  ...overrides
});

const makeEmbedding = (
  id: string,
  overrides?: Partial<EmbeddingModelItemType>
): EmbeddingModelItemType => ({
  type: ModelTypeEnum.embedding,
  provider: 'test',
  model: 'test-emb',
  name: 'Test Embedding',
  defaultToken: 512,
  maxToken: 8192,
  weight: 100,
  isActive: true,
  isSystem: true,
  id,
  ...overrides
});

const makeTTS = (id: string, overrides?: Partial<TTSModelType>): TTSModelType => ({
  type: ModelTypeEnum.tts,
  provider: 'test',
  model: 'test-tts',
  name: 'Test TTS',
  voices: [{ label: 'A', value: 'a' }],
  isActive: true,
  isSystem: true,
  id,
  ...overrides
});

const makeSTT = (id: string, overrides?: Partial<STTModelType>): STTModelType => ({
  type: ModelTypeEnum.stt,
  provider: 'test',
  model: 'test-stt',
  name: 'Test STT',
  isActive: true,
  isSystem: true,
  id,
  ...overrides
});

const makeRerank = (id: string, overrides?: Partial<RerankModelItemType>): RerankModelItemType => ({
  type: ModelTypeEnum.rerank,
  provider: 'test',
  model: 'test-rerank',
  name: 'Test Rerank',
  isActive: true,
  isSystem: true,
  id,
  ...overrides
});

function setupTestModels() {
  const llm1 = makeLLM('llm-id-001', { model: 'gpt-4o', name: 'GPT-4o' });
  const llm2 = makeLLM('llm-id-002', { model: 'gpt-4o', name: 'GPT-4o V2', vision: true });
  const emb1 = makeEmbedding('emb-id-001');
  const tts1 = makeTTS('tts-id-001');
  const stt1 = makeSTT('stt-id-001');
  const rerank1 = makeRerank('rerank-id-001');

  // Populate id-based maps (new style)
  global.systemModelIdMap = new Map<string, SystemModelItemType>([
    ['llm-id-001', llm1],
    ['llm-id-002', llm2],
    ['emb-id-001', emb1],
    ['tts-id-001', tts1],
    ['stt-id-001', stt1],
    ['rerank-id-001', rerank1]
  ]);

  global.llmModelIdMap = new Map([
    ['llm-id-001', llm1],
    ['llm-id-002', llm2]
  ]);
  global.embeddingModelIdMap = new Map([['emb-id-001', emb1]]);
  global.ttsModelIdMap = new Map([['tts-id-001', tts1]]);
  global.sttModelIdMap = new Map([['stt-id-001', stt1]]);
  global.reRankModelIdMap = new Map([['rerank-id-001', rerank1]]);

  // Legacy-name compat indexes (@deprecated, hot-upgrade window): 'gpt-4o'
  // collides between llm1 (system) and llm2 (system) — first-wins keeps llm1.
  global.llmModelNameMap = new Map([
    ['gpt-4o', llm1],
    ['GPT-4o', llm1],
    ['GPT-4o V2', llm2]
  ]);
  global.embeddingModelNameMap = new Map([
    ['test-emb', emb1],
    ['Test Embedding', emb1]
  ]);
  global.ttsModelNameMap = new Map([['test-tts', tts1]]);
  global.sttModelNameMap = new Map([['test-stt', stt1]]);
  global.reRankModelNameMap = new Map([['test-rerank', rerank1]]);

  global.systemModelList = [llm1, llm2, emb1, tts1, stt1, rerank1];
  global.systemActiveModelList = [llm1, llm2, emb1, tts1, stt1, rerank1];

  global.systemDefaultModel = {
    llm: llm1,
    embedding: emb1,
    tts: tts1,
    stt: stt1,
    rerank: rerank1,
    datasetTextLLM: llm1,
    datasetImageLLM: llm2,
    chatTitleLLM: llm1,
    helperBotLLM: llm1
  };
}

function clearTestModels() {
  global.systemModelIdMap = new Map();
  global.llmModelIdMap = new Map();
  global.embeddingModelIdMap = new Map();
  global.ttsModelIdMap = new Map();
  global.sttModelIdMap = new Map();
  global.reRankModelIdMap = new Map();
  global.llmModelNameMap = new Map();
  global.embeddingModelNameMap = new Map();
  global.ttsModelNameMap = new Map();
  global.sttModelNameMap = new Map();
  global.reRankModelNameMap = new Map();
  global.systemModelList = [];
  global.systemActiveModelList = [];
  global.systemDefaultModel = {};
}

describe('getModelById (new)', () => {
  beforeEach(setupTestModels);
  afterEach(clearTestModels);

  it('should return model by id', () => {
    const m = getModelById('llm-id-001');
    expect(m).toBeDefined();
    expect(m?.model).toBe('gpt-4o');
  });

  it('should return undefined for unknown id', () => {
    expect(getModelById('nonexistent')).toBeUndefined();
  });
});

describe('getLLMModel (refactored)', () => {
  beforeEach(setupTestModels);
  afterEach(clearTestModels);

  it('should return LLM model by modelId', () => {
    const m = getLLMModel('llm-id-001');
    expect(m).toBeDefined();
    expect(m?.model).toBe('gpt-4o');
  });

  it('should return undefined for unknown modelId', () => {
    expect(getLLMModel('nonexistent')).toBeUndefined();
  });
});

describe('legacy-name fallback (hot-upgrade, system-only scope)', () => {
  beforeEach(setupTestModels);
  afterEach(clearTestModels);

  it('getLLMModel resolves a system model by provider model name', () => {
    const m = getLLMModel('gpt-4o');
    expect(m?.id).toBe('llm-id-001');
  });

  it('getLLMModel resolves a system model by alias (name field)', () => {
    const m = getLLMModel('GPT-4o');
    expect(m?.id).toBe('llm-id-001');
  });

  it('getLLMModel does NOT resolve a private (team) model by name — system-only scope', () => {
    const privateLlm = makeLLM('llm-id-private', {
      model: 'private-model',
      name: 'Private Model',
      isSystem: false,
      teamId: 'team-a'
    });
    global.llmModelNameMap.set('private-model', privateLlm);
    expect(getLLMModel('private-model')).toBeUndefined();
  });

  it('getLLMModel does not fall back to name lookup for ObjectId-shaped input', () => {
    const oidLike = '507f1f77bcf86cd799439011';
    const oidLikeModel = makeLLM('llm-id-oid', { model: oidLike, name: 'OID Like' });
    global.llmModelNameMap.set(oidLike, oidLikeModel);
    // Valid ObjectId shape → must not be resolved via the name index
    expect(getLLMModel(oidLike)).toBeUndefined();
  });

  it('getLLMModel returns undefined for an unknown name', () => {
    expect(getLLMModel('no-such-model')).toBeUndefined();
  });

  it('getEmbeddingModel resolves by provider model name and alias', () => {
    expect(getEmbeddingModel('test-emb')?.id).toBe('emb-id-001');
    expect(getEmbeddingModel('Test Embedding')?.id).toBe('emb-id-001');
  });

  it('getTTSModel / getSTTModel / getRerankModel resolve by provider model name', () => {
    expect(getTTSModel('test-tts')?.id).toBe('tts-id-001');
    expect(getSTTModel('test-stt')?.id).toBe('stt-id-001');
    expect(getRerankModel('test-rerank')?.id).toBe('rerank-id-001');
  });

  it('getModelById resolves a legacy name across types (system-only)', () => {
    expect(getModelById('gpt-4o')?.id).toBe('llm-id-001');
    expect(getModelById('test-emb')?.id).toBe('emb-id-001');
    expect(getModelById('test-tts')?.id).toBe('tts-id-001');
  });

  it('getModelById does NOT resolve a private model name', () => {
    const privateLlm = makeLLM('llm-id-private', {
      model: 'private-model',
      isSystem: false,
      teamId: 'team-a'
    });
    global.llmModelNameMap.set('private-model', privateLlm);
    expect(getModelById('private-model')).toBeUndefined();
  });

  it('getVlmModel resolves a vision model by name', () => {
    // llm2 is the vision model; its id map key 'llm-id-002' and name 'GPT-4o V2'
    expect(getVlmModel('GPT-4o V2')?.id).toBe('llm-id-002');
    // 'gpt-4o' (llm1, no vision) must not be returned as a VLM
    expect(getVlmModel('gpt-4o')).toBeUndefined();
  });

  it('isImageEmbeddingModel resolves by name', () => {
    const visionEmb = makeEmbedding('emb-id-vision', { model: 'clip-emb', vision: true });
    global.embeddingModelIdMap.set('emb-id-vision', visionEmb);
    global.embeddingModelNameMap.set('clip-emb', visionEmb);
    expect(isImageEmbeddingModel('clip-emb')).toBe(true);
    expect(isImageEmbeddingModel('test-emb')).toBe(false);
  });

  it('colliding name keeps the first-wins system model (llm1 over llm2)', () => {
    // both llm1 and llm2 have model 'gpt-4o'; the index holds llm1
    expect(getLLMModel('gpt-4o')?.id).toBe('llm-id-001');
  });
});

describe('getEmbeddingModel (refactored)', () => {
  beforeEach(setupTestModels);
  afterEach(clearTestModels);

  it('should return embedding model by modelId', () => {
    const m = getEmbeddingModel('emb-id-001');
    expect(m).toBeDefined();
    expect(m?.type).toBe('embedding');
  });

  it('should return undefined for unknown modelId', () => {
    expect(getEmbeddingModel('nonexistent')).toBeUndefined();
  });
});

describe('getTTSModel / getSTTModel / getRerankModel (refactored)', () => {
  beforeEach(setupTestModels);
  afterEach(clearTestModels);

  it('getTTSModel returns TTS by modelId', () => {
    expect(getTTSModel('tts-id-001')?.type).toBe('tts');
    expect(getTTSModel('nonexistent')).toBeUndefined();
  });

  it('getSTTModel returns STT by modelId', () => {
    expect(getSTTModel('stt-id-001')?.type).toBe('stt');
    expect(getSTTModel('nonexistent')).toBeUndefined();
  });

  it('getRerankModel returns rerank by modelId', () => {
    expect(getRerankModel('rerank-id-001')?.type).toBe('rerank');
    expect(getRerankModel('nonexistent')).toBeUndefined();
  });
});

describe('getVlmModel (refactored)', () => {
  beforeEach(setupTestModels);
  afterEach(clearTestModels);

  it('should return VLM model by modelId', () => {
    const m = getVlmModel('llm-id-002');
    expect(m).toBeDefined();
    expect(m?.vision).toBe(true);
  });

  it('should return undefined for unknown modelId', () => {
    expect(getVlmModel('nonexistent')).toBeUndefined();
  });
});

describe('isImageEmbeddingModel (refactored)', () => {
  beforeEach(setupTestModels);
  afterEach(clearTestModels);

  it('should return false when model has no vision', () => {
    expect(isImageEmbeddingModel('emb-id-001')).toBe(false);
  });

  it('should return false for unknown modelId', () => {
    expect(isImageEmbeddingModel('nonexistent')).toBe(false);
  });
});

describe('getDefault* functions (refactored)', () => {
  beforeEach(setupTestModels);
  afterEach(clearTestModels);

  it('getDefaultLLMModel returns llm default', () => {
    expect(getDefaultLLMModel()?.id).toBe('llm-id-001');
  });

  it('getDefaultLLMModel returns undefined when no default', () => {
    global.systemDefaultModel.llm = undefined;
    expect(getDefaultLLMModel()).toBeUndefined();
  });

  it('getDefaultEmbeddingModel returns embedding default', () => {
    expect(getDefaultEmbeddingModel()?.id).toBe('emb-id-001');
  });

  it('getDefaultVLMModel returns datasetImageLLM', () => {
    expect(getDefaultVLMModel()?.vision).toBe(true);
  });

  it('getDefaultChatTitleModel returns chatTitleLLM', () => {
    expect(getDefaultChatTitleModel()?.id).toBe('llm-id-001');
  });

  it('getDefaultHelperBotModel returns helperBotLLM', () => {
    expect(getDefaultHelperBotModel()?.id).toBe('llm-id-001');
  });
});

describe('assertModelActive (F2-S3-TC06)', () => {
  it('passes when model is active', () => {
    expect(() => assertModelActive(makeLLM('x', { isActive: true }))).not.toThrow();
  });

  it('passes when isActive is undefined (legacy default-enabled)', () => {
    expect(() => assertModelActive(makeLLM('x', { isActive: undefined }))).not.toThrow();
  });

  it('passes when modelData is undefined', () => {
    expect(() => assertModelActive(undefined)).not.toThrow();
  });

  it('throws ModelErrEnum.modelDisabled when model is disabled', () => {
    expect(() => assertModelActive(makeLLM('x', { isActive: false }))).toThrow(
      ModelErrEnum.modelDisabled
    );
  });

  it('throws for disabled non-LLM models too (structural isActive check)', () => {
    expect(() => assertModelActive(makeEmbedding('x', { isActive: false }))).toThrow(
      ModelErrEnum.modelDisabled
    );
  });
});

describe('assertModelUsable (endpoint-level fail fast)', () => {
  it('passes when model exists and is active', () => {
    expect(() => assertModelUsable(makeLLM('x', { isActive: true }))).not.toThrow();
  });

  it('throws ModelErrEnum.modelDisabled when model is disabled', () => {
    expect(() => assertModelUsable(makeLLM('x', { isActive: false }))).toThrow(
      ModelErrEnum.modelDisabled
    );
  });

  it('throws ModelErrEnum.unExist when model is undefined', () => {
    expect(() => assertModelUsable(undefined)).toThrow(ModelErrEnum.unExist);
  });

  it('passes when model exists and is active', () => {
    expect(() => assertModelUsable(makeLLM('x', { isActive: true }))).not.toThrow();
  });

  it('supports custom notExist error code', () => {
    expect(() => assertModelUsable(undefined, { notExist: ModelErrEnum.invalidModelId })).toThrow(
      ModelErrEnum.invalidModelId
    );
  });

  it('supports custom disabled error code', () => {
    expect(() =>
      assertModelUsable(makeLLM('x', { isActive: false }), {
        disabled: ModelErrEnum.systemModelReadonly
      })
    ).toThrow(ModelErrEnum.systemModelReadonly);
  });
});
