import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { Types, type ClientSession, type Model, type Mongoose } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import type { UserDocument, UserMongooseSchemaType } from '../../../mongodb/models/user';
import { MongoUserRepository } from '../../../mongodb/repositories/user';
import { MongoTransactionRunner } from '../../../mongodb/transaction';
import {
  DatabaseConflictError,
  DatabaseInvalidArgumentError,
  DatabaseUnavailableError,
  DatabaseUniqueConstraintError
} from '../../../db';

const userId = '507f1f77bcf86cd799439011';
const document: UserDocument = {
  _id: new Types.ObjectId(userId),
  __v: 0,
  status: UserStatusEnum.active,
  username: 'user@example.com',
  password: 'hashed-password',
  createTime: new Date('2026-01-01T00:00:00.000Z'),
  promotionRate: 0,
  timezone: 'Asia/Shanghai',
  language: 'zh-CN',
  tags: []
};

const createQuery = <T>(value: T) => ({
  session: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  lean: vi.fn(async () => value)
});

const createExistsQuery = (value: unknown) => ({
  session: vi.fn().mockReturnThis(),
  then: (onFulfilled: (v: unknown) => void) => Promise.resolve(onFulfilled(value))
});

const createRepository = () => {
  const queries = {
    findById: createQuery<UserDocument | null>(document),
    findOne: createQuery<UserDocument | null>(document),
    update: createQuery<UserDocument | null>(document),
    casUpdate: createQuery<UserDocument | null>(document)
  };
  const exists = vi.fn(() => createExistsQuery(true));
  const createdDocument = { toObject: vi.fn(() => document) };
  const model = {
    findById: vi.fn(() => queries.findById),
    findOne: vi.fn(() => queries.findOne),
    create: vi.fn(async () => [createdDocument]),
    findByIdAndUpdate: vi.fn(() => queries.update),
    findOneAndUpdate: vi.fn(() => queries.casUpdate),
    exists
  } as unknown as Model<UserMongooseSchemaType>;

  return { repository: new MongoUserRepository(model), model, queries, createdDocument, exists };
};

describe('MongoUserRepository.findById', () => {
  it('queries by ObjectId and maps the document', async () => {
    const { repository, model } = createRepository();

    const user = await repository.findById(userId);

    expect(model.findById).toHaveBeenCalledWith(new Types.ObjectId(userId));
    expect(user?.id).toBe(userId);
  });

  it('rejects ids that cannot be represented by MongoDB', async () => {
    const { repository, model } = createRepository();

    const error = await repository.findById('sql-id').catch((error) => error);

    expect(error).toBeInstanceOf(DatabaseInvalidArgumentError);
    expect(error).toMatchObject({ code: 'DB_INVALID_ARGUMENT' });
    expect(error.message).not.toContain('sql-id');
    expect(model.findById).not.toHaveBeenCalled();
  });

  it('returns null when the id does not exist', async () => {
    const { repository, queries } = createRepository();
    queries.findById.lean.mockResolvedValueOnce(null);

    await expect(repository.findById(userId)).resolves.toBeNull();
  });
});

describe('MongoUserRepository.findByUsername', () => {
  it('returns null when no user exists', async () => {
    const { repository, queries } = createRepository();
    queries.findOne.lean.mockResolvedValueOnce(null);

    await expect(repository.findByUsername('missing@example.com')).resolves.toBeNull();
  });
});

describe('MongoUserRepository.findIdByUsername', () => {
  it('projects only the entity id', async () => {
    const { repository, model, queries } = createRepository();
    queries.findOne.lean.mockResolvedValueOnce({
      _id: new Types.ObjectId(userId)
    } as unknown as UserDocument);

    const id = await repository.findIdByUsername('user@example.com');

    expect(model.findOne).toHaveBeenCalledWith({ username: 'user@example.com' });
    expect(queries.findOne.select).toHaveBeenCalledWith('_id');
    expect(id).toBe(userId);
  });

  it('returns null when no user exists', async () => {
    const { repository, queries } = createRepository();
    queries.findOne.lean.mockResolvedValueOnce(null);

    await expect(repository.findIdByUsername('missing@example.com')).resolves.toBeNull();
  });
});

