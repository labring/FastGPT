import { describe, it, expect } from 'vitest';
import {
  ShareChatAuthSchema,
  OutLinkChatAuthSchema
} from '@fastgpt/global/support/permission/chat';

describe('permission/chat', () => {
  describe('ShareChatAuthSchema', () => {
    it('should validate valid ShareChatAuth object', () => {
      const validData = {
        shareId: 'test-share-id',
        outLinkUid: 'test-uid'
      };

      const result = ShareChatAuthSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.shareId).toBe('test-share-id');
        expect(result.data.outLinkUid).toBe('test-uid');
      }
    });

    it('should reject object with only shareId', () => {
      const validData = {
        shareId: 'test-share-id'
      };

      const result = ShareChatAuthSchema.safeParse(validData);
      expect(result.success).toBe(false);
    });

    it('should reject object with only outLinkUid', () => {
      const validData = {
        outLinkUid: 'test-uid'
      };

      const result = ShareChatAuthSchema.safeParse(validData);
      expect(result.success).toBe(false);
    });

    it('should reject empty object', () => {
      const result = ShareChatAuthSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it.each([
      { shareId: '', outLinkUid: 'test-uid' },
      { shareId: 'test-share-id', outLinkUid: '' }
    ])('should reject empty auth fields: %j', (value) => {
      expect(ShareChatAuthSchema.safeParse(value).success).toBe(false);
    });

    it('should reject invalid shareId type', () => {
      const invalidData = {
        shareId: 123,
        outLinkUid: 'test-uid'
      };

      const result = ShareChatAuthSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid outLinkUid type', () => {
      const invalidData = {
        shareId: 'test-share-id',
        outLinkUid: true
      };

      const result = ShareChatAuthSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('OutLinkChatAuthSchema', () => {
    it('should validate valid OutLinkChatAuth object with share fields', () => {
      const validData = {
        shareId: 'test-share-id',
        outLinkUid: 'test-uid'
      };

      const result = OutLinkChatAuthSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.shareId).toBe('test-share-id');
        expect(result.data.outLinkUid).toBe('test-uid');
      }
    });

    it('should reject empty object', () => {
      const result = OutLinkChatAuthSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should parse JSON string and return an auth object', () => {
      const result = OutLinkChatAuthSchema.safeParse(
        JSON.stringify({
          shareId: 'test-share-id',
          outLinkUid: 'test-uid'
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          shareId: 'test-share-id',
          outLinkUid: 'test-uid'
        });
      }
    });

    it.each([
      {},
      { shareId: 'test-share-id' },
      { outLinkUid: 'test-uid' },
      { shareId: '', outLinkUid: 'test-uid' },
      { shareId: 'test-share-id', outLinkUid: '' }
    ])('should reject JSON string with missing or empty auth fields: %j', (value) => {
      expect(OutLinkChatAuthSchema.safeParse(JSON.stringify(value)).success).toBe(false);
    });

    it('should reject invalid field types', () => {
      const invalidData = {
        shareId: 123,
        outLinkUid: 'test-uid'
      };

      const result = OutLinkChatAuthSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid JSON string', () => {
      const result = OutLinkChatAuthSchema.safeParse('{invalid-json');
      expect(result.success).toBe(false);
    });
  });
});
