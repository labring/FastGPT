import { describe, expect, it } from 'vitest';
import {
  HelperBotTypeEnum,
  HelperBotTypeEnumSchema
} from '@fastgpt/global/core/chat/helperBot/type';

describe('HelperBotTypeEnum', () => {
  it('should have correct enum values', () => {
    expect(HelperBotTypeEnum.topAgent).toBe('topAgent');
  });

  it('should have all expected types', () => {
    const types = Object.values(HelperBotTypeEnum);
    expect(types).toHaveLength(1);
    expect(types).toContain('topAgent');
  });
});

describe('HelperBotTypeEnumSchema', () => {
  it('should validate valid enum values', () => {
    const result = HelperBotTypeEnumSchema.safeParse('topAgent');
    expect(result.success).toBe(true);
  });

  it('should reject invalid enum values', () => {
    const result = HelperBotTypeEnumSchema.safeParse('invalid');
    expect(result.success).toBe(false);
  });
});
