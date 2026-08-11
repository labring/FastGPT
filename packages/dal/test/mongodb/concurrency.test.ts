import type { Model, Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { casUpdateById } from '../../mongodb/concurrency';
import { MongoInvalidArgumentError } from '../../mongodb/errors';

type Doc = { _id: Types.ObjectId; username: string; timezone: string; contact?: string };

const userId = '507f1f77bcf86cd799439011';
const doc: Doc = {
  _id: userId as unknown as Types.ObjectId,
  username: 'user@example.com',
  timezone: 'UTC'
};

const createQuery = <T>(value: T) => ({
  session: vi.fn().mockReturnThis(),
  lean: vi.fn(async () => value)
});

const createModel = (value: Doc | null) => {
  const findOneAndUpdate = vi.fn(() => createQuery(value));
  const model = { findOneAndUpdate } as unknown as Model<Doc>;
  return { model, findOneAndUpdate };
};

describe('casUpdateById', () => {
  it('matches expected state and returns the updated document', async () => {
    const { model, findOneAndUpdate } = createModel(doc);

    const result = await casUpdateById<Doc>({
      model,
      id: userId,
      expected: { timezone: 'Asia/Shanghai' },
      patch: { timezone: 'UTC' }
    });

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: expect.anything(), timezone: 'Asia/Shanghai' },
      { $set: { timezone: 'UTC' } },
      { new: true }
    );
    expect(result).toEqual(doc);
  });

  it('returns null when expected state does not match', async () => {
    const { model } = createModel(null);

    await expect(
      casUpdateById<Doc>({
        model,
        id: userId,
        expected: { timezone: 'UTC' },
        patch: { timezone: 'Asia/Shanghai' }
      })
    ).resolves.toBeNull();
  });

  it('filters undefined fields from the patch', async () => {
    const { model, findOneAndUpdate } = createModel(doc);

    await casUpdateById<Doc>({
      model,
      id: userId,
      expected: {},
      patch: { timezone: 'UTC', contact: undefined }
    });

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: expect.anything() },
      { $set: { timezone: 'UTC' } },
      { new: true }
    );
  });

  it('rejects ids that cannot be represented by MongoDB', async () => {
    const { model, findOneAndUpdate } = createModel(doc);

    await expect(
      casUpdateById<Doc>({ model, id: 'sql-id', expected: {}, patch: {} })
    ).rejects.toBeInstanceOf(MongoInvalidArgumentError);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('binds the query to the transaction session', async () => {
    const session = {} as never;
    const { model, findOneAndUpdate } = createModel(doc);

    await casUpdateById<Doc>({
      model,
      id: userId,
      expected: {},
      patch: { timezone: 'UTC' },
      session
    });

    expect(findOneAndUpdate.mock.results[0].value.session).toHaveBeenCalledWith(session);
  });
});
