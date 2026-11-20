import { describe, expect, it } from 'vitest';
import { normalizeJsonSchema } from '@fastgpt/global/common/jsonSchema/utils';

describe('normalizeJsonSchema', () => {
  it.each([undefined, null, true, false, 0, 'schema'])(
    'preserves non-object value %s',
    (schema) => {
      expect(normalizeJsonSchema({ schema })).toBe(schema);
    }
  );

  it('merges legacy flags with existing required keys without modifying the original schema', () => {
    const schema = {
      type: 'object',
      required: ['count', 'name', 'count'],
      properties: {
        count: { type: 'number', required: false },
        name: { type: 'string', required: true },
        optional: { type: 'string', required: false },
        profile: {
          type: 'object',
          required: true,
          properties: { email: { type: 'string', required: true } }
        },
        empty: { type: 'object', required: [] }
      }
    };
    const before = structuredClone(schema);

    expect(normalizeJsonSchema({ schema })).toEqual({
      type: 'object',
      required: ['count', 'name', 'profile'],
      properties: {
        count: { type: 'number' },
        name: { type: 'string' },
        optional: { type: 'string' },
        profile: {
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string' } }
        },
        empty: { type: 'object', required: [] }
      }
    });
    expect(schema).toEqual(before);
  });

  it('converts OpenAPI 3.0 boolean exclusive bounds to Draft 7 numeric form', () => {
    const schema = {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 0, exclusiveMinimum: true },
        limit: { type: 'integer', maximum: 10, exclusiveMaximum: true },
        open: { type: 'integer', minimum: 0, exclusiveMinimum: false },
        unbounded: { type: 'integer', exclusiveMinimum: true }
      }
    };
    const before = structuredClone(schema);

    expect(normalizeJsonSchema({ schema })).toEqual({
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 0, exclusiveMinimum: 0 },
        limit: { type: 'integer', maximum: 10, exclusiveMaximum: 10 },
        open: { type: 'integer', minimum: 0 },
        unbounded: { type: 'integer' }
      }
    });
    expect(schema).toEqual(before);
  });

  it('normalizes schema maps and tuple or union branches while preserving literal data', () => {
    const data = { required: true, 'x-internal': true, properties: { name: { required: false } } };
    const legacy = {
      type: 'object',
      properties: { name: { type: 'string', required: true } },
      'x-internal': data
    };
    const normalized = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    };
    const schema = {
      $defs: { 'x-internal': legacy },
      dependencies: { entry: legacy, name: ['entry'] },
      if: legacy,
      then: { items: [legacy, false] },
      else: { anyOf: [true, legacy] },
      properties: {
        'x-internal': { type: 'string', 'x-internal': true },
        literal: { const: data, enum: [data], default: data, examples: [data] }
      },
      'x-internal': data
    };
    const before = structuredClone(schema);

    expect(normalizeJsonSchema({ schema, omitKeys: new Set(['x-internal']) })).toEqual({
      $defs: { 'x-internal': normalized },
      dependencies: { entry: normalized, name: ['entry'] },
      if: normalized,
      then: { items: [normalized, false] },
      else: { anyOf: [true, normalized] },
      properties: {
        'x-internal': { type: 'string' },
        literal: { const: data, enum: [data], default: data, examples: [data] }
      }
    });
    expect(schema).toEqual(before);
  });
});
