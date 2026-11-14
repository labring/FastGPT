import { describe, expect, it } from 'vitest';
import { AgentToolSchema } from '@fastgpt/global/core/app/tool/type';
import { CanonicalSelectedAgentToolSchema } from '@fastgpt/global/core/workflow/migration/schema';
import { createSchema } from 'zod-openapi';

describe.each([
  { name: 'AgentToolSchema', schema: AgentToolSchema.shape.config },
  {
    name: 'CanonicalSelectedAgentToolSchema',
    schema: CanonicalSelectedAgentToolSchema.shape.config
  }
])('$name config', ({ schema }) => {
  it.each(['fixed', '', 0, false, null, { nested: 'business value' }])(
    'preserves constructor as an ordinary fixed parameter: %j',
    (value) => {
      const config = { constructor: value, toString: 'fixed string', hasOwnProperty: false };
      const result = schema.parse(config);

      expect(result).toEqual(config);
      expect(result).not.toBe(config);
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(Object.hasOwn(result, 'constructor')).toBe(true);
    }
  );

  it.each([
    undefined,
    null,
    [],
    'config',
    1,
    false,
    new Date(),
    new Map(),
    new (class Config {})()
  ])('rejects a non-dictionary input: %j', (value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it('accepts null-prototype dictionaries without adding inherited fields', () => {
    const config = Object.assign(Object.create(null), { constructor: 'fixed', query: '' });

    expect(schema.parse(config)).toEqual({ constructor: 'fixed', query: '' });
    expect(schema.parse({})).toEqual({});
    expect(Object.hasOwn(schema.parse({}), 'constructor')).toBe(false);
  });

  it('keeps the existing __proto__ exclusion without changing either prototype', () => {
    const config = JSON.parse('{"__proto__":{"polluted":true},"constructor":"fixed","query":0}');
    const result = schema.parse(config);

    expect(result).toEqual({ constructor: 'fixed', query: 0 });
    expect(Object.hasOwn(result, '__proto__')).toBe(false);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(config)).toBe(Object.prototype);
    expect(Object.hasOwn(config, '__proto__')).toBe(true);
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });

  it('rejects symbol keys instead of silently accepting non-JSON configuration', () => {
    expect(schema.safeParse({ [Symbol('config')]: true }).success).toBe(false);
  });

  it.each(['input', 'output'] as const)('keeps an open-object OpenAPI contract for %s', (io) => {
    expect(createSchema(schema, { io }).schema).toMatchObject({
      type: 'object',
      additionalProperties: {}
    });
  });
});
