import { describe, it, expect } from 'vitest';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import {
  buildModelNameToIdMap,
  convertModelValue,
  migrateInput,
  WORKFLOW_MODEL_KEY_MAP,
  DATASET_PARAMS_MODEL_FIELDS,
  dropModelUniqueIndex,
  createNewIndexes,
  migrateModelData,
  migrateDatasets,
  migrateAppWorkflows,
  migrateEvaluationData,
  migrateEvaluationTasks,
  migrateTrainingRecords,
  migrateUsageRecords
} from '@/pages/api/admin/initv4150';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoEmbeddingTrainTask } from '@fastgpt/service/core/train/embedding/task/schema';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';

const db = () => connectionMongo.connection.db!;
const findByStringId = (collectionName: string, id: string) =>
  db()
    .collection(collectionName)
    .findOne({ _id: id } as any);

// ── helpers ──

const SYS_ID = (suffix: string) => `00000000000000000000000${suffix}`;
const DS_ID = (suffix: string) => `11111111111111111111111${suffix}`;
const APP_ID = (suffix: string) => `22222222222222222222222${suffix}`;
const VER_ID = (suffix: string) => `33333333333333333333333${suffix}`;
const EVAL_ID = (suffix: string) => `44444444444444444444444${suffix}`;
const DATA_ID = (suffix: string) => `55555555555555555555555${suffix}`;
const TRAIN_ID = (suffix: string) => `66666666666666666666666${suffix}`;

// ── buildModelNameToIdMap ──

describe('buildModelNameToIdMap', () => {
  it('returns empty map when collection is empty', async () => {
    const map = await buildModelNameToIdMap();
    expect(map.size).toBe(0);
  });

  it('maps model names to string _id values', async () => {
    await db()
      .collection('system_models')
      .insertOne({
        _id: SYS_ID('0'),
        model: 'gpt-4o',
        type: 'llm',
        isCustom: false
      } as any);
    const map = await buildModelNameToIdMap();
    expect(map.get('gpt-4o')).toBe(SYS_ID('0'));
  });

  it('keeps the first model when name conflicts and neither side is explicitly active', async () => {
    await db()
      .collection('system_models')
      .insertMany([
        {
          _id: SYS_ID('1'),
          model: 'gpt-4o',
          type: 'llm',
          isCustom: true
        },
        {
          _id: SYS_ID('2'),
          model: 'gpt-4o',
          type: 'llm',
          isCustom: false
        }
      ] as any);
    const map = await buildModelNameToIdMap();
    expect(map.get('gpt-4o')).toBe(SYS_ID('1'));
  });

  it('prefers active models over inactive models when name conflicts', async () => {
    await db()
      .collection('system_models')
      .insertMany([
        {
          _id: SYS_ID('4'),
          model: 'gpt-4o',
          type: 'llm',
          isCustom: false,
          isActive: false
        },
        {
          _id: SYS_ID('5'),
          model: 'gpt-4o',
          type: 'llm',
          isCustom: true,
          isActive: true
        }
      ] as any);

    const map = await buildModelNameToIdMap();
    expect(map.get('gpt-4o')).toBe(SYS_ID('5'));
  });

  it('keeps the active model when both active and non-active duplicates exist', async () => {
    await db()
      .collection('system_models')
      .insertMany([
        {
          _id: SYS_ID('6'),
          model: 'gpt-4o',
          type: 'llm',
          isCustom: true,
          isActive: true
        },
        {
          _id: SYS_ID('7'),
          model: 'gpt-4o',
          type: 'llm',
          isCustom: false,
          isActive: false
        }
      ] as any);

    const map = await buildModelNameToIdMap();
    expect(map.get('gpt-4o')).toBe(SYS_ID('6'));
  });

  it('skips documents without a model field', async () => {
    await db()
      .collection('system_models')
      .insertOne({
        _id: SYS_ID('3'),
        type: 'llm',
        isCustom: false
      } as any);
    const map = await buildModelNameToIdMap();
    expect(map.size).toBe(0);
  });
});

// ── convertModelValue ──