describe('MongoUserRepository.findPasswordUpdateTimeById', () => {
  it('projects only the password update time', async () => {
    const { repository, model, queries } = createRepository();
    const updateTime = new Date('2026-02-01T00:00:00.000Z');
    queries.findById.lean.mockResolvedValueOnce({
      passwordUpdateTime: updateTime
    } as unknown as UserDocument);

    const result = await repository.findPasswordUpdateTimeById(userId);

    expect(model.findById).toHaveBeenCalledWith(new Types.ObjectId(userId));
    expect(queries.findById.select).toHaveBeenCalledWith('passwordUpdateTime');
    expect(result).toEqual({ passwordUpdateTime: updateTime });
  });

  it('normalizes an explicit null update time to undefined', async () => {
    const { repository, queries } = createRepository();
    queries.findById.lean.mockResolvedValueOnce({
      passwordUpdateTime: null
    } as unknown as UserDocument);

    await expect(repository.findPasswordUpdateTimeById(userId)).resolves.toEqual({
      passwordUpdateTime: undefined
    });
  });

  it('returns null when the user does not exist', async () => {
    const { repository, queries } = createRepository();
    queries.findById.lean.mockResolvedValueOnce(null);

    await expect(repository.findPasswordUpdateTimeById(userId)).resolves.toBeNull();
  });
});

describe('MongoUserRepository.findSemById', () => {
  it('projects only the fastgpt_sem field and returns the parsed value', async () => {
    const { repository, model, queries } = createRepository();
    queries.findById.lean.mockResolvedValueOnce({
      fastgpt_sem: { keyword: 'FastGPT' }
    } as unknown as UserDocument);

    const result = await repository.findSemById(userId);

    expect(model.findById).toHaveBeenCalledWith(new Types.ObjectId(userId));
    expect(queries.findById.select).toHaveBeenCalledWith('fastgpt_sem');
    expect(result).toEqual({ fastgpt_sem: { keyword: 'FastGPT' } });
  });

  it('normalizes an invalid fastgpt_sem value to undefined', async () => {
    const { repository, queries } = createRepository();
    queries.findById.lean.mockResolvedValueOnce({
      fastgpt_sem: 'not-an-object'
    } as unknown as UserDocument);

    await expect(repository.findSemById(userId)).resolves.toEqual({
      fastgpt_sem: undefined
    });
  });

  it('returns null when the user does not exist', async () => {
    const { repository, queries } = createRepository();
    queries.findById.lean.mockResolvedValueOnce(null);

    await expect(repository.findSemById(userId)).resolves.toBeNull();
  });
});

describe('MongoUserRepository.findByCredentials', () => {
  it('passes raw credentials to the Mongoose schema setter', async () => {
    const { repository, model } = createRepository();

    await repository.findByCredentials({
      username: 'user@example.com',
      password: 'plain-password'
    });

    expect(model.findOne).toHaveBeenCalledWith({
      username: 'user@example.com',
      password: 'plain-password'
    });
  });

  it('supports credential lookup by domain id', async () => {
    const { repository, model } = createRepository();

    await repository.findByCredentials({ id: userId, password: 'plain-password' });

    expect(model.findOne).toHaveBeenCalledWith({
      _id: new Types.ObjectId(userId),
      password: 'plain-password'
    });
  });

  it('returns null for invalid credentials', async () => {
    const { repository, queries } = createRepository();
    queries.findOne.lean.mockResolvedValueOnce(null);

    await expect(
      repository.findByCredentials({
        username: 'user@example.com',
        password: 'wrong-password'
      })
    ).resolves.toBeNull();
  });
});

describe('MongoUserRepository.create', () => {
  it('creates through an array write and maps the result', async () => {
    const { repository, model, createdDocument } = createRepository();
    const input = { username: 'user@example.com', password: 'plain-password' };

    const user = await repository.create(input);

    expect(model.create).toHaveBeenCalledWith([input], undefined);
    expect(createdDocument.toObject).toHaveBeenCalledOnce();
    expect(user).not.toHaveProperty('password');
  });
});

describe('MongoUserRepository.updateById', () => {
  it('updates by ObjectId and returns the updated user', async () => {
    const { repository, model } = createRepository();

    const user = await repository.updateById(userId, { timezone: 'UTC' });

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      new Types.ObjectId(userId),
      { $set: { timezone: 'UTC' } },
      { new: true }
    );
    expect(user?.timezone).toBe('Asia/Shanghai');
  });

  it('returns null when the user no longer exists', async () => {
    const { repository, queries } = createRepository();
    queries.update.lean.mockResolvedValueOnce(null);

    await expect(repository.updateById(userId, { timezone: 'UTC' })).resolves.toBeNull();
  });

  it('drops undefined patch fields before updating', async () => {
    const { repository, model } = createRepository();

    await repository.updateById(userId, { timezone: 'UTC', contact: undefined });

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      new Types.ObjectId(userId),
      { $set: { timezone: 'UTC' } },
      { new: true }
    );
  });
});

