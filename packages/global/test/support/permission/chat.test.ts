import { describe, it, expect } from 'vitest';
import {
  ShareChatAuthSchema,
  TeamChatAuthSchema,
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

    it('should validate object with only shareId', () => {
      const validData = {
        shareId: 'test-share-id'
      };

      const result = ShareChatAuthSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate object with only outLinkUid', () => {
      const validData = {
        outLinkUid: 'test-uid'
      };

      const result = ShareChatAuthSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate empty object', () => {
      const result = ShareChatAuthSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject invalid shareId type', () => {
      const invalidData = {
        shareId: 123
      };

      const result = ShareChatAuthSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid outLinkUid type', () => {
      const invalidData = {
        outLinkUid: true
      };

      const result = ShareChatAuthSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('TeamChatAuthSchema', () => {
    it('should validate valid TeamChatAuth object', () => {
      const validData = {
        teamId: 'test-team-id',
        teamToken: 'test-token'
      };

      const result = TeamChatAuthSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.teamId).toBe('test-team-id');
        expect(result.data.teamToken).toBe('test-token');
      }
    });

    it('should validate object with only teamId', () => {
      const validData = {
        teamId: 'test-team-id'
      };

      const result = TeamChatAuthSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate object with only teamToken', () => {
      const validData = {
        teamToken: 'test-token'
      };

      const result = TeamChatAuthSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate empty object', () => {
      const result = TeamChatAuthSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject invalid teamId type', () => {
      const invalidData = {
        teamId: 123
      };

      const result = TeamChatAuthSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid teamToken type', () => {
      const invalidData = {
        teamToken: false
      };

      const result = TeamChatAuthSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('OutLinkChatAuthSchema', () => {
    it('should validate valid OutLinkChatAuth object with all fields', () => {
      const validData = {
        shareId: 'test-share-id',
        outLinkUid: 'test-uid',
        teamId: 'test-team-id',
        teamToken: 'test-token'
      };

      const result = OutLinkChatAuthSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.shareId).toBe('test-share-id');
        expect(result.data.outLinkUid).toBe('test-uid');
        expect(result.data.teamId).toBe('test-team-id');
        expect(result.data.teamToken).toBe('test-token');
      }
    });

    it('should validate object with share fields only', () => {
      const validData = {
        shareId: 'test-share-id',
        outLinkUid: 'test-uid'
      };

      const result = OutLinkChatAuthSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate object with team fields only', () => {
      const validData = {
        teamId: 'test-team-id',
        teamToken: 'test-token'
      };

      const result = OutLinkChatAuthSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate empty object', () => {
      const result = OutLinkChatAuthSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject invalid field types', () => {
      const invalidData = {
        shareId: 123,
        teamId: true
      };

      const result = OutLinkChatAuthSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate mixed valid and optional fields', () => {
      const validData = {
        shareId: 'test-share-id',
        teamToken: 'test-token'
      };

      const result = OutLinkChatAuthSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });
});
