import { describe, expect, it } from 'vitest';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoSystemModel } from '@fastgpt/service/core/ai/model/schema';
import { getDeprecatedIndexes } from '@fastgpt/service/common/mongo/schemaIndexes';

describe('SystemModelSchema (refactored)', () => {
  it('should allow strict:false — extra type-specific fields persisted', async () => {
    const db = connectionMongo.connection.db;
    if (!db) throw new Error('MongoDB not connected');

    const collection = db.collection('system_models');

    // Insert a document with LLM-specific extra fields that are NOT in base Schema
    const doc = {
      model: 'gpt-4o-strict-test',
      type: 'llm',
      provider: 'openai',
      name: 'GPT-4o',
      isActive: true,
      isSystem: true,
      // LLM-specific fields not declared in Schema base (strict:false allows them)
      maxContext: 128000,
      maxResponse: 4096,
      quoteMaxToken: 120000,
      functionCall: true,
      toolChoice: true,
      vision: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await collection.insertOne(doc);
    const found = await collection.findOne({ model: 'gpt-4o-strict-test' });

    expect(found).not.toBeNull();
    expect(found?.maxContext).toBe(128000);
    expect(found?.vision).toBe(true);
    expect(found?.functionCall).toBe(true);

    // cleanup
    await collection.deleteOne({ model: 'gpt-4o-strict-test' });
  });

  it('should register the legacy unique model index for cleanup', () => {
    const modelIndex = MongoSystemModel.schema.indexes().find(([keys]) => keys.model === 1);

    expect(modelIndex).toBeUndefined();
    expect(getDeprecatedIndexes(MongoSystemModel.schema)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          indexName: 'model_1',
          key: { model: 1 },
          options: { unique: true }
        })
      ])
    );
  });
});

describe('DefaultModelSchema (new)', () => {
  it('should upsert default_models document with all 9 fields', async () => {
    const db = connectionMongo.connection.db;
    if (!db) throw new Error('MongoDB not connected');

    const collection = db.collection('default_models');

    // Upsert a system default config
    await collection.updateOne(
      {},
      {
        $set: {
          llmId: 'llm-id-123',
          embeddingId: 'emb-id-456',
          ttsId: null,
          sttId: null,
          rerankId: null,
          datasetTextLLMId: 'llm-id-123',
          datasetImageLLMId: null,
          chatTitleLLMId: null,
          helperBotLLMId: null
        }
      },
      { upsert: true }
    );

    const found = await collection.findOne({});
    expect(found).not.toBeNull();
    expect(found?.llmId).toBe('llm-id-123');
    expect(found?.embeddingId).toBe('emb-id-456');

    // cleanup
    await collection.deleteMany({});
  });
});
