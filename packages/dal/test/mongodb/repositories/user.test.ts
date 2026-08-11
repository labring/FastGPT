import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { Types, type ClientSession, type Model, type Mongoose } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import type { UserDocument, UserMongooseSchemaType } from '../../../mongodb/models/user';
import { MongoUserRepository } from '../../../mongodb/repositories/user';
import { MongoTransactionRunner } from '../../../mongodb/transaction';
import {
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
  lean: vi.fn(async () => value)
});

const createRepository = () => {
  const queries = {
    findById: createQuery<UserDocument | null>(document),
    findOne: createQuery<UserDocument | null>(document),
    update: createQuery<UserDocument | null>(document)
  };
  const createdDocument = { toObject: vi.fn(() => document) };
  const model = {
    findById: vi.fn(() => queries.findById),
    findOne: vi.fn(() => queries.findOne),
    create: vi.fn(async () => [createdDocument]),
    findByIdAndUpdate: vi.fn(() => queries.update)
  } as unknown as Model<UserMongooseSchemaType>;

  return { repository: new MongoUserRepository(model), model, queries, createdDocument };
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
