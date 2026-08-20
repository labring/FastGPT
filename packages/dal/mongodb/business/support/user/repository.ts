import mongoose, { type Model, type Mongoose, type Query } from 'mongoose';
import { FastGPT_SEM_Schema, type FastGPTSemType } from '@fastgpt/global/support/marketing/type';
import { DatabaseConflictError, type DatabaseErrorAdapter } from '../../../../db';
import type { ExpectedState } from '../../../../db';
import type { EntityId } from '../../../../db/types';
import type {
  CreateUser,
  UpdateUser,
  UserCredentials
} from '../../../../business/support/user/dto';
import type { User } from '../../../../business/support/user/entity';
import type { UserRepository } from '../../../../business/support/user/repository';
import type { TransactionContext } from '../../../../db/transaction';
import { MongoErrorAdapter } from '../../../errors';
import { casUpdateById } from '../../../concurrency';
import { getMongoSession } from '../../../transaction';
import { toEntityId, toMongoObjectId } from '../../../utils';
import { getUserModel, type UserDocument, type UserMongooseSchemaType } from './schema';
import { toUser } from './entity';

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

  /** 仅投影 _id，用于鉴权热路径，避免全文档读取与严格映射。 */
  async findIdByUsername(username: string, context?: TransactionContext): Promise<string | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.model.findOne({ username }).select('_id'),
        context
      ).lean<{ _id: unknown }>();
      return document ? toEntityId(document._id) : null;
    });
  }

  /** 仅投影 passwordUpdateTime，供密码过期检查使用；null 归一化为 undefined。 */
  async findPasswordUpdateTimeById(
    id: EntityId,
    context?: TransactionContext
  ): Promise<{ passwordUpdateTime?: Date } | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.model.findById(toMongoObjectId(id)).select('passwordUpdateTime'),
        context
      ).lean<{ passwordUpdateTime?: Date | null }>();
      return document ? { passwordUpdateTime: document.passwordUpdateTime ?? undefined } : null;
    });
  }

  async findByCredentials(
    credentials: UserCredentials,
    context?: TransactionContext
  ): Promise<User | null> {
    return this.execute(async () => {
      // 密码由 API 边界提前哈希，不能放入带有密码写入转换的查询条件中；
      // 先按身份读取隐藏字段，再与已存哈希直接比较，避免查询阶段重复转换。
      const filter =
        'id' in credentials
          ? { _id: toMongoObjectId(credentials.id) }
          : { username: credentials.username };
      const document = await this.withSession(
        this.model.findOne(filter).select('+password'),
        context
      ).lean<UserDocument>();
      return document && document.password === credentials.password ? toUser(document) : null;
    });
  }

  /** 仅投影 fastgpt_sem；非法形状归一化为 undefined，避免污染 CRM 归因。 */
  async findSemById(
    id: EntityId,
    context?: TransactionContext
  ): Promise<{ fastgpt_sem?: FastGPTSemType } | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.model.findById(toMongoObjectId(id)).select('fastgpt_sem'),
        context
      ).lean<{ fastgpt_sem?: unknown }>();
      if (!document) return null;

      const parsed = FastGPT_SEM_Schema.safeParse(document.fastgpt_sem);
      return { fastgpt_sem: parsed.success ? parsed.data : undefined };
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
      // 只更新显式提供的字段，避免 partial patch 中的 undefined 覆盖已存值。
      const $set = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined)
      );
      const document = await this.withSession(
        this.model.findByIdAndUpdate(toMongoObjectId(id), { $set }, { new: true }),
        context
      ).lean<UserDocument>();
      return document ? toUser(document) : null;
    });
  }

  async updateByIdIfState(
    id: EntityId,
    expected: ExpectedState<User>,
    patch: UpdateUser,
    context?: TransactionContext
  ): Promise<User | null> {
    return this.execute(async () => {
      // 低层 helper 返回文档形状，此处映射为带 _id/__v 的 UserDocument 再走领域转换。
      const document = (await casUpdateById({
        model: this.model,
        id,
        expected,
        patch,
        session: getMongoSession(context)
      })) as UserDocument | null;
      if (document) return toUser(document);

      // CAS 未命中时区分「文档不存在」与「并发冲突」：先确认文档是否仍存在。
      const exists = await this.withSession(
        this.model.exists({ _id: toMongoObjectId(id) }),
        context
      );
      if (exists) {
        throw new DatabaseConflictError();
      }
      return null;
    });
  }
}

export const createMongoUserRepository = (
  client: Mongoose,
  errorAdapter: DatabaseErrorAdapter = new MongoErrorAdapter()
) => new MongoUserRepository(getUserModel(client), errorAdapter);
