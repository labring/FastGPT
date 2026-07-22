export class NoSuchBucketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoSuchBucketError';
  }
}

export class NoBucketReadPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoBucketReadPermissionError';
  }
}

export class EmptyObjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmptyObjectError';
  }
}

export type InvalidStorageObjectKeyReason =
  | 'invalid_type'
  | 'empty'
  | 'invalid_unicode'
  | 'too_long'
  | 'leading_slash'
  | 'backslash'
  | 'empty_path_segment'
  | 'dot_path_segment'
  | 'control_character';

const invalidStorageObjectKeyReasonMessages: Record<InvalidStorageObjectKeyReason, string> = {
  invalid_type: 'must be a string',
  empty: 'must not be empty',
  invalid_unicode: 'must contain well-formed Unicode',
  too_long: 'exceeds the UTF-8 byte limit',
  leading_slash: 'must not start with a slash',
  backslash: 'must not contain a backslash',
  empty_path_segment: 'must not contain consecutive slashes',
  dot_path_segment: 'must not contain dot path segments',
  control_character: 'must not contain ASCII control characters'
};

/** SDK 在远端请求前发现对象 key 或 prefix 不符合统一可移植规范。 */
export class InvalidStorageObjectKeyError extends Error {
  readonly field: string;
  readonly reason: InvalidStorageObjectKeyReason;
  readonly actualBytes?: number;
  readonly maxBytes?: number;

  constructor({
    field,
    reason,
    actualBytes,
    maxBytes
  }: {
    field: string;
    reason: InvalidStorageObjectKeyReason;
    actualBytes?: number;
    maxBytes?: number;
  }) {
    const byteDetails =
      actualBytes !== undefined && maxBytes !== undefined
        ? ` (${actualBytes} bytes, maximum ${maxBytes})`
        : '';
    super(
      `Invalid storage object ${field}: ${invalidStorageObjectKeyReasonMessages[reason]}${byteDetails}`
    );
    this.name = 'InvalidStorageObjectKeyError';
    this.field = field;
    this.reason = reason;
    this.actualBytes = actualBytes;
    this.maxBytes = maxBytes;
  }
}
