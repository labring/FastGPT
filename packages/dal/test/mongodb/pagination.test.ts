import type { Model, Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { paginate } from '../../mongodb/pagination';

type Doc = { _id: Types.ObjectId; username: string };

const createQuery = <T>(value: T) => ({
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  session: vi.fn().mockReturnThis(),
  lean: vi.fn(async () => value)
});

const createCountQuery = (value: number) => ({
  session: vi.fn().mockReturnThis(),
  then: (onFulfilled: (v: number) => void) => Promise.resolve(onFulfilled(value))
});

const createModel = (total: number, list: Doc[]) => {
  const countDocuments = vi.fn(() => createCountQuery(total));
  const find = vi.fn(() => createQuery(list));
  const model = {
    countDocuments,
    find
  } as unknown as Model<Doc>;
  return { model, countDocuments, find };
};

describe('paginate', () => {
  const list: Doc[] = [
    { _id: '507f1f77bcf86cd799439011' as unknown as Types.ObjectId, username: 'a@example.com' }
  ];

  it('returns total and list with normalized skip/limit', async () => {
    const { model, countDocuments, find } = createModel(42, list);

    const result = await paginate({
      model,
      filter: { status: 'active' },
      page: 2,
      pageSize: 20,
      sort: { createTime: -1 }
    });

    expect(countDocuments).toHaveBeenCalledWith({ status: 'active' });
    const query = find.mock.results[0].value;
    expect(query.sort).toHaveBeenCalledWith({ createTime: -1 });
    expect(query.skip).toHaveBeenCalledWith(20);
    expect(query.limit).toHaveBeenCalledWith(20);
    expect(result).toEqual({ total: 42, list });
  });

  it('uses defaults for missing page params', async () => {
    const { model } = createModel(1, []);
    const find = vi.spyOn(model, 'find');

    await paginate({ model, filter: {}, page: 0, pageSize: 0 });

    const query = find.mock.results[0].value;
    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.limit).toHaveBeenCalledWith(10);
  });

  it('binds both queries to the transaction session', async () => {
    const session = {} as never;
    const { model, countDocuments } = createModel(3, []);
    const find = vi.spyOn(model, 'find');

    await paginate({ model, filter: {}, page: 1, pageSize: 10, session });

    expect(countDocuments.mock.results[0].value.session).toHaveBeenCalledWith(session);
    expect(find.mock.results[0].value.session).toHaveBeenCalledWith(session);
  });
});
