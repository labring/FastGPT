import { describe, expect, it } from 'vitest';
import {
  buildDefaultVariableIdentifier,
  validateVariableIdentifier,
  workflowVariableReservedKeys
} from '@fastgpt/global/core/app/variableIdentifier';

describe('buildDefaultVariableIdentifier', () => {
  it('builds a snake_case identifier from an ascii label', () => {
    expect(buildDefaultVariableIdentifier('Customer Name')).toBe('customer_name');
  });

  it('prefixes identifiers that do not start with a letter', () => {
    expect(buildDefaultVariableIdentifier('1st contact')).toBe('var_1st_contact');
  });

  it('returns a fallback identifier when the label has no valid ascii chars', () => {
    expect(buildDefaultVariableIdentifier('开始日期')).toBe('var');
  });
});

describe('validateVariableIdentifier', () => {
  it('rejects empty identifiers', () => {
    expect(validateVariableIdentifier('')).toEqual({
      valid: false,
      reason: 'required'
    });
  });

  it('rejects invalid characters', () => {
    expect(validateVariableIdentifier('customer-name')).toEqual({
      valid: false,
      reason: 'invalid_format'
    });
  });

  it('rejects system keys', () => {
    expect(
      validateVariableIdentifier(workflowVariableReservedKeys[0], {
        reservedKeys: workflowVariableReservedKeys
      })
    ).toEqual({
      valid: false,
      reason: 'system_conflict'
    });
  });

  it('rejects duplicate keys', () => {
    expect(
      validateVariableIdentifier('customer_name', {
        existingKeys: ['customer_name']
      })
    ).toEqual({
      valid: false,
      reason: 'duplicate'
    });
  });

  it('accepts a valid identifier', () => {
    expect(
      validateVariableIdentifier('customer_name', {
        existingKeys: ['other_key'],
        reservedKeys: workflowVariableReservedKeys
      })
    ).toEqual({
      valid: true
    });
  });
});
