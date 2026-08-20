import { Types } from 'mongoose';
import type { EntityId } from '../db/types';
import { MongoInvalidArgumentError } from './errors';

export function toEntityId(value: unknown) {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (typeof value === 'string') return value;

  throw new MongoInvalidArgumentError("mapping id value error: invalid 'id' value type");
}

export const toMongoObjectId = (id: EntityId) => {
  // ObjectId.isValid 对任意 12 字符字符串也返回 true，这里用严格 24 位十六进制校验。
  if (/^[0-9a-fA-F]{24}$/.test(id)) return new Types.ObjectId(id);
  throw new MongoInvalidArgumentError('Invalid MongoDB entity id');
};
