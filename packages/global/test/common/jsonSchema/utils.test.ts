import { describe, expect, it } from 'vitest';
import {
  normalizeJsonSchema,
  sanitizeToolParametersForModel
} from '@fastgpt/global/common/jsonSchema/utils';

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

const isRecordLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isEmptyObjectSchema = (
  value: unknown
): value is { type: 'object'; properties: Record<string, unknown> } => {
  if (!isRecordLike(value)) return false;
  const { type, properties } = value;
  return type === 'object' && isRecordLike(properties);
};

describe('sanitizeToolParametersForModel', () => {
  it('falls back to an empty object schema for zero-parameter tools', () => {
    expect(sanitizeToolParametersForModel(undefined)).toEqual({ type: 'object', properties: {} });
    expect(sanitizeToolParametersForModel(null)).toEqual({ type: 'object', properties: {} });
  });

  it('keeps an existing parameters schema unchanged', () => {
    const schema = {
      type: 'object',
      properties: { query: { type: 'string', required: true } }
    };
    expect(sanitizeToolParametersForModel(schema)).toEqual({
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    });
  });

  it('returns an isolated schema object for each zero-parameter tool', () => {
    const first = sanitizeToolParametersForModel(undefined);
    const second = sanitizeToolParametersForModel(undefined);

    // 用类型守卫收窄 unknown，不依赖类型断言
    if (!isEmptyObjectSchema(first) || !isEmptyObjectSchema(second)) {
      throw new Error('expected empty object schema');
    }

    expect(first).not.toBe(second);
    expect(first.properties).not.toBe(second.properties);

    // 调用方修改返回值不能污染后续调用
    first.properties.added = { type: 'string' };
    const third = sanitizeToolParametersForModel(undefined);
    expect(isEmptyObjectSchema(third)).toBe(true);
    expect(third).toEqual({ type: 'object', properties: {} });
  });
});