describe('MongoUserRepository transaction context', () => {
  it('attaches the same session to queries and creates', async () => {
    const { repository, model, queries } = createRepository();
    const session = {
      withTransaction: vi.fn(async (handler: () => Promise<unknown>) => handler()),
      endSession: vi.fn(async () => undefined)
    } as unknown as ClientSession;
    const client = {
      startSession: vi.fn(async () => session)
    } as unknown as Mongoose;

    await new MongoTransactionRunner(client).withTransaction(async (context) => {
      await repository.findByUsername('user@example.com', context);
      await repository.create(
        { username: 'user@example.com', password: 'plain-password' },
        context
      );
    });

    expect(queries.findOne.session).toHaveBeenCalledWith(session);
    expect(model.create).toHaveBeenLastCalledWith(
      [{ username: 'user@example.com', password: 'plain-password' }],
      { session }
    );
  });
});

describe('MongoUserRepository error adapter', () => {
  it('maps driver availability errors on reads', async () => {
    const { repository, queries } = createRepository();
    queries.findOne.lean.mockRejectedValueOnce({ name: 'MongoServerSelectionError' });

    const error = await repository.findByUsername('user@example.com').catch((error) => error);

    expect(error).toBeInstanceOf(DatabaseUnavailableError);
    expect(error).toMatchObject({ code: 'DB_UNAVAILABLE' });
  });

  it('maps duplicate writes without exposing duplicate values', async () => {
    const { repository, model } = createRepository();
    vi.mocked(model.create).mockRejectedValueOnce({
      code: 11000,
      keyPattern: { username: 1 },
      keyValue: { username: 'secret@example.com' }
    });

    const error = await repository
      .create({ username: 'secret@example.com', password: 'password' })
      .catch((error) => error);

    expect(error).toBeInstanceOf(DatabaseUniqueConstraintError);
    expect(error).toMatchObject({ fields: ['username'] });
    expect(error.message).not.toContain('secret@example.com');
  });
});

describe('MongoUserRepository.updateByIdIfState', () => {
  it('updates atomically when the expected state matches', async () => {
    const { repository, model, queries } = createRepository();
    queries.casUpdate.lean.mockResolvedValueOnce({
      ...document,
      timezone: 'UTC'
    } as UserDocument);

    const user = await repository.updateByIdIfState(
      userId,
      { timezone: 'Asia/Shanghai' },
      { timezone: 'UTC' }
    );

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(userId), timezone: 'Asia/Shanghai' },
      { $set: { timezone: 'UTC' } },
      { new: true }
    );
    expect(queries.casUpdate.lean).toHaveBeenCalledOnce();
    expect(user?.timezone).toBe('UTC');
  });

  it('throws DB_CONFLICT when the document exists but the expected state mismatches', async () => {
    const { repository, queries } = createRepository();
    queries.casUpdate.lean.mockResolvedValueOnce(null);

    const error = await repository
      .updateByIdIfState(userId, { timezone: 'UTC' }, { timezone: 'Asia/Shanghai' })
      .catch((err) => err);

    expect(error).toBeInstanceOf(DatabaseConflictError);
    expect(error).toMatchObject({ code: 'DB_CONFLICT' });
  });

  it('returns null when the document does not exist', async () => {
    const { repository, queries, exists } = createRepository();
    queries.casUpdate.lean.mockResolvedValueOnce(null);
    exists.mockReturnValueOnce(createExistsQuery(null));

    await expect(
      repository.updateByIdIfState(userId, { timezone: 'UTC' }, { timezone: 'Asia/Shanghai' })
    ).resolves.toBeNull();
  });

  it('rejects ids that cannot be represented by MongoDB', async () => {
    const { repository, model } = createRepository();

    const error = await repository
      .updateByIdIfState('sql-id', {}, { timezone: 'UTC' })
      .catch((err) => err);

    expect(error).toBeInstanceOf(DatabaseInvalidArgumentError);
    expect(error).toMatchObject({ code: 'DB_INVALID_ARGUMENT' });
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
