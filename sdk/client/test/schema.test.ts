import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { requiredAlternatives } from '@fastgpt/global/common/zod/openapi';
import { jsonSchema, renderType } from '../scripts/schema';

describe('standalone SDK contract generation', () => {
  it('preserves required object identifiers, optional defaults, and JSON dates', () => {
    const schema = z.object({
      id: ObjectIdSchema,
      date: z.coerce.date(),
      pageSize: z.number().default(20)
    });
    const input = jsonSchema(schema, 'input');
    expect(input.required).toContain('id');
    expect(input.required).not.toContain('pageSize');
    expect(renderType(input)).toContain('"id": string');
    expect(renderType(jsonSchema(schema, 'output'))).toContain('"date": string');
  });

  it('applies shared OpenAPI required alternatives without discarding object properties', () => {
    const schema = z
      .object({
        tmbId: ObjectIdSchema.optional(),
        groupId: ObjectIdSchema.optional(),
        permission: z.number()
      })
      .meta(requiredAlternatives([['tmbId'], ['groupId']], true));
    const input = jsonSchema(schema, 'input');
    expect(input.oneOf).toEqual([{ required: ['tmbId'] }, { required: ['groupId'] }]);
    const type = renderType(input);
    expect(type).toContain('"tmbId": string');
    expect(type).toContain('"groupId"?: never');
    expect(type).toContain('"permission": number');
  });

  it('handles references, literals, arrays, tuples, nullable values and intersections', () => {
    expect(renderType({ $ref: '#/$defs/id', $defs: { id: { type: 'string' } } })).toBe('string');
    expect(() => renderType({ $ref: '#/$defs/missing' })).toThrow('Unresolved');
    expect(renderType({ const: false })).toBe('false');
    expect(renderType({ enum: ['a', 'b'] })).toBe('"a" | "b"');
    expect(renderType({ type: ['string', 'null'] })).toBe('string | null');
    expect(renderType({ type: 'array', items: { type: 'integer' } })).toBe('Array<number>');
    expect(
      renderType({ type: 'array', prefixItems: [{ type: 'string' }, { type: 'boolean' }] })
    ).toBe('[string, boolean]');
    expect(renderType({ allOf: [{ type: 'string' }, { const: 'value' }] })).toBe(
      '(string) & ("value")'
    );
    expect(renderType({ type: 'object', additionalProperties: { type: 'number' } })).toContain(
      '[key: string]: number'
    );
    expect(renderType({ type: 'object', additionalProperties: true })).toContain(
      '[key: string]: unknown'
    );
    expect(renderType({})).toBe('unknown');
    expect(renderType({ type: 'object' })).toBe('Record<string, unknown>');
    expect(renderType(true)).toBe('unknown');
    expect(renderType(false)).toBe('never');
  });
});
