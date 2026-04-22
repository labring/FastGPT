import { describe, expect, it } from 'vitest';
import {
  HelperBotTypeEnum,
  HelperBotTypeEnumSchema,
  HelperBotChatSchema,
  HelperBotChatItemSchema,
  HelperBotChatItemSiteSchema,
  AIChatItemValueItemSchema
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

describe('AIChatItemValueItemSchema', () => {
  it('should validate text content', () => {
    const result = AIChatItemValueItemSchema.safeParse({
      text: { content: 'Hello' }
    });
    expect(result.success).toBe(true);
  });

  it('should validate reasoning content', () => {
    const result = AIChatItemValueItemSchema.safeParse({
      reasoning: { content: 'Let me think...' }
    });
    expect(result.success).toBe(true);
  });

  it('should validate planHint', () => {
    const result = AIChatItemValueItemSchema.safeParse({
      planHint: { type: 'generation' }
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid planHint type', () => {
    const result = AIChatItemValueItemSchema.safeParse({
      planHint: { type: 'invalid' }
    });
    expect(result.success).toBe(false);
  });
});
