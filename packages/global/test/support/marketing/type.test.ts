import { describe, expect, it } from 'vitest';
import { VisitorIdSchema } from '@fastgpt/global/support/marketing/type';

describe('VisitorIdSchema', () => {
  it('accepts and trims homepage visitor ids', () => {
    expect(VisitorIdSchema.parse(' 550e8400-e29b-41d4-a716-446655440000 ')).toBe(
      '550e8400-e29b-41d4-a716-446655440000'
    );
    expect(VisitorIdSchema.parse('fg_m1_test_123')).toBe('fg_m1_test_123');
  });

  it('rejects empty, oversized, and unsupported visitor ids', () => {
    expect(VisitorIdSchema.safeParse('  ').success).toBe(false);
    expect(VisitorIdSchema.safeParse('a'.repeat(65)).success).toBe(false);
    expect(VisitorIdSchema.safeParse('visitor/with/path').success).toBe(false);
  });
});
