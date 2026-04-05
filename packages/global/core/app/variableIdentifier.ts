export const VARIABLE_IDENTIFIER_REGEX = /^[A-Za-z][A-Za-z0-9_]{1,49}$/;

export const workflowVariableReservedKeys = [
  'userId',
  'appId',
  'chatId',
  'responseChatItemId',
  'histories',
  'cTime'
] as const;

export type VariableIdentifierValidationReason =
  | 'required'
  | 'invalid_format'
  | 'duplicate'
  | 'system_conflict';

export const buildDefaultVariableIdentifier = (label: string) => {
  const normalized = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  if (!normalized) return 'var';
  if (/^[a-z]/.test(normalized)) return normalized.slice(0, 50);

  return `var_${normalized}`.slice(0, 50);
};

export const validateVariableIdentifier = (
  key: string,
  props?: {
    existingKeys?: string[];
    reservedKeys?: readonly string[];
    currentKey?: string;
  }
):
  | {
      valid: true;
    }
  | {
      valid: false;
      reason: VariableIdentifierValidationReason;
    } => {
  const trimmedKey = key.trim();
  const { existingKeys = [], reservedKeys = [], currentKey } = props || {};

  if (!trimmedKey) {
    return {
      valid: false,
      reason: 'required'
    };
  }

  if (!VARIABLE_IDENTIFIER_REGEX.test(trimmedKey)) {
    return {
      valid: false,
      reason: 'invalid_format'
    };
  }

  if (
    existingKeys.some((existingKey) => existingKey !== currentKey && existingKey === trimmedKey)
  ) {
    return {
      valid: false,
      reason: 'duplicate'
    };
  }

  if (reservedKeys.includes(trimmedKey)) {
    return {
      valid: false,
      reason: 'system_conflict'
    };
  }

  return {
    valid: true
  };
};
