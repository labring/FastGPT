import z from 'zod';

/** 24 位十六进制实体 ID 正则（兼容 MongoDB ObjectId 与 PostgreSQL VARCHAR(24) 主键）。 */
export const ENTITY_ID_REGEX = /^[0-9a-fA-F]{24}$/;

const DEFAULT_ENTITY_ID_EXAMPLE = '68ee0bd23d17260b7829b137';

const fillRandomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let index = 0; index < length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
};

const toHex = (value: number, hexChars: number): string =>
  (value >>> 0).toString(16).padStart(hexChars, '0');

/** 进程级 5 字节随机熵（10 位小写 hex），在当前运行上下文内保持稳定。 */
const PROCESS_ENTROPY_HEX = Array.from(fillRandomBytes(5), (byte) => toHex(byte, 2)).join('');

/**
 * 进程内 24 位单调递增计数器。
 *
 * 初始随机种子限制在低 23 位（< 0x800000），预留超过 838 万次连续生成的单秒不回绕空间，
 * 保证同一秒内生成的 ID 在纯字符串比较下严格递增。
 */
let sequenceCounter = (() => {
  const seed = fillRandomBytes(3);
  return ((seed[0]! << 16) | (seed[1]! << 8) | seed[2]!) & 0x7fffff;
})();

/**
 * 生成零数据库驱动依赖的 24 位小写十六进制时间序实体 ID。
 *
 * 编码布局遵循 12 字节 ObjectId 规范：`4B 秒级 Unix 时间戳 + 5B 进程随机熵 + 3B 单调计数器`：
 * - 在 MongoDB 中可直接通过 `new Types.ObjectId(id)` 无损还原；
 * - 在 PostgreSQL 中可作为 `VARCHAR(24)` 存储，天然满足 `_id > cursor` 字典序时间游标分页；
 * - 零 Node 专属模块依赖，前后端同构可用。
 */
export const createEntityId = (timestampMs = Date.now()): string => {
  const timestampSeconds = Math.max(0, Math.floor(timestampMs / 1000)) >>> 0;
  sequenceCounter = (sequenceCounter + 1) & 0xffffff;
  return `${toHex(timestampSeconds, 8)}${PROCESS_ENTROPY_HEX}${toHex(sequenceCounter, 6)}`;
};

/** 判断输入是否为合法的 24 位十六进制实体 ID 字符串。 */
export const isValidEntityId = (value: unknown): value is string =>
  typeof value === 'string' && ENTITY_ID_REGEX.test(value);

/** 将合法的 24 位十六进制实体 ID 规范为小写；其余值原样返回，交由校验或调用方处理。 */
export const normalizeEntityId = (value: string): string =>
  ENTITY_ID_REGEX.test(value) ? value.toLowerCase() : value;

/**
 * 构建支持自动归一化 BSON ObjectId 类对象与可选十六进制大小写的实体 ID Zod Schema。
 *
 * 供 Repository 出口校验、领域模型与 OpenAPI 入参契约统一复用；历史 `ObjectIdSchema` 可关闭
 * `normalizeCase` 以保持大小写透传兼容。
 */
export const createEntityIdSchema = (meta?: {
  example?: string;
  description?: string;
  normalizeCase?: boolean;
}) => {
  const normalizeCase = meta?.normalizeCase ?? true;
  return z.preprocess(
    (value) => {
      const raw =
        value !== null && value !== undefined && typeof value === 'object' ? String(value) : value;
      return normalizeCase && typeof raw === 'string' ? normalizeEntityId(raw) : raw;
    },
    z
      .string()
      .regex(ENTITY_ID_REGEX)
      .meta({
        example: meta?.example ?? DEFAULT_ENTITY_ID_EXAMPLE,
        description: meta?.description ?? '实体 ID'
      })
  );
};

/** 严格字符串实体 ID Schema（`z.input` 与 `z.output` 均为 `string`），用于仓储 Write Schema 严进校验并统一规范为小写 hex。 */
export const EntityIdStringSchema = z
  .string()
  .regex(ENTITY_ID_REGEX)
  .transform(normalizeEntityId)
  .meta({
    example: DEFAULT_ENTITY_ID_EXAMPLE,
    description: '实体 ID'
  });

/** 默认实体 ID Schema（自动将 BSON ObjectId 类对象归一化为纯 string，用于 Read Schema 与接口边界）。 */
export const EntityIdSchema = createEntityIdSchema();
export type EntityId = z.infer<typeof EntityIdSchema>;
