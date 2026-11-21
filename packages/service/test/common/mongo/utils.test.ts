import { describe, expect, it } from 'vitest';
import { Types } from '../../../common/mongo';
import { collectUniqueObjectIds, parseObjectId, toObjectIdHex } from '../../../common/mongo/utils';

describe('common/mongo/utils ObjectId helpers', () => {
  const lowerHex = '68ee0bd23d17260b7829b137';
  const upperHex = lowerHex.toUpperCase();
  const secondHex = '68ee0bd23d17260b7829b138';

  it('parses ObjectId instances, 24-char hex strings and cross-realm BSON ObjectIds', () => {
    const instance = new Types.ObjectId(lowerHex);
    expect(parseObjectId(instance)).toBe(instance);

    const parsedLower = parseObjectId(lowerHex);
    expect(parsedLower).toBeInstanceOf(Types.ObjectId);
    expect(parsedLower?.toHexString()).toBe(lowerHex);

    const parsedUpper = parseObjectId(upperHex);
    expect(parsedUpper).toBeInstanceOf(Types.ObjectId);
    expect(parsedUpper?.toHexString()).toBe(lowerHex);

    const crossRealm = { _bsontype: 'ObjectId', toHexString: () => upperHex };
    const parsedCrossRealm = parseObjectId(crossRealm);
    expect(parsedCrossRealm).toBeInstanceOf(Types.ObjectId);
    expect(parsedCrossRealm?.toHexString()).toBe(lowerHex);
  });

  it('rejects BSON numbers, 12-char strings, arrays and arbitrary objects', () => {
    const invalidValues: unknown[] = [
      null,
      undefined,
      '',
      'short-id',
      '123456789012',
      'zzzzzzzzzzzzzzzzzzzzzzzz',
      123,
      0,
      true,
      [lowerHex],
      { toString: () => lowerHex },
      { _bsontype: 'ObjectId', toHexString: () => 'invalid-hex' },
      Object.create(null)
    ];

    for (const invalidValue of invalidValues) {
      expect(parseObjectId(invalidValue)).toBeNull();
      expect(toObjectIdHex(invalidValue)).toBeNull();
    }
  });

  it('normalizes valid values to lowercase hex consistently', () => {
    expect(toObjectIdHex(new Types.ObjectId(lowerHex))).toBe(lowerHex);
    expect(toObjectIdHex(upperHex)).toBe(lowerHex);
    expect(toObjectIdHex({ _bsontype: 'ObjectId', toHexString: () => upperHex })).toBe(lowerHex);
  });

  it('deduplicates across ObjectId and mixed-case hex strings and respects exclude', () => {
    const collected = collectUniqueObjectIds([
      new Types.ObjectId(lowerHex),
      upperHex,
      lowerHex,
      123,
      '123456789012',
      null,
      secondHex
    ]);

    expect(collected.map((item) => item.toHexString())).toEqual([lowerHex, secondHex]);

    const excludedBySet = collectUniqueObjectIds([upperHex, secondHex], {
      exclude: new Set([lowerHex])
    });
    expect(excludedBySet.map((item) => item.toHexString())).toEqual([secondHex]);

    const excludedByMap = collectUniqueObjectIds([lowerHex, secondHex], {
      exclude: new Map([[secondHex, 'cached']])
    });
    expect(excludedByMap.map((item) => item.toHexString())).toEqual([lowerHex]);
  });
});
