import { describe, it, expect } from 'vitest';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';

describe('mongo type tests', () => {
  describe('ObjectIdSchema', () => {
    describe('valid ObjectId', () => {
      it('should accept valid 24-character hex string', () => {
        const validIds = [
          '507f1f77bcf86cd799439011',
          '68ee0bd23d17260b7829b137',
          'abcdef1234567890abcdef12',
          'ABCDEF1234567890ABCDEF12',
          '000000000000000000000000',
          'ffffffffffffffffffffffff'
        ];

        validIds.forEach((id) => {
          const result = ObjectIdSchema.safeParse(id);
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data).toBe(id);
          }
        });
      });

      it('should accept mixed case hex string', () => {
        const mixedCaseId = '1a2B3c4D5e6F7890aBcDeF12';
        const result = ObjectIdSchema.safeParse(mixedCaseId);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(mixedCaseId);
        }
      });

      it('should convert object with toString method to string', () => {
        const objectId = {
          toString: () => '507f1f77bcf86cd799439011'
        };

        const result = ObjectIdSchema.safeParse(objectId);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe('507f1f77bcf86cd799439011');
        }
      });

      it('should handle MongoDB ObjectId-like objects', () => {
        // Simulate MongoDB ObjectId object
        const mongoObjectId = {
          id: '507f1f77bcf86cd799439011',
          toString: function () {
            return this.id;
          },
          toHexString: function () {
            return this.id;
          }
        };

        const result = ObjectIdSchema.safeParse(mongoObjectId);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe('507f1f77bcf86cd799439011');
        }
      });
    });

    describe('invalid ObjectId', () => {
      it('should reject strings with invalid length', () => {
        const invalidLengths = [
          '507f1f77bcf86cd79943901', // 23 characters
          '507f1f77bcf86cd7994390111', // 25 characters
          '507f1f77bcf86cd799', // too short
          '' // empty string
        ];

        invalidLengths.forEach((id) => {
          const result = ObjectIdSchema.safeParse(id);
          expect(result.success).toBe(false);
        });
      });

      it('should reject strings with non-hex characters', () => {
        const invalidChars = [
          '507f1f77bcf86cd79943901g', // contains 'g'
          '507f1f77bcf86cd79943901z', // contains 'z'
          '507f1f77bcf86cd79943901!', // contains '!'
          '507f1f77bcf86cd79943901 ', // contains space
          '507f1f77bcf86cd79943901-', // contains dash
          '507f1f77bcf86cd79943901_' // contains underscore
        ];

        invalidChars.forEach((id) => {
          const result = ObjectIdSchema.safeParse(id);
          expect(result.success).toBe(false);
        });
      });

      it('should reject non-string types', () => {
        const invalidTypes = [
          123,
          true,
          false,
          null,
          undefined,
          [],
          { id: '507f1f77bcf86cd799439011' } // object without toString returning valid ObjectId
        ];

        invalidTypes.forEach((value) => {
          const result = ObjectIdSchema.safeParse(value);
          expect(result.success).toBe(false);
        });
      });

      it('should reject strings with special characters', () => {
        const specialChars = [
          '507f1f77bcf86cd799439011\n',
          '\t507f1f77bcf86cd799439011',
          '507f1f77 bcf86cd799439011'
        ];

        specialChars.forEach((id) => {
          const result = ObjectIdSchema.safeParse(id);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('schema metadata', () => {
      it('should have correct metadata', () => {
        const schema = ObjectIdSchema._def;
        // Check if schema has metadata
        expect(schema).toBeDefined();
      });
    });

    describe('edge cases', () => {
      it('should handle object with toString returning invalid ObjectId', () => {
        const invalidObject = {
          toString: () => 'invalid-id'
        };

        const result = ObjectIdSchema.safeParse(invalidObject);
        expect(result.success).toBe(false);
      });

      it('should handle object with toString returning correct length but invalid characters', () => {
        const invalidObject = {
          toString: () => 'gggggggggggggggggggggggg' // 24 chars but not hex
        };

        const result = ObjectIdSchema.safeParse(invalidObject);
        expect(result.success).toBe(false);
      });

      it('should handle object with non-string toString result', () => {
        const invalidObject = {
          toString: () => 123
        };

        const result = ObjectIdSchema.safeParse(invalidObject);
        expect(result.success).toBe(false);
      });
    });

    describe('parse vs safeParse', () => {
      it('should throw error with parse() for invalid ObjectId', () => {
        expect(() => {
          ObjectIdSchema.parse('invalid-id');
        }).toThrow();
      });

      it('should not throw error with safeParse() for invalid ObjectId', () => {
        expect(() => {
          ObjectIdSchema.safeParse('invalid-id');
        }).not.toThrow();
      });

      it('should return parsed value with parse() for valid ObjectId', () => {
        const validId = '507f1f77bcf86cd799439011';
        const result = ObjectIdSchema.parse(validId);
        expect(result).toBe(validId);
      });
    });
  });
});
