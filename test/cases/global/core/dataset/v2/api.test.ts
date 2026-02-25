import { describe, it, expect } from 'vitest';
import {
  PresignDatasetFileGetUrlSchema,
  PresignDatasetFilePostUrlSchema,
  ShortPreviewLinkSchema
} from '@fastgpt/global/core/dataset/v2/api';

describe('PresignDatasetFileGetUrlSchema', () => {
  describe('key variant', () => {
    it('should accept valid key starting with "dataset/"', () => {
      const result = PresignDatasetFileGetUrlSchema.safeParse({
        key: 'dataset/test-file.pdf'
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ key: 'dataset/test-file.pdf' });
      }
    });

    it('should accept key with preview option set to true', () => {
      const result = PresignDatasetFileGetUrlSchema.safeParse({
        key: 'dataset/test-file.pdf',
        preview: true
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ key: 'dataset/test-file.pdf', preview: true });
      }
    });

    it('should accept key with preview option set to false', () => {
      const result = PresignDatasetFileGetUrlSchema.safeParse({
        key: 'dataset/test-file.pdf',
        preview: false
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ key: 'dataset/test-file.pdf', preview: false });
      }
    });

    it('should decode URL-encoded key', () => {
      const encodedKey = 'dataset/%E4%B8%AD%E6%96%87%E6%96%87%E4%BB%B6.pdf';
      const result = PresignDatasetFileGetUrlSchema.safeParse({
        key: encodedKey
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ key: 'dataset/中文文件.pdf' });
      }
    });

    it('should reject key not starting with "dataset/"', () => {
      const result = PresignDatasetFileGetUrlSchema.safeParse({
        key: 'other/test-file.pdf'
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Invalid key format: must start with "dataset/"'
        );
      }
    });

    it('should reject empty key', () => {
      const result = PresignDatasetFileGetUrlSchema.safeParse({
        key: ''
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing key field', () => {
      const result = PresignDatasetFileGetUrlSchema.safeParse({
        preview: true
      });
      expect(result.success).toBe(false);
    });
  });

  describe('collectionId variant', () => {
    it('should accept valid collectionId (24 hex characters)', () => {
      const result = PresignDatasetFileGetUrlSchema.safeParse({
        collectionId: '68ee0bd23d17260b7829b137'
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ collectionId: '68ee0bd23d17260b7829b137' });
      }
    });

    it('should accept collectionId as object with toString', () => {
      const objectId = {
        toString: () => '68ee0bd23d17260b7829b137'
      };
      const result = PresignDatasetFileGetUrlSchema.safeParse({
        collectionId: objectId
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ collectionId: '68ee0bd23d17260b7829b137' });
      }
    });

    it('should reject invalid collectionId (wrong length)', () => {
      const result = PresignDatasetFileGetUrlSchema.safeParse({
        collectionId: '123'
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid collectionId (non-hex characters)', () => {
      const result = PresignDatasetFileGetUrlSchema.safeParse({
        collectionId: 'zzzzzzzzzzzzzzzzzzzzzzzz'
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty collectionId', () => {
      const result = PresignDatasetFileGetUrlSchema.safeParse({
        collectionId: ''
      });
      expect(result.success).toBe(false);
    });
  });

  describe('union behavior', () => {
    it('should reject empty object', () => {
      const result = PresignDatasetFileGetUrlSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject object with both key and collectionId', () => {
      // Union will match the first valid variant
      const result = PresignDatasetFileGetUrlSchema.safeParse({
        key: 'dataset/test.pdf',
        collectionId: '68ee0bd23d17260b7829b137'
      });
      // This should succeed because it matches the first variant (key)
      expect(result.success).toBe(true);
    });
  });
});

describe('PresignDatasetFilePostUrlSchema', () => {
  it('should accept valid filename and datasetId', () => {
    const result = PresignDatasetFilePostUrlSchema.safeParse({
      filename: 'test-file.pdf',
      datasetId: '68ee0bd23d17260b7829b137'
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        filename: 'test-file.pdf',
        datasetId: '68ee0bd23d17260b7829b137'
      });
    }
  });

  it('should accept datasetId as object with toString', () => {
    const objectId = {
      toString: () => '68ee0bd23d17260b7829b137'
    };
    const result = PresignDatasetFilePostUrlSchema.safeParse({
      filename: 'test-file.pdf',
      datasetId: objectId
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        filename: 'test-file.pdf',
        datasetId: '68ee0bd23d17260b7829b137'
      });
    }
  });

  it('should accept filename with special characters', () => {
    const result = PresignDatasetFilePostUrlSchema.safeParse({
      filename: '中文文件名.pdf',
      datasetId: '68ee0bd23d17260b7829b137'
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty filename', () => {
    const result = PresignDatasetFilePostUrlSchema.safeParse({
      filename: '',
      datasetId: '68ee0bd23d17260b7829b137'
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing filename', () => {
    const result = PresignDatasetFilePostUrlSchema.safeParse({
      datasetId: '68ee0bd23d17260b7829b137'
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid datasetId', () => {
    const result = PresignDatasetFilePostUrlSchema.safeParse({
      filename: 'test-file.pdf',
      datasetId: 'invalid-id'
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing datasetId', () => {
    const result = PresignDatasetFilePostUrlSchema.safeParse({
      filename: 'test-file.pdf'
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty object', () => {
    const result = PresignDatasetFilePostUrlSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('ShortPreviewLinkSchema', () => {
  it('should accept valid k and transform to chat:temp_file: prefix', () => {
    const result = ShortPreviewLinkSchema.safeParse({
      k: 'test-key'
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ k: 'chat:temp_file:test-key' });
    }
  });

  it('should decode URL-encoded k value', () => {
    const result = ShortPreviewLinkSchema.safeParse({
      k: '%E4%B8%AD%E6%96%87'
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ k: 'chat:temp_file:中文' });
    }
  });

  it('should handle k with special characters', () => {
    const result = ShortPreviewLinkSchema.safeParse({
      k: 'file%2Fpath%2Ftest.pdf'
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ k: 'chat:temp_file:file/path/test.pdf' });
    }
  });

  it('should handle k with spaces encoded as %20', () => {
    const result = ShortPreviewLinkSchema.safeParse({
      k: 'file%20name.pdf'
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ k: 'chat:temp_file:file name.pdf' });
    }
  });

  it('should reject empty k', () => {
    const result = ShortPreviewLinkSchema.safeParse({
      k: ''
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing k field', () => {
    const result = ShortPreviewLinkSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject non-string k value', () => {
    const result = ShortPreviewLinkSchema.safeParse({
      k: 123
    });
    expect(result.success).toBe(false);
  });
});
