import { Types } from 'mongoose';
import type { EntityId } from '../domain';
import { MongoInvalidArgumentError } from './errors';

export function toEntityId(value: unknown) {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (typeof value === 'string') return value;

  throw new MongoInvalidArgumentError("mapping id value error: invalid 'id' value type");
}

export const toMongoObjectId = (id: EntityId) => {
  if (Types.ObjectId.isValid(id)) return new Types.ObjectId(id);
  throw new MongoInvalidArgumentError('Invalid MongoDB entity id');
};
