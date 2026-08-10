import { Types } from 'mongoose';
import type { EntityId } from '../domain';
import { MongoInvalidArgumentError } from './errors';

export function toEntityId(value: unknown) {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (typeof value === 'string') return value;

  throw new Error("mapping id value error: invalid 'id' value type");
}

/** 将通用实体 ID 转换为 Mongo ObjectId，并在 adapter 边界拒绝非法值。 */
export const toMongoObjectId = (id: EntityId) => {
  if (Types.ObjectId.isValid(id)) return new Types.ObjectId(id);
  throw new MongoInvalidArgumentError('Invalid MongoDB entity id');
};
