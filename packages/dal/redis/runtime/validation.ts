import { RedisInvalidArgumentError } from './errors';
import { PositiveSafeIntegerSchema } from './schema';

/** 严格解析正安全整数，并将 Zod issue 映射为稳定、脱敏的 Redis 参数错误。 */
export const parsePositiveInteger = ({
  value,
  operation,
  field,
  maximum
}: {
  value: unknown;
  operation: string;
  field: string;
  maximum?: number;
}): number => {
  const result = PositiveSafeIntegerSchema.safeParse(value);
  if (!result.success || (maximum !== undefined && result.data > maximum)) {
    throw new RedisInvalidArgumentError({
      operation,
      message: `${field} must be a positive safe integer${
        maximum === undefined ? '' : ` no greater than ${maximum}`
      }`
    });
  }

  return result.data;
};

/** 严格解析可选毫秒 TTL；undefined 保持为未设置，不做隐式类型转换。 */
export const parseOptionalTtlMs = ({
  ttlMs,
  operation
}: {
  ttlMs: unknown;
  operation: string;
}): number | undefined => {
  if (ttlMs === undefined) return undefined;
  return parsePositiveInteger({ value: ttlMs, operation, field: 'ttlMs' });
};
