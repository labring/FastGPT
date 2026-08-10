import { Schema } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { defineIndex, getDeprecatedIndexes } from '../../mongodb/indexes';

describe('defineIndex', () => {
  it('adds an active index to the schema', () => {
    const schema = new Schema();
    defineIndex(schema, { key: { username: 1 }, options: { unique: true } });

    expect(schema.indexes()).toEqual([[{ username: 1 }, { unique: true, background: true }]]);
  });

  it('registers a deprecated index without adding it to the schema', () => {
    const schema = new Schema();
    defineIndex(schema, {
      key: { legacy: 1 },
      options: { unique: true, background: true },
      deprecated: true
    });

    expect(schema.indexes()).toEqual([]);
    expect(getDeprecatedIndexes(schema)).toEqual([
      {
        indexName: 'legacy_1',
        key: { legacy: 1 },
        options: {
          unique: true,
          sparse: undefined,
          expireAfterSeconds: undefined,
          partialFilterExpression: undefined,
          collation: undefined
        }
      }
    ]);
  });

  it('supports explicit names and rejects duplicate deprecated indexes', () => {
    const schema = new Schema();
    const definition = {
      key: { legacy: -1 },
      options: { name: 'legacy_custom' },
      deprecated: true
    } as const;
    defineIndex(schema, definition);

    expect(() => defineIndex(schema, definition)).toThrow(
      'Duplicate deprecated MongoDB index declaration: legacy_custom'
    );
  });
});

describe('getDeprecatedIndexes', () => {
  it('returns an empty list for schemas without deprecated declarations', () => {
    expect(getDeprecatedIndexes(new Schema())).toEqual([]);
  });
});
