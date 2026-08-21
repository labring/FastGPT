import { RedisInvalidResponseError } from './errors';
import type { RedisStreamEntry } from '../types';

/** 从 Redis INFO 文本中读取非负整数；字段缺失或格式不匹配时返回 undefined。 */
export const parseRedisInfoNumber = (info: string, key: string) => {
  const match = info.match(new RegExp(`(?:^|\\r?\\n)${key}:(\\d+)`));
  if (!match) return undefined;

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
};

/** 校验并解析 Redis Stream 返回的交替 field/value 数组。 */
export const parseStreamFields = ({
  operation,
  rawFields
}: {
  operation: string;
  rawFields: unknown;
}): Record<string, string> => {
  if (
    !Array.isArray(rawFields) ||
    rawFields.length % 2 !== 0 ||
    rawFields.some((field) => typeof field !== 'string')
  ) {
    throw new RedisInvalidResponseError({
      operation,
      message: 'Redis Stream fields returned an unsupported response'
    });
  }

  const fields: Record<string, string> = {};
  for (let index = 0; index < rawFields.length; index += 2) {
    fields[rawFields[index] as string] = rawFields[index + 1] as string;
  }
  return fields;
};

/** 校验并解析 XRANGE/XREAD 返回的 Stream entry 列表。 */
export const parseStreamEntries = ({
  operation,
  rawEntries
}: {
  operation: string;
  rawEntries: unknown;
}): RedisStreamEntry[] => {
  if (!Array.isArray(rawEntries)) {
    throw new RedisInvalidResponseError({
      operation,
      message: 'Redis Stream entries returned an unsupported response'
    });
  }

  return rawEntries.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
      throw new RedisInvalidResponseError({
        operation,
        message: 'Redis Stream entry returned an unsupported response'
      });
    }

    return {
      id: entry[0],
      fields: parseStreamFields({ operation, rawFields: entry[1] })
    };
  });
};
