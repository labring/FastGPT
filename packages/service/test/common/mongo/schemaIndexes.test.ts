import { describe, expect, it } from 'vitest';
import { Schema } from '@fastgpt/service/common/mongo';
import { defineIndex, getDeprecatedIndexes } from '@fastgpt/service/common/mongo/schemaIndexes';

describe('defineIndex', () => {
  it('returns an empty list for a Schema without declarations', () => {
    expect(getDeprecatedIndexes(new Schema())).toEqual([]);
  });

  it('defaults to an active index and delegates it to the Mongoose Schema', () => {
    const schema = new Schema();
    defineIndex(schema, {
      key: { current: 1 },
      options: { unique: true, name: 'current_unique' }
    });

    expect(schema.indexes()).toEqual([
      [{ current: 1 }, { unique: true, name: 'current_unique', background: true }]
    ]);
    expect(getDeprecatedIndexes(schema)).toEqual([]);
  });

  it('stores deprecated indexes without adding them to the Mongoose Schema', () => {
    const schema = new Schema();
    defineIndex(schema, {
      key: { legacyA: 1 },
      deprecated: true
    });
    defineIndex(schema, {
      key: { teamId: 1, parentId: 1, deleteTime: 1 },
      options: {},
      deprecated: true
    });
    defineIndex(schema, {
      key: { legacyB: -1 },
      options: { name: 'custom_legacy_name', unique: true, background: true },
      deprecated: true
    });

    expect(schema.indexes()).toEqual([]);
    expect(getDeprecatedIndexes(schema)).toEqual([
      {
        indexName: 'legacyA_1',
        key: { legacyA: 1 },
        options: undefined
      },
      {
        indexName: 'teamId_1_parentId_1_deleteTime_1',
        key: { teamId: 1, parentId: 1, deleteTime: 1 },
        options: undefined
      },
      {
        indexName: 'custom_legacy_name',
        key: { legacyB: -1 },
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

  it('rejects duplicate index names within one Schema', () => {
    const schema = new Schema();
    const definition = { key: { legacy: 1 }, deprecated: true } as const;
    defineIndex(schema, definition);

    expect(() => defineIndex(schema, definition)).toThrow(
      'Duplicate deprecated MongoDB index declaration: legacy_1'
    );
  });
});
