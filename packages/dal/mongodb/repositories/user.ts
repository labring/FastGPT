import mongoose, { type Model, type Mongoose, type Query } from 'mongoose';
import type { DatabaseErrorAdapter } from '../../db';
import type { CreateUser, UpdateUser, User, UserCredentials } from '../../domain/user';
import type { EntityId } from '../../domain/types';
import type { UserRepository } from '../../ports/user.repository';
import type { TransactionContext } from '../../transaction';
import { toUser } from '../mappers/user';
import { MongoErrorAdapter } from '../errors';
import { getUserModel, type UserDocument, type UserMongooseSchemaType } from '../models/user';
import { getMongoSession } from '../transaction';
import { toMongoObjectId } from '../utils';

export class MongoUserRepository implements UserRepository {
  constructor(
    private readonly model: Model<UserMongooseSchemaType> = getUserModel(mongoose),
    private readonly errorAdapter: DatabaseErrorAdapter = new MongoErrorAdapter()
  ) {}

  private execute<T>(handler: () => Promise<T>) {
    return this.errorAdapter.execute(handler);
  }

  private withSession<T>(query: Query<T, UserMongooseSchemaType>, context?: TransactionContext) {
    const session = getMongoSession(context);
    return session ? query.session(session) : query;
  }

  async findById(id: EntityId, context?: TransactionContext): Promise<User | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.model.findById(toMongoObjectId(id)),
        context
      ).lean<UserDocument>();
      return document ? toUser(document) : null;
    });
  }

  async findByUsername(username: string, context?: TransactionContext): Promise<User | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.model.findOne({ username }),
        context
      ).lean<UserDocument>();
      return document ? toUser(document) : null;
    });
  }

  async findByCredentials(
    credentials: UserCredentials,
    context?: TransactionContext
  ): Promise<User | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.model.findOne(
          'id' in credentials
            ? { _id: toMongoObjectId(credentials.id), password: credentials.password }
            : { username: credentials.username, password: credentials.password }
        ),
        context
      ).lean<UserDocument>();
      return document ? toUser(document) : null;
    });
  }

  async create(input: CreateUser, context?: TransactionContext): Promise<User> {
    return this.execute(async () => {
      const session = getMongoSession(context);
      const [document] = await this.model.create([input], session ? { session } : undefined);
      return toUser(document.toObject() as UserDocument);
    });
  }

  async updateById(
    id: EntityId,
    patch: UpdateUser,
    context?: TransactionContext
  ): Promise<User | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.model.findByIdAndUpdate(toMongoObjectId(id), { $set: patch }, { new: true }),
        context
      ).lean<UserDocument>();
      return document ? toUser(document) : null;
    });
  }
}

export const createMongoUserRepository = (
  client: Mongoose,
  errorAdapter: DatabaseErrorAdapter = new MongoErrorAdapter()
) => new MongoUserRepository(getUserModel(client), errorAdapter);