describe('convertModelValue', () => {
  const map = new Map<string, string>([
    ['gpt-4o', 'aaaaaaaaaaaaaaaaaaaaaaaa'],
    ['text-embedding-3-small', 'bbbbbbbbbbbbbbbbbbbbbbbb']
  ]);

  it('converts a known model name to its id', () => {
    expect(convertModelValue('gpt-4o', map)).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('returns the original string when model name is unknown', () => {
    expect(convertModelValue('unknown-model', map)).toBe('unknown-model');
  });

  it('returns non-string values unchanged', () => {
    expect(convertModelValue(42, map)).toBe(42);
    expect(convertModelValue(null, map)).toBe(null);
    expect(convertModelValue(undefined, map)).toBe(undefined);
    expect(convertModelValue(['gpt-4o'], map)).toEqual(['gpt-4o']);
  });

  it('returns empty string unchanged', () => {
    expect(convertModelValue('', map)).toBe('');
  });
});

// ── migrateInput ──

describe('migrateInput', () => {
  const map = new Map<string, string>([['gpt-4o', 'aaaaaaaaaaaaaaaaaaaaaaaa']]);

  it('renames old workflow key to new key and converts value', () => {
    const input: Record<string, any> = { key: 'model', value: 'gpt-4o' };
    const changed = migrateInput(input, map);
    expect(changed).toBe(true);
    expect(input.key).toBe('modelId');
    expect(input.value).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('does NOT convert value when selectedTypeIndex > 0 (reference)', () => {
    const input: Record<string, any> = {
      key: 'model',
      value: 'gpt-4o',
      selectedTypeIndex: 1
    };
    migrateInput(input, map);
    expect(input.key).toBe('modelId');
    expect(input.value).toBe('gpt-4o');
  });

  it('migrates model fields inside datasetParams', () => {
    const input: Record<string, any> = {
      key: 'datasetParams',
      value: {
        embeddingModel: 'text-embedding-3-small',
        rerankModel: 'custom-rerank'
      }
    };
    const changed = migrateInput(input, map);
    expect(changed).toBe(true);
    expect(input.value.embeddingModelId).toBe('text-embedding-3-small');
    expect(input.value.rerankModelId).toBe('custom-rerank');
    expect(input.value.embeddingModel).toBeUndefined();
    expect(input.value.rerankModel).toBeUndefined();
  });

  it('converts known model names inside datasetParams', () => {
    const input: Record<string, any> = {
      key: 'datasetParams',
      value: { embeddingModel: 'gpt-4o' }
    };
    migrateInput(input, map);
    expect(input.value.embeddingModelId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('does nothing for non-model keys', () => {
    const input: Record<string, any> = { key: 'systemPrompt', value: 'hello' };
    const changed = migrateInput(input, map);
    expect(changed).toBe(false);
    expect(input.key).toBe('systemPrompt');
    expect(input.value).toBe('hello');
  });

  it('handles null/undefined input gracefully', () => {
    expect(() => migrateInput(null as any, map)).toThrow();
  });

  it('returns false when no change was made', () => {
    const input: Record<string, any> = { key: 'modelId', value: 'already-migrated' };
    expect(migrateInput(input, map)).toBe(false);
  });
});

// ── Index migration ──

describe('dropModelUniqueIndex', () => {
  it('drops the unique index on model field when it exists', async () => {
    await db()
      .collection('system_models')
      .createIndex({ model: 1 }, { unique: true, name: 'model_1' });
    const dropped = await dropModelUniqueIndex();
    expect(dropped).toBe(true);
    const indexes = await db().collection('system_models').listIndexes().toArray();
    expect(indexes.some((i) => i.name === 'model_1')).toBe(false);
  });

  it('returns false when no unique model index exists', async () => {
    const dropped = await dropModelUniqueIndex();
    expect(dropped).toBe(false);
  });
});

describe('createNewIndexes', () => {
  it('creates teamId, tmbId, isShared indexes', async () => {
    // Create the collection first by inserting a document
    await db()
      .collection('system_models')
      .insertOne({ model: 'test', type: 'llm' } as any);
    const created = await createNewIndexes();
    expect(created).toContain('teamId_1');
    expect(created).toContain('tmbId_1');
    expect(created).toContain('isShared_1');
  });

  it('skips already existing indexes on re-run', async () => {
    const created = await createNewIndexes();
    expect(created).toEqual([]);
  });
});

// ── migrateModelData ──

describe('migrateModelData', () => {
  it('flattens metadata fields to document top level', async () => {
    await db()
      .collection('system_models')
      .insertOne({
        model: 'gpt-4o',
        type: 'llm',
        isShared: true,
        metadata: {
          provider: 'OpenAI',
          maxContext: 128000,
          vision: true,
          functionCall: true,
          toolChoice: true,
          maxResponse: 4096,
          quoteMaxToken: 4096
        }
      } as any);
    const result = await migrateModelData();
    expect(result.flattened).toBe(1);

    const doc = await db().collection('system_models').findOne({ model: 'gpt-4o' });
    expect(doc!.provider).toBe('OpenAI');
    expect(doc!.maxContext).toBe(128000);
    expect(doc!.vision).toBe(true);
    expect(doc!.metadata).toBeUndefined();
  });

  it('sets isShared=false on models that do not have it', async () => {
    await db()
      .collection('system_models')
      .insertOne({
        model: 'claude-3',
        type: 'llm',
        metadata: {
          provider: 'OpenAI',
          maxContext: 16000,
          maxResponse: 8000,
          quoteMaxToken: 8000,
          functionCall: true,
          toolChoice: true
        }
      } as any);
    const result = await migrateModelData();
    expect(result.isSharedSet).toBeGreaterThanOrEqual(1);

    const doc = await db().collection('system_models').findOne({ model: 'claude-3' });
    expect(doc!.isShared).toBe(false);
  });

  it('sets defaults for LLM models missing required fields', async () => {
    await db()
      .collection('system_models')
      .insertOne({
        model: 'bare-llm',
        type: 'llm',
        isShared: true,
        metadata: { provider: 'test' }
      } as any);

    await migrateModelData();

    const doc = await db().collection('system_models').findOne({ model: 'bare-llm' });
    expect(doc!.maxContext).toBe(16000);
    expect(doc!.maxResponse).toBe(8000);
    expect(doc!.quoteMaxToken).toBe(8000);
    expect(doc!.functionCall).toBe(true);
    expect(doc!.toolChoice).toBe(true);
  });

  it('sets defaults for embedding models missing required fields', async () => {
    await db()
      .collection('system_models')
      .insertOne({
        model: 'bare-embed',
        type: 'embedding',
        isShared: true,
        metadata: { provider: 'test' }
      } as any);

    await migrateModelData();

    const doc = await db().collection('system_models').findOne({ model: 'bare-embed' });
    expect(doc!.defaultToken).toBe(512);
    expect(doc!.maxToken).toBe(512);
    expect(doc!.weight).toBe(0);
  });

  it('sets defaults for TTS models missing voices', async () => {
    await db()
      .collection('system_models')
      .insertOne({
        model: 'bare-tts',
        type: 'tts',
        isShared: true,
        metadata: { provider: 'test' }
      } as any);

    await migrateModelData();

    const doc = await db().collection('system_models').findOne({ model: 'bare-tts' });
    expect(doc!.voices).toEqual([]);
  });

  it('cleans up optional number fields with wrong types', async () => {
    await db()
      .collection('system_models')
      .insertOne({
        model: 'dirty-llm',
        type: 'llm',
        isShared: true,
        maxContext: 16000,
        maxResponse: 8000,
        quoteMaxToken: 8000,
        functionCall: true,
        toolChoice: true,
        metadata: {},
        maxTemperature: 'high',
        charsPointsPrice: null
      } as any);

    await migrateModelData();

    const doc = await db().collection('system_models').findOne({ model: 'dirty-llm' });
    expect(doc!.maxTemperature).toBeUndefined();
    expect(doc!.charsPointsPrice).toBeUndefined();
  });

  it('cleans up optional boolean fields with wrong types', async () => {
    await db()
      .collection('system_models')
      .insertOne({
        model: 'bool-dirty',
        type: 'llm',
        isShared: true,
        maxContext: 16000,
        maxResponse: 8000,
        quoteMaxToken: 8000,
        functionCall: true,
        toolChoice: true,
        metadata: {},
        vision: 'yes',
        reasoning: 1
      } as any);

    await migrateModelData();

    const doc = await db().collection('system_models').findOne({ model: 'bool-dirty' });
    expect(doc!.vision).toBeUndefined();
    expect(doc!.reasoning).toBeUndefined();
  });

  it('cleans up optional array fields with wrong types', async () => {
    await db()
      .collection('system_models')
      .insertOne({
        model: 'arr-dirty',
        type: 'llm',
        isShared: true,
        maxContext: 16000,
        maxResponse: 8000,
        quoteMaxToken: 8000,
        functionCall: true,
        toolChoice: true,
        metadata: {
          priceTiers: 'not-an-array',
          voices: 'not-an-array'
        }
      } as any);

    await migrateModelData();

    const doc = await db().collection('system_models').findOne({ model: 'arr-dirty' });
    expect(doc!.priceTiers).toBeUndefined();
    expect(doc!.voices).toBeUndefined();
  });

  it('handles empty collection gracefully', async () => {
    const result = await migrateModelData();
    expect(result.total).toBe(0);
    expect(result.flattened).toBe(0);
  });

  it('metadata values overwrite existing top-level fields', async () => {
    await db()
      .collection('system_models')
      .insertOne({
        model: 'existing-llm',
        type: 'llm',
        isShared: true,
        maxContext: 32000,
        maxResponse: 16000,
        quoteMaxToken: 16000,
        functionCall: true,
        toolChoice: true,
        provider: 'existing-provider',
        metadata: { provider: 'metadata-provider' }
      } as any);

    await migrateModelData();

    const doc = await db().collection('system_models').findOne({ model: 'existing-llm' });
    expect(doc!.provider).toBe('metadata-provider');
    expect(doc!.metadata).toBeUndefined();
  });

  it('sets isCustom=true for models whose name does not match any plugin model', async () => {
    // Simulate loaded plugin system models (gpt-4o is a plugin model)
    global.systemModelList = [{ model: 'gpt-4o', isCustom: false, type: 'llm' }] as any;

    await db()
      .collection('system_models')
      .insertOne({
        model: 'my-custom-model',
        type: 'llm',
        metadata: {
          provider: 'OpenAI',
          maxContext: 16000,
          maxResponse: 8000,
          quoteMaxToken: 8000,
          functionCall: true,
          toolChoice: true
        }
      } as any);

    await migrateModelData();

    const doc = await db().collection('system_models').findOne({ model: 'my-custom-model' });
    expect(doc!.isCustom).toBe(true);
  });

  it('sets isCustom=false for models whose name matches a plugin system model', async () => {
    // Simulate loaded plugin system models
    global.systemModelList = [{ model: 'gpt-4o', isCustom: false, type: 'llm' }] as any;

    await db()
      .collection('system_models')
      .insertOne({
        model: 'gpt-4o',
        metadata: {
          type: 'llm',
          provider: 'OpenAI',
          name: 'gpt-4o',
          maxContext: 99999,
          maxResponse: 8000,
          quoteMaxToken: 8000,
          functionCall: true,
          toolChoice: true
        }
      } as any);

    await migrateModelData();

    const doc = await db().collection('system_models').findOne({ model: 'gpt-4o' });
    // Admin-edited plugin model → should be isCustom: false (system model)
    expect(doc!.isCustom).toBe(false);
    expect(doc!.metadata).toBeUndefined();
    expect(doc!.maxContext).toBe(99999); // admin's edit preserved
  });

  it('assigns root tmbId/teamId to orphan custom models without owner', async () => {
    // Simulate plugin system models so the test model is recognized as custom
    global.systemModelList = [{ model: 'gpt-4o', isCustom: false, type: 'llm' }] as any;

    const rootTmbId = 'aaaaaa111111111111111111';
    const rootTeamId = 'bbbbbb222222222222222222';

    await db()
      .collection('system_models')
      .insertOne({
        model: 'orphan-custom-model',
        type: 'llm',
        metadata: {
          provider: 'OpenAI',
          maxContext: 16000,
          maxResponse: 8000,
          quoteMaxToken: 8000,
          functionCall: true,
          toolChoice: true
        }
      } as any);

    const result = await migrateModelData({ rootTmbId, rootTeamId });
    expect(result.orphanAssigned).toBeGreaterThanOrEqual(1);

    const doc = await db().collection('system_models').findOne({ model: 'orphan-custom-model' });
    expect(doc!.isCustom).toBe(true);
    expect(String(doc!.tmbId)).toBe(rootTmbId);
    expect(String(doc!.teamId)).toBe(rootTeamId);

    // Verify resource permission record was created for root owner
    const perm = await MongoResourcePermission.findOne({
      resourceType: PerResourceTypeEnum.model,
      resourceId: doc!._id
    }).lean();
    expect(perm).toBeTruthy();
    expect(String(perm!.tmbId)).toBe(rootTmbId);
    expect(String(perm!.teamId)).toBe(rootTeamId);
    expect(perm!.permission).toBe(OwnerRoleVal);
  });

  it('does not assign root tmbId/teamId to system models (isCustom=false)', async () => {
    global.systemModelList = [{ model: 'gpt-4o', isCustom: false, type: 'llm' }] as any;

    const rootTmbId = 'cccccc333333333333333333';
    const rootTeamId = 'dddddd444444444444444444';

    await db()
      .collection('system_models')
      .insertOne({
        model: 'gpt-4o',
        metadata: {
          type: 'llm',
          provider: 'OpenAI',
          name: 'GPT-4o',
          maxContext: 128000,
          maxResponse: 8000,
          quoteMaxToken: 8000,
          functionCall: true,
          toolChoice: true
        }
      } as any);

    const result = await migrateModelData({ rootTmbId, rootTeamId });

    const doc = await db().collection('system_models').findOne({ model: 'gpt-4o' });
    expect(doc!.isCustom).toBe(false);
    // System models should NOT get root tmbId/teamId
    expect(doc!.tmbId).toBeUndefined();
    expect(doc!.teamId).toBeUndefined();
  });

  it('preserves existing tmbId/teamId on custom models', async () => {
    global.systemModelList = [{ model: 'gpt-4o', isCustom: false, type: 'llm' }] as any;
    const existingTmbId = 'eeeeee111111111111111111';
    const existingTeamId = 'ffffff222222222222222222';

    await db()
      .collection('system_models')
      .insertOne({
        model: 'custom-with-owner',
        type: 'llm',
        isCustom: true,
        tmbId: existingTmbId,
        teamId: existingTeamId,
        metadata: {
          provider: 'OpenAI',
          maxContext: 16000,
          maxResponse: 8000,
          quoteMaxToken: 8000,
          functionCall: true,
          toolChoice: true
        }
      } as any);

    await migrateModelData({
      rootTmbId: 'aaaaaa555555555555555555',
      rootTeamId: 'bbbbbb666666666666666666'
    });

    const doc = await db().collection('system_models').findOne({ model: 'custom-with-owner' });
    expect(doc!.isCustom).toBe(true);
    // Should preserve existing values, not overwrite with root
    expect(String(doc!.tmbId)).toBe(existingTmbId);
    expect(String(doc!.teamId)).toBe(existingTeamId);
  });
});

// ── migrateDatasets ──

describe('migrateDatasets', () => {
  it('renames vectorModel/agentModel/vlmModel to XxxModelId', async () => {
    await db()
      .collection('system_models')
      .insertOne({
        _id: SYS_ID('a'),
        model: 'text-embedding-3-small',
        type: 'embedding',
        isCustom: false
      } as any);

    const map = await buildModelNameToIdMap();

    await db()
      .collection('datasets')
      .insertOne({
        _id: DS_ID('1'),
        vectorModel: 'text-embedding-3-small',
        agentModel: 'gpt-4o',
        vlmModel: 'gpt-4-vision'
      } as any);

    const result = await migrateDatasets(map);
    expect(result.migrated).toBe(1);
    expect(result.datasetTrainingsCleaned).toBe(0);

    const doc = await findByStringId('datasets', DS_ID('1'));
    expect(doc!.vectorModelId).toBe(SYS_ID('a'));
    expect(doc!.agentModelId).toBe('gpt-4o');
    expect(doc!.vlmModelId).toBe('gpt-4-vision');
    expect(doc!.vectorModel).toBeUndefined();
    expect(doc!.agentModel).toBeUndefined();
    expect(doc!.vlmModel).toBeUndefined();
  });

  it('does not overwrite existing new fields', async () => {
    await db()
      .collection('system_models')
      .insertOne({
        _id: SYS_ID('b'),
        model: 'text-embedding-3-large',
        type: 'embedding',
        isCustom: false
      } as any);
    const map = await buildModelNameToIdMap();

    await db()
      .collection('datasets')
      .insertOne({
        _id: DS_ID('2'),
        vectorModel: 'text-embedding-3-small',
        vectorModelId: 'existing-vector-model-id'
      } as any);

    const result = await migrateDatasets(map);
    expect(result.datasetTrainingsCleaned).toBe(0);
    const doc = await findByStringId('datasets', DS_ID('2'));
    expect(doc!.vectorModelId).toBe('existing-vector-model-id');
    expect(doc!.vectorModel).toBeUndefined();
  });

  it('skips datasets without old fields', async () => {
    await db()
      .collection('datasets')
      .insertOne({
        _id: DS_ID('3'),
        name: 'modern-dataset'
      } as any);

    const result = await migrateDatasets(new Map());
    expect(result.total).toBe(0);
    expect(result.migrated).toBe(0);
    expect(result.datasetTrainingsCleaned).toBe(0);
  });

  it('skips null old field values, migrates defined ones', async () => {
    await db()
      .collection('datasets')
      .insertOne({
        _id: DS_ID('4'),
        vectorModel: null,
        vlmModel: 'gpt-4-vision'
      } as any);

    const result = await migrateDatasets(new Map());
    expect(result.migrated).toBe(1);

    const doc = await findByStringId('datasets', DS_ID('4'));
    // null values are skipped (not $unset), so vectorModel stays null
    expect(doc!.vectorModel).toBe(null);
    expect(doc!.vlmModel).toBeUndefined();
    expect(doc!.vlmModelId).toBe('gpt-4-vision');
  });

  it('cleans dataset_trainings.model as part of dataset migration', async () => {
    await db()
      .collection('dataset_trainings')
      .insertMany([
        {
          _id: TRAIN_ID('1'),
          model: 'gpt-4o',
          status: 'completed'
        },
        {
          _id: TRAIN_ID('2'),
          status: 'running'
        }
      ] as any);

    const result = await migrateDatasets(new Map());
    expect(result.datasetTrainingsCleaned).toBe(1);

    const doc1 = await findByStringId('dataset_trainings', TRAIN_ID('1'));
    expect(doc1!.model).toBeUndefined();
    expect(doc1!.status).toBe('completed');

    const doc2 = await findByStringId('dataset_trainings', TRAIN_ID('2'));
    expect(doc2!.status).toBe('running');
  });
});

// ── migrateAppWorkflows ──

describe('migrateAppWorkflows', () => {
  const map = new Map<string, string>([['gpt-4o', 'aaaaaaaaaaaaaaaaaaaaaaaa']]);

  it('migrates modules[].inputs[] keys and values in apps', async () => {
    await db()
      .collection('apps')
      .insertOne({
        _id: APP_ID('1'),
        name: 'test-app',
        modules: [
          {
            name: 'AI Chat',
            inputs: [
              { key: 'model', value: 'gpt-4o' },
              { key: 'systemPrompt', value: 'hello' }
            ]
          }
        ]
      } as any);

    const result = await migrateAppWorkflows(map);
    expect(result.appsMigrated).toBe(1);

    const doc = await findByStringId('apps', APP_ID('1'));
    const inputs = (doc!.modules as any[])[0].inputs;
    const modelInput = inputs.find((i: any) => i.key === 'modelId');
    expect(modelInput).toBeDefined();
    expect(modelInput.value).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('migrates nodes[].inputs[] keys and values in app_versions', async () => {
    await db()
      .collection('app_versions')
      .insertOne({
        _id: VER_ID('1'),
        appId: APP_ID('1'),
        name: 'v1',
        nodes: [
          {
            nodeId: 'node1',
            inputs: [{ key: 'model', value: 'gpt-4o' }]
          }
        ]
      } as any);

    const result = await migrateAppWorkflows(map);
    expect(result.versionsMigrated).toBe(1);

    const doc = await findByStringId('app_versions', VER_ID('1'));
    const inputs = (doc!.nodes as any[])[0].inputs;
    expect(inputs[0].key).toBe('modelId');
    expect(inputs[0].value).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('migrates chatConfig.questionGuide.model -> modelId', async () => {
    await db()
      .collection('apps')
      .insertOne({
        _id: APP_ID('2'),
        name: 'app-with-qg',
        modules: [],
        chatConfig: { questionGuide: { model: 'gpt-4o', enabled: true } }
      } as any);

    await migrateAppWorkflows(map);

    const doc = await findByStringId('apps', APP_ID('2'));
    expect(doc!.chatConfig.questionGuide.modelId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(doc!.chatConfig.questionGuide.model).toBeUndefined();
    expect(doc!.chatConfig.questionGuide.enabled).toBe(true);
  });

  it('migrates chatConfig.ttsConfig.model -> modelId', async () => {
    await db()
      .collection('apps')
      .insertOne({
        _id: APP_ID('3'),
        name: 'app-with-tts',
        modules: [],
        chatConfig: { ttsConfig: { model: 'tts-1', voice: 'alloy' } }
      } as any);

    await migrateAppWorkflows(map);

    const doc = await findByStringId('apps', APP_ID('3'));
    expect(doc!.chatConfig.ttsConfig.modelId).toBe('tts-1');
    expect(doc!.chatConfig.ttsConfig.model).toBeUndefined();
    expect(doc!.chatConfig.ttsConfig.voice).toBe('alloy');
  });

  it('handles apps without modules gracefully', async () => {
    await db()
      .collection('apps')
      .insertOne({
        _id: APP_ID('4'),
        name: 'empty-app'
      } as any);

    const result = await migrateAppWorkflows(map);
    expect(result.appsMigrated).toBe(0);
  });

  it('handles empty collection gracefully', async () => {
    const result = await migrateAppWorkflows(map);
    expect(result.appsChecked).toBe(0);
  });

  it('migrates datasetParams within app_versions nodes', async () => {
    await db()
      .collection('app_versions')
      .insertOne({
        _id: VER_ID('2'),
        appId: APP_ID('1'),
        name: 'v2',
        nodes: [
          {
            nodeId: 'ds1',
            inputs: [
              {
                key: 'datasetParams',
                value: {
                  embeddingModel: 'text-embedding-3-small',
                  rerankModel: 'custom-rerank'
                }
              }
            ]
          }
        ]
      } as any);

    const map2 = new Map<string, string>([['text-embedding-3-small', 'embed-id-123']]);
    await migrateAppWorkflows(map2);

    const doc = await findByStringId('app_versions', VER_ID('2'));
    const val = (doc!.nodes as any[])[0].inputs[0].value;
    expect(val.embeddingModelId).toBe('embed-id-123');
    expect(val.rerankModelId).toBe('custom-rerank');
    expect(val.embeddingModel).toBeUndefined();
    expect(val.rerankModel).toBeUndefined();
  });
});

// ── migrateEvaluationData ──

describe('migrateEvaluationData', () => {
  const map = new Map<string, string>([['gpt-4o', 'aaaaaaaaaaaaaaaaaaaaaaaa']]);

  it('migrates eval_dataset_collections: evaluationModel -> evaluationModelId', async () => {
    await db()
      .collection('eval_dataset_collections')
      .insertOne({
        _id: EVAL_ID('1'),
        evaluationModel: 'gpt-4o'
      } as any);

    const result = await migrateEvaluationData(map);
    expect(result.collectionsMigrated).toBe(1);

    const doc = await findByStringId('eval_dataset_collections', EVAL_ID('1'));
    expect(doc!.evaluationModelId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(doc!.evaluationModel).toBeUndefined();
  });

  it('migrates eval_dataset_datas qualityMetadata.model -> modelId', async () => {
    await db()
      .collection('eval_dataset_datas')
      .insertOne({
        _id: DATA_ID('1'),
        qualityMetadata: { model: 'gpt-4o', score: 95 }
      } as any);

    const result = await migrateEvaluationData(map);
    expect(result.dataMigrated).toBe(1);

    const doc = await findByStringId('eval_dataset_datas', DATA_ID('1'));
    expect(doc!.qualityMetadata.modelId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(doc!.qualityMetadata.model).toBeUndefined();
    expect(doc!.qualityMetadata.score).toBe(95);
  });

  it('migrates eval_dataset_datas synthesisMetadata.intelligentGenerationModel -> intelligentGenerationModelId', async () => {
    await db()
      .collection('eval_dataset_datas')
      .insertOne({
        _id: DATA_ID('2'),
        synthesisMetadata: { intelligentGenerationModel: 'gpt-4o', count: 10 }
      } as any);

    const result = await migrateEvaluationData(map);
    expect(result.dataMigrated).toBe(1);

    const doc = await findByStringId('eval_dataset_datas', DATA_ID('2'));
    expect(doc!.synthesisMetadata.intelligentGenerationModelId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(doc!.synthesisMetadata.intelligentGenerationModel).toBeUndefined();
  });

  it('does not unset evaluationModel when evaluationModelId already exists', async () => {
    await db()
      .collection('eval_dataset_collections')
      .insertOne({
        _id: EVAL_ID('2'),
        evaluationModelId: 'existing-id',
        evaluationModel: 'gpt-4o'
      } as any);

    const result = await migrateEvaluationData(map);
    expect(result.collectionsMigrated).toBe(1);

    const doc = await findByStringId('eval_dataset_collections', EVAL_ID('2'));
    expect(doc!.evaluationModelId).toBe('existing-id');
    expect(doc!.evaluationModel).toBe('gpt-4o');
  });

  it('handles unknown model values (keeps as-is)', async () => {
    await db()
      .collection('eval_dataset_collections')
      .insertOne({
        _id: EVAL_ID('3'),
        evaluationModel: 'unknown-model'
      } as any);

    await migrateEvaluationData(map);
    const doc = await findByStringId('eval_dataset_collections', EVAL_ID('3'));
    expect(doc!.evaluationModelId).toBe('unknown-model');
    expect(doc!.evaluationModel).toBeUndefined();
  });
});

// ── migrateTrainingRecords ──

describe('migrateTrainingRecords', () => {
  const map = new Map<string, string>([
    ['gpt-4o', 'aaaaaaaaaaaaaaaaaaaaaaaa'],
    ['text-embedding-3-small', 'bbbbbbbbbbbbbbbbbbbbbbbb'],
    ['tuned-model', 'cccccccccccccccccccccccc']
  ]);

  const embedCol = MongoEmbeddingTrainTask.collection.collectionName;
  const rerankCol = MongoRerankTrainTask.collection.collectionName;

  it('migrates train task model references', async () => {
    await db()
      .collection(embedCol)
      .insertOne({
        _id: TRAIN_ID('3'),
        baseModelId: 'text-embedding-3-small',
        checkpoint: {
          data: {
            registering: {
              tunedModelId: 'tuned-model'
            }
          }
        },
        result: {
          tunedModelId: 'tuned-model'
        }
      } as any);

    await db()
      .collection(rerankCol)
      .insertOne({
        _id: TRAIN_ID('4'),
        baseModelId: 'gpt-4o',
        checkpoint: {
          data: {
            registering: {
              tunedModelId: 'tuned-model'
            }
          }
        },
        result: {
          tunedModelId: 'tuned-model'
        }
      } as any);

    const result = await migrateTrainingRecords(map);
    expect(result.embeddingTasksMigrated).toBe(1);
    expect(result.rerankTasksMigrated).toBe(1);

    const embeddingTask = await findByStringId(embedCol, TRAIN_ID('3'));
    expect(embeddingTask!.baseModelId).toBe('bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(embeddingTask!.checkpoint.data.registering.tunedModelId).toBe(
      'cccccccccccccccccccccccc'
    );
    expect(embeddingTask!.result.tunedModelId).toBe('cccccccccccccccccccccccc');

    const rerankTask = await findByStringId(rerankCol, TRAIN_ID('4'));
    expect(rerankTask!.baseModelId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(rerankTask!.checkpoint.data.registering.tunedModelId).toBe('cccccccccccccccccccccccc');
    expect(rerankTask!.result.tunedModelId).toBe('cccccccccccccccccccccccc');
  });

  it('modifies 0 documents when no training records have model field', async () => {
    const result = await migrateTrainingRecords(new Map());
    expect(result.embeddingTasksMigrated).toBe(0);
    expect(result.rerankTasksMigrated).toBe(0);
  });
});

// ── migrateEvaluationTasks ──

describe('migrateEvaluationTasks', () => {
  const map = new Map<string, string>([
    ['gpt-4o', 'aaaaaaaaaaaaaaaaaaaaaaaa'],
    ['text-embedding-3-small', 'bbbbbbbbbbbbbbbbbbbbbbbb']
  ]);

  it('migrates evaluators runtimeConfig.llm/embedding to llmId/embeddingId', async () => {
    await db()
      .collection('evals')
      .insertOne({
        _id: EVAL_ID('4'),
        evaluators: [
          {
            runtimeConfig: {
              llm: 'gpt-4o',
              embedding: 'text-embedding-3-small'
            }
          }
        ]
      } as any);

    const result = await migrateEvaluationTasks(map);
    expect(result.tasksChecked).toBe(1);
    expect(result.tasksMigrated).toBe(1);

    const doc = await findByStringId('evals', EVAL_ID('4'));
    expect(doc!.evaluators[0].runtimeConfig.llmId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(doc!.evaluators[0].runtimeConfig.embeddingId).toBe('bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(doc!.evaluators[0].runtimeConfig.llm).toBeUndefined();
    expect(doc!.evaluators[0].runtimeConfig.embedding).toBeUndefined();
  });

  it('does not overwrite existing llmId/embeddingId', async () => {
    await db()
      .collection('evals')
      .insertOne({
        _id: EVAL_ID('5'),
        evaluators: [
          {
            runtimeConfig: {
              llm: 'gpt-4o',
              llmId: 'existing-llm-id',
              embedding: 'text-embedding-3-small',
              embeddingId: 'existing-embedding-id'
            }
          }
        ]
      } as any);

    await migrateEvaluationTasks(map);

    const doc = await findByStringId('evals', EVAL_ID('5'));
    expect(doc!.evaluators[0].runtimeConfig.llmId).toBe('existing-llm-id');
    expect(doc!.evaluators[0].runtimeConfig.embeddingId).toBe('existing-embedding-id');
    expect(doc!.evaluators[0].runtimeConfig.llm).toBeUndefined();
    expect(doc!.evaluators[0].runtimeConfig.embedding).toBeUndefined();
  });
});

// ── migrateUsageRecords ──

describe('migrateUsageRecords', () => {
  const map = new Map<string, string>([['gpt-4o', 'aaaaaaaaaaaaaaaaaaaaaaaa']]);

  it('migrates usage_items model -> modelId', async () => {
    await db()
      .collection('usage_items')
      .insertOne({
        _id: TRAIN_ID('5'),
        model: 'gpt-4o',
        amount: 10
      } as any);

    const result = await migrateUsageRecords(map);
    expect(result.itemsChecked).toBe(1);
    expect(result.itemsMigrated).toBe(1);

    const doc = await findByStringId('usage_items', TRAIN_ID('5'));
    expect(doc!.modelId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(doc!.model).toBeUndefined();
  });

  it('keeps existing modelId and only removes old model field', async () => {
    await db()
      .collection('usage_items')
      .insertOne({
        _id: TRAIN_ID('6'),
        model: 'gpt-4o',
        modelId: 'existing-model-id'
      } as any);

    await migrateUsageRecords(map);

    const doc = await findByStringId('usage_items', TRAIN_ID('6'));
    expect(doc!.modelId).toBe('existing-model-id');
    expect(doc!.model).toBeUndefined();
  });
});

// ── WORKFLOW_MODEL_KEY_MAP completeness ──

describe('WORKFLOW_MODEL_KEY_MAP', () => {
  it('covers all 8 old workflow model keys', () => {
    const expected = [
      'model',
      'embeddingModel',
      'rerankModel',
      'datasetSearchExtensionModel',
      'generateSqlModel',
      'datasetDeepSearchModel',
      'agenticSearchLLMModel',
      'agenticSearchRerankModel'
    ];
    for (const key of expected) {
      expect(WORKFLOW_MODEL_KEY_MAP[key]).toBe(`${key}Id`);
    }
    expect(Object.keys(WORKFLOW_MODEL_KEY_MAP).length).toBe(expected.length);
  });
});

// ── DATASET_PARAMS_MODEL_FIELDS completeness ──

describe('DATASET_PARAMS_MODEL_FIELDS', () => {
  it('includes all 7 datasetParams model fields', () => {
    const expected = [
      'embeddingModel',
      'rerankModel',
      'datasetSearchExtensionModel',
      'generateSqlModel',
      'datasetDeepSearchModel',
      'agenticSearchLLMModel',
      'agenticSearchRerankModel'
    ];
    for (const field of expected) {
      expect(DATASET_PARAMS_MODEL_FIELDS).toContain(field);
    }
    expect(DATASET_PARAMS_MODEL_FIELDS.length).toBe(expected.length);
  });
});

// ── end-to-end: full migration pipeline ──

describe('full migration pipeline', () => {
  it('migrates old-style data end-to-end', async () => {
    // 1. Seed system_models with old format (metadata wrapper)
    await db()
      .collection('system_models')
      .insertMany([
        {
          model: 'gpt-4o',
          metadata: {
            type: 'llm',
            provider: 'OpenAI',
            name: 'gpt-4o',
            maxContext: 128000,
            maxResponse: 4096,
            quoteMaxToken: 4096,
            functionCall: true,
            toolChoice: true,
            isActive: true,
            isCustom: false
          }
        },
        {
          model: 'text-embedding-3-small',
          metadata: {
            type: 'embedding',
            provider: 'OpenAI',
            name: 'text-embedding-3-small',
            defaultToken: 512,
            maxToken: 8191,
            weight: 1,
            isActive: true,
            isCustom: false
          }
        }
      ] as any);

    // 2. Seed dataset with old field names
    await db()
      .collection('datasets')
      .insertOne({
        name: 'test-dataset',
        vectorModel: 'text-embedding-3-small',
        agentModel: 'gpt-4o'
      } as any);

    // 3. Seed app with old workflow module
    await db()
      .collection('apps')
      .insertOne({
        name: 'test-app',
        modules: [
          {
            name: 'AI Chat',
            inputs: [
              { key: 'model', value: 'gpt-4o' },
              { key: 'datasetParams', value: { embeddingModel: 'text-embedding-3-small' } }
            ]
          }
        ],
        chatConfig: { questionGuide: { model: 'gpt-4o', enabled: true } }
      } as any);

    // 4. Run the pipeline
    const dataResult = await migrateModelData();
    expect(dataResult.flattened).toBe(2);

    const nameToId = await buildModelNameToIdMap();
    expect(nameToId.size).toBe(2);

    const dsResult = await migrateDatasets(nameToId);
    expect(dsResult.migrated).toBe(1);

    const appResult = await migrateAppWorkflows(nameToId);
    expect(appResult.appsMigrated).toBe(1);

    // Verify final state
    const dataset = await db().collection('datasets').findOne({ name: 'test-dataset' });
    expect(dataset!.vectorModelId).toBeTruthy();
    expect(dataset!.vectorModelId).not.toBe('text-embedding-3-small');
    expect(dataset!.agentModelId).toBeTruthy();
    expect(dataset!.vectorModel).toBeUndefined();
    expect(dataset!.agentModel).toBeUndefined();

    const app = await db().collection('apps').findOne({ name: 'test-app' });
    const chatInputs = (app!.modules as any[])[0].inputs;
    expect(chatInputs.find((i: any) => i.key === 'modelId')).toBeDefined();
    expect(chatInputs.find((i: any) => i.key === 'model')).toBeUndefined();
    expect(app!.chatConfig.questionGuide.modelId).toBeTruthy();
    expect(app!.chatConfig.questionGuide.model).toBeUndefined();
  });
});
