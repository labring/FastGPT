import type { Model } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import type {
  TmpDataDocument,
  TmpDataMongooseSchemaType
} from '../../../../../mongodb/business/support/user/verification/schema';
import { MongoTmpDataRepository } from '../../../../../mongodb/business/support/user/verification/repository';

const document: TmpDataDocument = {
  dataId: 'verification:v1:login:password:user@example.com',
  data: { preLoginCode: 'ABC123' },
  expireAt: new Date('2026-01-02T00:00:00.000Z')
} as unknown as TmpDataDocument;

const createQuery = <T>(value: T) => ({
  session: vi.fn().mockReturnThis(),
  lean: vi.fn(async () => value)
});

const createRepository = () => {
  const queries = {
    findOne: createQuery<TmpDataDocument | null>(document),
    deletedCount: 1
  };
  const model = {
    findOne: vi.fn(() => queries.findOne),
    deleteOne: vi.fn((filter) => ({
      session: vi.fn().mockReturnThis(),
      then: (onFulfilled: (v: { deletedCount: number }) => void) =>
        Promise.resolve(onFulfilled({ deletedCount: queries.deletedCount })),
      filter
    }))
  } as unknown as Model<TmpDataMongooseSchemaType>;

  return { repository: new MongoTmpDataRepository(model), model, queries };
};

const filter = {
  dataId: 'verification:v1:login:password:user@example.com',
  match: { preLoginCode: 'ABC123' }
};

describe('MongoTmpDataRepository.findActiveMaterial', () => {
  it('filters by dataId, active expiry and mapped material fields', async () => {
    const { repository, model } = createRepository();

    const material = await repository.findActiveMaterial(filter);

    expect(model.findOne).toHaveBeenCalledWith({
      dataId: filter.dataId,
      expireAt: { $gt: expect.any(Date) },
      'data.preLoginCode': 'ABC123'
    });
    expect(material).toMatchObject({
      dataId: document.dataId,
      data: { preLoginCode: 'ABC123' }
    });
  });

  it('returns null when no active material matches', async () => {
    const { repository, queries } = createRepository();
    queries.findOne.lean.mockResolvedValueOnce(null);

    await expect(repository.findActiveMaterial(filter)).resolves.toBeNull();
  });
});

describe('MongoTmpDataRepository.deleteActiveMaterial', () => {
  it('deletes the active material and reports success', async () => {
    const { repository, queries, model } = createRepository();

    await expect(repository.deleteActiveMaterial(filter)).resolves.toBe(true);

    expect(model.deleteOne).toHaveBeenCalledWith({
      dataId: filter.dataId,
      expireAt: { $gt: expect.any(Date) },
      'data.preLoginCode': 'ABC123'
    });
  });

  it('reports failure when no active material was deleted', async () => {
    const { repository, queries } = createRepository();
    queries.deletedCount = 0;

    await expect(repository.deleteActiveMaterial(filter)).resolves.toBe(false);
  });
});
