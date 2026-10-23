import { describe, expect, it } from 'vitest';
import {
  ReferenceValueSchema,
  SecretValueTypeSchema,
  StoreSecretValueTypeSchema
} from '@fastgpt/global/common/secret/type';

describe('secret value schemas', () => {
  it('accepts single and array references', () => {
    expect(ReferenceValueSchema.safeParse(['node-1', 'token']).success).toBe(true);
    expect(
      ReferenceValueSchema.safeParse([
        ['node-1', 'token'],
        ['node-2', 'token']
      ]).success
    ).toBe(true);
  });

  it('rejects empty, incomplete, and non-string references', () => {
    expect(ReferenceValueSchema.safeParse([]).success).toBe(false);
    expect(ReferenceValueSchema.safeParse(['node-1']).success).toBe(false);
    expect(ReferenceValueSchema.safeParse(['', 'token']).success).toBe(false);
    expect(ReferenceValueSchema.safeParse(['node-1', '']).success).toBe(false);
    expect(ReferenceValueSchema.safeParse([['node-1', '']]).success).toBe(false);
    expect(ReferenceValueSchema.safeParse([['node-1', 1]]).success).toBe(false);
  });

  it('keeps static and reference branches strict', () => {
    expect(SecretValueTypeSchema.safeParse({ value: 'token', extra: true }).success).toBe(false);
    expect(SecretValueTypeSchema.safeParse({ value: 'token', secret: 'cipher' }).success).toBe(
      false
    );
    expect(SecretValueTypeSchema.safeParse({ value: 'token' }).success).toBe(true);
    expect(SecretValueTypeSchema.safeParse({ secret: 'cipher' }).success).toBe(true);
    expect(SecretValueTypeSchema.safeParse({ ref: ['node-1', 'token'] }).success).toBe(true);
    expect(
      SecretValueTypeSchema.safeParse({ ref: ['node-1', 'token'], value: 'token' }).success
    ).toBe(false);
    expect(
      StoreSecretValueTypeSchema.safeParse({
        Authorization: { ref: ['node-1', 'token'] }
      }).success
    ).toBe(true);
  });
});
