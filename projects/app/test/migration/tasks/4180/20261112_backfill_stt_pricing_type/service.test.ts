import { describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import { backfillSTTPricingTypeRecord } from '@/migration/tasks/4180/20261112_backfill_stt_pricing_type/service';
vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const seed = async (overrides: Record<string, unknown> = {}) => {
  const _id = new Types.ObjectId();
  const raw = {
    _id,
    type: 'stt',
    scope: 'system',
    model: `stt-${_id}`,
    name: 'STT',
    provider: 'openai',
    config: {},
    requestAuth: 'fixture-secret',
    ...overrides
  };
  await MongoAIModel.collection.insertOne(raw as any);
  return raw;
};

describe('backfillSTTPricingTypeRecord', () => {
  it('does not overwrite malformed explicit types or invalid pricing objects', async () => {
    for (const pricing of [
      { type: null },
      { type: 'unknown' },
      { unitPrice: -1 },
      [],
      true,
      'invalid'
    ]) {
      const raw = await seed({ pricing });
      await expect(backfillSTTPricingTypeRecord(String(raw._id))).rejects.toThrow();
      expect(await MongoAIModel.collection.findOne({ _id: raw._id })).toEqual(raw);
    }
  });
  it('rolls back pricing and catalog revisions together on write failure', async () => {
    const raw = await seed({ pricing: { unitPrice: 0.2 } });
    const catalogs = await MongoAIModelCatalog.find({}).lean();
    const spy = vi
      .spyOn(MongoAIModel.collection, 'updateOne')
      .mockRejectedValueOnce(new Error('write failed'));
    try {
      await expect(backfillSTTPricingTypeRecord(String(raw._id))).rejects.toThrow('write failed');
    } finally {
      spy.mockRestore();
    }
    expect(await MongoAIModel.collection.findOne({ _id: raw._id })).toEqual(raw);
    expect(await MongoAIModelCatalog.find({}).lean()).toEqual(catalogs);
  });
  it('preserves a concurrent explicit token configuration by re-reading inside the transaction', async () => {
    const raw = await seed({ pricing: { unitPrice: 0.2 } });
    const collection = MongoAIModel.collection;
    const find = collection.findOne.bind(collection);
    const spy = vi.spyOn(collection, 'findOne').mockImplementationOnce(async (...args: any[]) => {
      const before = await find(...(args as Parameters<typeof find>));
      await collection.updateOne(
        { _id: raw._id },
        { $set: { pricing: { type: 'tokens', unitPrice: 10 } } }
      );
      return before;
    });
    try {
      await backfillSTTPricingTypeRecord(String(raw._id));
    } finally {
      spy.mockRestore();
    }
    expect((await collection.findOne({ _id: raw._id }))?.pricing).toEqual({
      type: 'tokens',
      unitPrice: 10
    });
    await expect(
      backfillSTTPricingTypeRecord(String(new Types.ObjectId()))
    ).resolves.toBeUndefined();
  });
});
