import { Types } from 'mongoose';

export function toEntityId(value: unknown) {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (typeof value === 'string') return value;

  throw new Error("mapping id value error: invalid 'id' value type");
}
