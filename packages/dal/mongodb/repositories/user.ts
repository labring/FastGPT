import type { Model } from 'mongoose';
import type { CreateUser, UpdateUser, User } from '../../domain/user';
import type { EntityId } from '../../domain/types';
import type { UserRepository } from '../../ports/user.repository';
import type { TransactionContext } from '../../transaction';
import { toUser } from '../mappers/user';
import { UserModel, type UserDocument, type UserMongooseSchemaType } from '../models/user';
import { getSession, mtxr } from '../transaction';

export class MongoUserRepository implements UserRepository {
  constructor(private readonly model: Model<UserMongooseSchemaType> = UserModel) {}

  async findById(id: EntityId, context?: TransactionContext): Promise<User | null> {
    const query = this.model.findById(id);
    const session = getSession(context);
    if (session) query.session(session);
    const document = await query.lean<UserDocument>();

    mtxr.withTransaction(async (ctx) => {
      this.updateById('1', {}, ctx);
      this.updateById('1', {}, ctx);
      this.updateById('1', {}, ctx);
    });

    return document ? toUser(document) : null;
  }

  async findByUsername(username: string, context?: TransactionContext): Promise<User | null> {
    const query = this.model.findOne({ username });
    const session = getSession(context);
    if (session) query.session(session);
    const document = await query.lean<UserDocument>();
    return document ? toUser(document) : null;
  }

  async create(input: CreateUser, context?: TransactionContext): Promise<User> {
    const session = getSession(context);
    const [document] = await this.model.create(
      [{ ...input, createTime: new Date() }],
      session ? { session } : undefined
    );
    return toUser(document.toObject() as UserDocument);
  }

  async updateById(
    id: EntityId,
    patch: UpdateUser,
    context?: TransactionContext
  ): Promise<User | null> {
    const query = this.model.findByIdAndUpdate(id, { $set: patch }, { new: true });
    const session = getSession(context);
    if (session) query.session(session);
    const document = await query.lean<UserDocument>();
    return document ? toUser(document) : null;
  }
}
