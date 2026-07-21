import { RedisInvalidArgumentError } from './errors';

export const assertNonEmptyString = ({
  value,
  operation,
  field
}: {
  value: unknown;
  operation: string;
  field: string;
}): void => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new RedisInvalidArgumentError({
      operation,
      message: `${field} must be a non-empty string`
    });
  }
};

export const assertPositiveInteger = ({
  value,
  operation,
  field,
  maximum
}: {
  value: unknown;
  operation: string;
  field: string;
  maximum?: number;
}): void => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    (maximum !== undefined && value > maximum)
  ) {
    throw new RedisInvalidArgumentError({
      operation,
      message: `${field} must be a positive safe integer${
        maximum === undefined ? '' : ` no greater than ${maximum}`
      }`
    });
  }
};

export const assertFiniteNumber = ({
  value,
  operation,
  field
}: {
  value: unknown;
  operation: string;
  field: string;
}): void => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RedisInvalidArgumentError({
      operation,
      message: `${field} must be a finite number`
    });
  }
};

export const assertOptionalTtlMs = ({
  ttlMs,
  operation
}: {
  ttlMs: unknown;
  operation: string;
}): void => {
  if (ttlMs !== undefined) {
    assertPositiveInteger({ value: ttlMs, operation, field: 'ttlMs' });
  }
};
