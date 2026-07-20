import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MongoSystemModel, MongoDefaultModel } from '@fastgpt/service/core/ai/model/schema';

// Mock pluginClient and preloadModelProviders to avoid network calls.
// The plugin fixture is a raw model definition as returned by pluginClient.listModels();
// it must land in modelTemplateCache only — never in the created-model maps.
vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: {
    listModels: vi.fn().mockResolvedValue([
      {
        type: 'llm',
        provider: 'fixture-provider',
        model: 'fixture-llm',
        name: 'Fixture LLM',
        maxContext: 32000,
        maxResponse: 8000,
        vision: true,
        defaultConfig: { temperature: 0.7 }
      }
    ])
  }
}));

vi.mock('@fastgpt/service/core/app/provider/controller', () => ({
  preloadModelProviders: vi.fn().mockResolvedValue(undefined),
  getModelProvider: vi.fn().mockReturnValue({ id: 'test', avatar: '/test.png', order: 0 })
}));

describe('loadSystemModels (refactored)', () => {
  beforeEach(async () => {
    // Ensure clean state
    global.systemModelList = [];
    global.llmModelIdMap?.clear();
    global.embeddingModelIdMap?.clear();
    global.ttsModelIdMap?.clear();
    global.sttModelIdMap?.clear();
    global.reRankModelIdMap?.clear();
    global.systemModelIdMap?.clear();
    global.systemModelNameMap?.clear();
    global.llmModelNameMap?.clear();
    global.embeddingModelNameMap?.clear();
    global.ttsModelNameMap?.clear();
    global.sttModelNameMap?.clear();
    global.reRankModelNameMap?.clear();
    global.systemDefaultModel = {};
    global.modelTemplateCache = [];
  });

  it('should load DB models into flat-field maps keyed by modelId', async () => {
    const { loadSystemModels } = await import('@fastgpt/service/core/ai/model/utils');

    // Insert a test model with flat fields (no metadata)
    const doc = await MongoSystemModel.create({
      model: 'test-flat-model',
      type: 'llm',
      provider: 'test',
      name: 'Test Flat Model',
      isActive: true,
      isSystem: true,
      maxContext: 16000,
      maxResponse: 8000,
      quoteMaxToken: 12000,
      functionCall: true,
      toolChoice: true,
      avatar: '/test.png',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const modelId = String(doc._id);

    await loadSystemModels(true);

    // Verify modelId-keyed maps populated
    expect(global.llmModelIdMap.has(modelId)).toBe(true);
    expect(global.systemModelIdMap.has(modelId)).toBe(true);

    const model = global.llmModelIdMap.get(modelId);
    expect(model).toBeDefined();
    expect(model?.model).toBe('test-flat-model');
    expect(model?.name).toBe('Test Flat Model');
    expect(model?.maxContext).toBe(16000);
    expect(model?.id).toBe(modelId);

    // No metadata nesting
    expect((model as any)?.metadata).toBeUndefined();

    // Cleanup
    await MongoSystemModel.deleteOne({ _id: doc._id });
  });

  it('should separate plugin models into modelTemplateCache', async () => {
    const { loadSystemModels } = await import('@fastgpt/service/core/ai/model/utils');

    await loadSystemModels(true);

    // Plugin fixture model lands in the template cache (with provider resolved
    // through getModelProvider mock), NOT in the created-model caches.
    expect(global.modelTemplateCache).toHaveLength(1);
    const tpl = global.modelTemplateCache[0];
    expect(tpl.model).toBe('fixture-llm');
    expect(tpl.provider).toBe('test'); // provider id resolved from the mock
    expect(tpl.maxContext).toBe(32000);
    expect(tpl.defaultConfig).toEqual({ temperature: 0.7 });
    expect((tpl as any)._id).toBeUndefined(); // templates carry no _id

    // Plugin models must NOT be in the model maps / systemModelList
    expect(global.llmModelIdMap.has('fixture-llm')).toBe(false);
    expect(global.systemModelList.find((m) => m.model === 'fixture-llm')).toBeUndefined();
  });

  it('should NOT use isCustom or isDefault in model loading', async () => {
    const { loadSystemModels } = await import('@fastgpt/service/core/ai/model/utils');

    // Insert a model without isCustom/isDefault
    const doc = await MongoSystemModel.create({
      model: 'no-legacy-fields',
      type: 'llm',
      provider: 'test',
      name: 'No Legacy',
      isActive: true,
      isSystem: true,
      maxContext: 8000,
      maxResponse: 4000,
      quoteMaxToken: 4000,
      functionCall: false,
      toolChoice: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const modelId = String(doc._id);

    await loadSystemModels(true);

    const model = global.llmModelIdMap.get(modelId);
    expect(model).toBeDefined();
    // isCustom/isDefault should not exist on the loaded model
    expect((model as any).isCustom).toBeUndefined();
    expect((model as any).isDefault).toBeUndefined();

    await MongoSystemModel.deleteOne({ _id: doc._id });
  });

  it('should NOT double-key maps by model name (only by modelId)', async () => {
    const { loadSystemModels } = await import('@fastgpt/service/core/ai/model/utils');

    const doc = await MongoSystemModel.create({
      model: 'single-key-test',
      name: 'Single Key Test',
      type: 'llm',
      provider: 'test',
      isActive: true,
      isSystem: true,
      maxContext: 8000,
      maxResponse: 4000,
      quoteMaxToken: 4000,
      functionCall: false,
      toolChoice: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const modelId = String(doc._id);

    await loadSystemModels(true);

    // There should be exactly one entry in llmModelIdMap for this model
    // (no duplicate by model.name)
    let count = 0;
    global.llmModelIdMap.forEach((_, key) => {
      if (key === modelId) count++;
    });
    expect(count).toBe(1);

    // model name should NOT be a key
    expect(global.llmModelIdMap.has('single-key-test')).toBe(false);
    expect(global.llmModelIdMap.has('Single Key Test')).toBe(false);

    await MongoSystemModel.deleteOne({ _id: doc._id });
  });

  it('loadDefaultModels: explicit config takes priority over fallback', async () => {
    const { loadSystemModels } = await import('@fastgpt/service/core/ai/model/utils');

    // Create 2 LLM models
    await MongoSystemModel.create({
      model: 'llm-a',
      name: 'LLM A',
      type: 'llm',
      provider: 'test',
      isActive: true,
      isSystem: true,
      maxContext: 8000,
      maxResponse: 4000,
      quoteMaxToken: 4000,
      functionCall: false,
      toolChoice: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const doc2 = await MongoSystemModel.create({
      model: 'llm-b',
      name: 'LLM B',
      type: 'llm',
      provider: 'test',
      isActive: true,
      isSystem: true,
      maxContext: 8000,
      maxResponse: 4000,
      quoteMaxToken: 4000,
      functionCall: false,
      toolChoice: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Explicitly set doc2 as the LLM default
    await MongoDefaultModel.updateOne({}, { $set: { llmId: String(doc2._id) } }, { upsert: true });

    await loadSystemModels(true);

    // Explicit config should take priority
    expect(global.systemDefaultModel.llm?.id).toBe(String(doc2._id));

    // Cleanup
    await MongoSystemModel.deleteMany({});
    await MongoDefaultModel.deleteMany({});
  });

  it('loadDefaultModels: fallback to first active isSystem model when no explicit config', async () => {
    const { loadSystemModels } = await import('@fastgpt/service/core/ai/model/utils');

    // Create only one active isSystem LLM
    const doc = await MongoSystemModel.create({
      model: 'only-llm',
      name: 'Only LLM',
      type: 'llm',
      provider: 'test',
      isActive: true,
      isSystem: true,
      maxContext: 8000,
      maxResponse: 4000,
      quoteMaxToken: 4000,
      functionCall: false,
      toolChoice: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // No MongoDefaultModel document
    await MongoDefaultModel.deleteMany({});

    await loadSystemModels(true);

    // Falls back to first active isSystem LLM
    expect(global.systemDefaultModel.llm?.id).toBe(String(doc._id));

    await MongoSystemModel.deleteMany({});
  });

  it('loadDefaultModels: returns undefined when no system model available', async () => {
    const { loadSystemModels } = await import('@fastgpt/service/core/ai/model/utils');

    // No models, no default config
    await MongoSystemModel.deleteMany({});
    await MongoDefaultModel.deleteMany({});

    await loadSystemModels(true);

    expect(global.systemDefaultModel.llm).toBeUndefined();
  });

  it('builds legacy-name compat indexes keyed by model name and alias', async () => {
    const { loadSystemModels } = await import('@fastgpt/service/core/ai/model/utils');

    const doc = await MongoSystemModel.create({
      model: 'name-index-model',
      name: 'Name Index Alias',
      type: 'llm',
      provider: 'test',
      isActive: true,
      isSystem: true,
      maxContext: 8000,
      maxResponse: 4000,
      quoteMaxToken: 4000,
      functionCall: false,
      toolChoice: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const modelId = String(doc._id);

    await loadSystemModels(true);

    // Both the provider model name and the alias resolve to the model
    expect(global.llmModelNameMap.get('name-index-model')?.id).toBe(modelId);
    expect(global.llmModelNameMap.get('Name Index Alias')?.id).toBe(modelId);
    expect(global.systemModelNameMap.get('name-index-model')?.id).toBe(modelId);
    expect(global.systemModelNameMap.get('Name Index Alias')?.id).toBe(modelId);
    // The id-keyed maps remain id-only
    expect(global.llmModelIdMap.has('name-index-model')).toBe(false);

    await MongoSystemModel.deleteOne({ _id: doc._id });
  });

  it('name index: active model wins over inactive model with same name', async () => {
    const { loadSystemModels } = await import('@fastgpt/service/core/ai/model/utils');

    const active = await MongoSystemModel.create({
      model: 'dup-name',
      name: 'Dup Active',
      type: 'llm',
      provider: 'test',
      isActive: true,
      isSystem: true,
      maxContext: 8000,
      maxResponse: 4000,
      quoteMaxToken: 4000,
      functionCall: false,
      toolChoice: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const inactive = await MongoSystemModel.create({
      model: 'inactive-provider-name',
      name: 'dup-name',
      type: 'llm',
      provider: 'test',
      isActive: false,
      isSystem: true,
      maxContext: 8000,
      maxResponse: 4000,
      quoteMaxToken: 4000,
      functionCall: false,
      toolChoice: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await loadSystemModels(true);

    // Active model registered first → wins the shared 'dup-name' key
    expect(global.llmModelNameMap.get('dup-name')?.id).toBe(String(active._id));
    expect(global.llmModelIdMap.get(String(inactive._id))?.id).toBe(String(inactive._id));

    await MongoSystemModel.deleteMany({});
  });

  it('name index: system model wins over same-name team model', async () => {
    const { loadSystemModels } = await import('@fastgpt/service/core/ai/model/utils');

    const sysModel = await MongoSystemModel.create({
      model: 'shared-name',
      name: 'Shared System',
      type: 'llm',
      provider: 'test',
      isActive: true,
      isSystem: true,
      maxContext: 8000,
      maxResponse: 4000,
      quoteMaxToken: 4000,
      functionCall: false,
      toolChoice: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const teamModel = await MongoSystemModel.create({
      model: 'team-provider-name',
      name: 'shared-name',
      type: 'llm',
      provider: 'test',
      isActive: true,
      isSystem: false,
      tmbId: '507f1f77bcf86cd799439011',
      teamId: '507f1f77bcf86cd799439012',
      maxContext: 8000,
      maxResponse: 4000,
      quoteMaxToken: 4000,
      functionCall: false,
      toolChoice: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await loadSystemModels(true);

    // System model registered first → wins the shared name
    expect(global.llmModelNameMap.get('shared-name')?.id).toBe(String(sysModel._id));
    // Team model keeps its owner info in memory (resolveModelId same-team scope)
    const teamInCache = global.llmModelIdMap.get(String(teamModel._id));
    expect(teamInCache?.id).toBe(String(teamModel._id));
    expect(teamInCache?.teamId).toBe('507f1f77bcf86cd799439012');

    await MongoSystemModel.deleteMany({});
  });

  it('loads legacy metadata-nested docs (flatten + isSystem derivation)', async () => {
    const { loadSystemModels } = await import('@fastgpt/service/core/ai/model/utils');

    // Pre-migration shape: type/provider/name/isActive/isCustom/isDefault live
    // in `metadata`; only model/_id live at the top level.
    const legacySys = await MongoSystemModel.create({
      model: 'legacy-gpt',
      metadata: {
        type: 'llm',
        provider: 'openai',
        name: 'Legacy GPT',
        isActive: true,
        isCustom: false, // → isSystem = true
        isDefault: true,
        maxContext: 16000,
        maxResponse: 8000,
        quoteMaxToken: 12000,
        functionCall: true,
        toolChoice: true,
        requestUrl: 'https://legacy.example.com',
        requestAuth: 'legacy-key'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const legacyPrivate = await MongoSystemModel.create({
      model: 'legacy-private',
      metadata: {
        type: 'llm',
        provider: 'openai',
        name: 'Legacy Private',
        isActive: true,
        isCustom: true, // → isSystem = false
        tmbId: '507f1f77bcf86cd799439011',
        teamId: '507f1f77bcf86cd799439012',
        maxContext: 16000,
        maxResponse: 8000,
        quoteMaxToken: 12000,
        functionCall: true,
        toolChoice: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await loadSystemModels(true);

    // Legacy system model: flattened fields + isSystem derived from isCustom
    const sys = global.llmModelIdMap.get(String(legacySys._id));
    expect(sys).toBeDefined();
    expect(sys?.type).toBe('llm');
    expect(sys?.provider).toBe('openai');
    expect(sys?.name).toBe('Legacy GPT');
    expect(sys?.isSystem).toBe(true);
    expect(sys?.isActive).toBe(true);
    // Legacy default flag preserved for resolveSystemDefaults legacy fallback
    expect((sys as any).isDefault).toBe(true);
    // System model: owner info stripped in memory, metadata nesting dropped
    expect(sys?.tmbId).toBeUndefined();
    expect(sys?.teamId).toBeUndefined();
    expect((sys as any).metadata).toBeUndefined();
    // requestUrl/requestAuth are NOT flattened into the cache
    expect((sys as any).requestUrl).toBeUndefined();

    // Legacy private model: isSystem derived false, owner info kept
    const priv = global.llmModelIdMap.get(String(legacyPrivate._id));
    expect(priv?.isSystem).toBe(false);
    expect(priv?.teamId).toBe('507f1f77bcf86cd799439012');

    // Both names registered in the compat index
    expect(global.llmModelNameMap.get('legacy-gpt')?.id).toBe(String(legacySys._id));
    expect(global.llmModelNameMap.get('legacy-private')?.id).toBe(String(legacyPrivate._id));

    await MongoSystemModel.deleteMany({});
  });

  it('loadDefaultModels: legacy isDefault flag selects default when no explicit config', async () => {
    const { loadSystemModels } = await import('@fastgpt/service/core/ai/model/utils');

    // Two active system LLMs; only one carries the legacy isDefault flag
    const flagDoc = await MongoSystemModel.create({
      model: 'flag-default',
      name: 'Flag Default',
      type: 'llm',
      provider: 'test',
      isActive: true,
      isSystem: true,
      isDefault: true,
      maxContext: 8000,
      maxResponse: 4000,
      quoteMaxToken: 4000,
      functionCall: false,
      toolChoice: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await MongoSystemModel.create({
      model: 'no-flag',
      name: 'No Flag',
      type: 'llm',
      provider: 'test',
      isActive: true,
      isSystem: true,
      maxContext: 8000,
      maxResponse: 4000,
      quoteMaxToken: 4000,
      functionCall: false,
      toolChoice: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // No explicit default_models config
    await MongoDefaultModel.deleteMany({});

    await loadSystemModels(true);

    // Legacy isDefault flag wins over the plain first-active fallback
    expect(global.systemDefaultModel.llm?.id).toBe(String(flagDoc._id));

    await MongoSystemModel.deleteMany({});
  });

  it('loadDefaultModels: explicit config wins over legacy isDefault flag', async () => {
    const { loadSystemModels } = await import('@fastgpt/service/core/ai/model/utils');

    await MongoSystemModel.create({
      model: 'flag-default',
      name: 'Flag Default',
      type: 'llm',
      provider: 'test',
      isActive: true,
      isSystem: true,
      isDefault: true,
      maxContext: 8000,
      maxResponse: 4000,
      quoteMaxToken: 4000,
      functionCall: false,
      toolChoice: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const explicitDoc = await MongoSystemModel.create({
      model: 'explicit-default',
      name: 'Explicit Default',
      type: 'llm',
      provider: 'test',
      isActive: true,
      isSystem: true,
      maxContext: 8000,
      maxResponse: 4000,
      quoteMaxToken: 4000,
      functionCall: false,
      toolChoice: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await MongoDefaultModel.updateOne(
      {},
      { $set: { llmId: String(explicitDoc._id) } },
      { upsert: true }
    );

    await loadSystemModels(true);

    expect(global.systemDefaultModel.llm?.id).toBe(String(explicitDoc._id));

    await MongoSystemModel.deleteMany({});
    await MongoDefaultModel.deleteMany({});
  });
});
