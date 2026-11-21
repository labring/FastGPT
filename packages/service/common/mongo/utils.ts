import { isObjectId } from '@fastgpt/global/common/string/utils';
import { ReadPreference, Types } from './index';

/** 兼容跨模块实例的 BSON ObjectId 鸭子类型检查。 */
const getBsonObjectIdHex = (value: unknown): string | null => {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { _bsontype?: unknown; toHexString?: unknown };
  if (candidate._bsontype !== 'ObjectId' || typeof candidate.toHexString !== 'function') {
    return null;
  }
  const hex = candidate.toHexString();
  return typeof hex === 'string' && isObjectId(hex) ? hex.toLowerCase() : null;
};

/**
 * 归一化合法 ObjectId 为小写 24 位十六进制字符串，供 Map 键与去重口径保持一致。
 * 仅接受 ObjectId 实例（含跨 realm BSON ObjectId）或 24 位 hex 字符串，拒绝数字、12 字符短串与普通对象。
 */
export const toObjectIdHex = (value: unknown): string | null => {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (typeof value === 'string') {
    return isObjectId(value) ? value.toLowerCase() : null;
  }
  return getBsonObjectIdHex(value);
};

/**
 * 严格解析 ObjectId，仅接受 ObjectId 实例或 24 位十六进制字符串，
 * 避免 BSON 数字或 12 字符短串绕过 Types.ObjectId.isValid 后在构造 ObjectId 时抛 BSONError。
 */
export const parseObjectId = (value: unknown): Types.ObjectId | null => {
  if (value instanceof Types.ObjectId) return value;
  if (typeof value === 'string' && isObjectId(value)) {
    return new Types.ObjectId(value);
  }
  const bsonHex = getBsonObjectIdHex(value);
  return bsonHex ? new Types.ObjectId(bsonHex) : null;
};

/**
 * 从原始外键序列中过滤并去重收集有效 ObjectId，可选跳过已缓存集合中的小写 hex 键。
 * 统一用于应用层批量 `$in` 回表查询，避免各业务手写去重循环与大小写口径不一致。
 */
export const collectUniqueObjectIds = (
  values: Iterable<unknown>,
  options?: {
    exclude?: ReadonlySet<string> | ReadonlyMap<string, unknown>;
  }
): Types.ObjectId[] => {
  const exclude = options?.exclude;
  const uniqueMap = new Map<string, Types.ObjectId>();

  for (const value of values) {
    const objectId = parseObjectId(value);
    if (!objectId) continue;
    const idHex = objectId.toHexString();
    if (exclude?.has(idHex) || uniqueMap.has(idHex)) continue;
    uniqueMap.set(idHex, objectId);
  }

  return Array.from(uniqueMap.values());
};

export const readFromSecondary = {
  readPreference: ReadPreference.SECONDARY_PREFERRED, // primary | primaryPreferred | secondary | secondaryPreferred | nearest
  readConcern: {
    level: 'local' as any
  } // local | majority | linearizable | available
};

export const writePrimary = {
  writeConcern: {
    w: 1,
    journal: false
  }
};
