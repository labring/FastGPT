import { ReadPreference, Types } from './index';

const HEX_OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/**
 * 仅接受 ObjectId 实例或 24 位十六进制字符串，避免 BSON 数字或 12 字符短串
 * 绕过 Types.ObjectId.isValid 后在构造 ObjectId 时抛 BSONError。
 */
export const parseObjectId = (value: unknown): Types.ObjectId | null => {
  if (value instanceof Types.ObjectId) return value;
  if (typeof value === 'string' && HEX_OBJECT_ID_RE.test(value)) {
    return new Types.ObjectId(value);
  }
  return null;
};

export const readFromSecondary = {
  readPreference: ReadPreference.SECONDARY_PREFERRED, // primary | primaryPreferred | secondary | secondaryPreferred | nearest
  readConcern: {
    level: 'local' as any
  } // local | majority | linearizable | available
};

export const readFromPrimary = {
  readPreference: ReadPreference.PRIMARY
};

export const writePrimary = {
  writeConcern: {
    w: 1,
    journal: false
  }
};
