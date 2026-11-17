import { describe, expect, it } from 'vitest';
import {
  createEntityId,
  EntityIdSchema,
  EntityIdStringSchema,
  isValidEntityId
} from '@fastgpt/global/common/string/entityId';

describe('entityId utilities', () => {
  describe('createEntityId', () => {
    it('generates valid 24-char lowercase hex IDs', () => {
      const id = createEntityId();
      expect(id).toMatch(/^[0-9a-f]{24}$/);
      expect(isValidEntityId(id)).toBe(true);
    });

    it('preserves strict lexicographical monotonicity within the same second and across seconds', () => {
      const fixedNow = 1_760_000_000_000;
      const batch = Array.from({ length: 200 }, () => createEntityId(fixedNow));
      const uniqueIds = new Set(batch);
      expect(uniqueIds.size).toBe(batch.length);

      const sorted = [...batch].sort((a, b) => a.localeCompare(b));
      expect(batch).toEqual(sorted);

      const laterId = createEntityId(fixedNow + 5_000);
      expect(laterId > batch[batch.length - 1]!).toBe(true);
    });

    it('encodes unix timestamp seconds in the leading 8 hex chars', () => {
      const id = createEntityId(0x68ee0bd2 * 1000);
      expect(id.slice(0, 8)).toBe('68ee0bd2');
    });
  });

  describe('isValidEntityId & EntityIdSchema', () => {
    it('validates strings and normalizes BSON ObjectId-like objects to strings', () => {
      const rawId = createEntityId();
      expect(isValidEntityId(rawId)).toBe(true);
      expect(isValidEntityId(rawId.toUpperCase())).toBe(true);
      expect(isValidEntityId('invalid')).toBe(false);
      expect(isValidEntityId(null)).toBe(false);

      const bsonLike = {
        _bsontype: 'ObjectId',
        toString: () => rawId
      };
      expect(EntityIdSchema.parse(bsonLike)).toBe(rawId);
      expect(typeof EntityIdSchema.parse(bsonLike)).toBe('string');
    });

    it('rejects malformed strings and objects without valid 24-hex toString()', () => {
      expect(EntityIdSchema.safeParse('68ee0bd23d17260b7829b13').success).toBe(false);
      expect(EntityIdSchema.safeParse('68ee0bd23d17260b7829b13g').success).toBe(false);
      expect(EntityIdSchema.safeParse({ id: '68ee0bd23d17260b7829b137' }).success).toBe(false);
      expect(EntityIdStringSchema.safeParse(createEntityId()).success).toBe(true);
      expect(EntityIdStringSchema.safeParse({ toString: () => createEntityId() }).success).toBe(
        false
      );
    });
  });
});
