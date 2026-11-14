import { describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import { splitSTTTokenPricesRecord } from '@/migration/tasks/4180/20261114_split_stt_token_prices/service';
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

describe('splitSTTTokenPricesRecord', () => {
  it('rejects malformed source prices without writes', async () => {
    for (const pricing of [
      { type: 'tokens', unitPrice: -1 },
      { type: 'tokens', unitPrice: '10' },
      { type: 'tokens', inputPrice: -1 },
      { type: 'tokens', outputPrice: NaN }
    ]) {
      const raw = await seed({ pricing });
      await expect(splitSTTTokenPricesRecord(String(raw._id))).rejects.toThrow();
      expect(await MongoAIModel.collection.findOne({ _id: raw._id })).toEqual(raw);
    }
  });
  it('rolls back prices and catalog revision together', async () => {
    const raw = await seed({ pricing: { type: 'tokens', unitPrice: 10 } });
    const before = await MongoAIModelCatalog.find({}).lean();
    const spy = vi
      .spyOn(MongoAIModel.collection, 'updateOne')
      .mockRejectedValueOnce(new Error('write failed'));
    try {
      await expect(splitSTTTokenPricesRecord(String(raw._id))).rejects.toThrow('write failed');
    } finally {
      spy.mockRestore();
    }
    expect(await MongoAIModel.collection.findOne({ _id: raw._id })).toEqual(raw);
    expect(await MongoAIModelCatalog.find({}).lean()).toEqual(before);
  });
  it('preserves concurrent edits inside the transaction and ignores deleted/non-token models', async () => {
    const raw = await seed({ pricing: { type: 'tokens', unitPrice: 10 } });
    const collection = MongoAIModel.collection;
    const find = collection.findOne.bind(collection);
    const spy = vi.spyOn(collection, 'findOne').mockImplementationOnce(async (...args: any[]) => {
      const before = await find(...(args as Parameters<typeof find>));
      await collection.updateOne(
        { _id: raw._id },
        { $set: { pricing: { type: 'tokens', inputPrice: 0.8, outputPrice: 2.7 } } }
      );
      return before;
    });
    try {
      await splitSTTTokenPricesRecord(String(raw._id));
    } finally {
      spy.mockRestore();
    }
    expect((await collection.findOne({ _id: raw._id }))?.pricing).toEqual({
      type: 'tokens',
      inputPrice: 0.8,
      outputPrice: 2.7
    });
    await expect(splitSTTTokenPricesRecord(String(new Types.ObjectId()))).resolves.toBeUndefined();
    const duration = await seed({ pricing: { type: 'duration', unitPrice: 0.2 } });
    await splitSTTTokenPricesRecord(String(duration._id));
    expect(await collection.findOne({ _id: duration._id })).toEqual(duration);
  });
});
