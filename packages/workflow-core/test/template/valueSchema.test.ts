import { getAutomationMeta } from '@fastgpt/global/core/workflow/template/automationMeta';
import { valueMatchesSchema } from '../../src/template/valueSchema';
import { describe, expect, it } from 'vitest';

describe('valueMatchesSchema', () => {
  it('honors boolean schema branches and properties in tool input contracts', () => {
    expect(valueMatchesSchema('anything', true)).toBe(true);
    expect(valueMatchesSchema('anything', false)).toBe(false);
    const schema = {
      oneOf: [
        false,
        { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
      ]
    };
    expect(valueMatchesSchema({ name: 'Alice' }, schema)).toBe(true);
    expect(valueMatchesSchema({}, schema)).toBe(false);
    expect(
      valueMatchesSchema({ name: 'Alice' }, { type: 'object', properties: { name: false } })
    ).toBe(false);
  });

  it.each([true, false])(
    'treats legacy boolean required as an input flag, not an object-key list: %s',
    (required) => {
      expect(
        valueMatchesSchema(
          { name: 'Alice' },
          {
            type: 'object',
            required,
            properties: { name: { type: 'string' } }
          }
        )
      ).toBe(true);
      expect(
        valueMatchesSchema(
          { name: 1 },
          {
            type: 'object',
            required,
            properties: { name: { type: 'string' } }
          }
        )
      ).toBe(false);
    }
  );

  it('recognizes pattern properties before applying additional-property constraints', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      patternProperties: { '^value_': { type: 'number' }, _count$: { minimum: 0 } },
      additionalProperties: false
    };
    expect(valueMatchesSchema({ name: 'Alice', value_count: 1 }, schema)).toBe(true);
    expect(valueMatchesSchema({ value_count: -1 }, schema)).toBe(false);
    expect(valueMatchesSchema({ value_count: 'one' }, schema)).toBe(false);
    expect(valueMatchesSchema({ unknown: 1 }, schema)).toBe(false);
    expect(
      valueMatchesSchema(
        { name: 'Alice' },
        { ...schema, patternProperties: { '^name$': { minLength: 10 } } }
      )
    ).toBe(false);
    const additionalSchema = {
      type: 'object',
      patternProperties: { '^label_': { type: 'string' } },
      additionalProperties: { type: 'number' }
    };
    expect(valueMatchesSchema({ label_name: 'Alice', count: 0 }, additionalSchema)).toBe(true);
    expect(valueMatchesSchema({ label_name: 'Alice', count: 'zero' }, additionalSchema)).toBe(
      false
    );
  });

  it('validates nested objects, arrays and scalar constraints', () => {
    const schema = {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      uniqueItems: true,
      items: {
        type: 'object',
        required: ['key', 'score'],
        additionalProperties: false,
        properties: {
          key: { type: 'string', minLength: 2, maxLength: 5, pattern: '^[a-z]+$' },
          score: { type: 'number', minimum: 0, maximum: 1 }
        }
      }
    };

    expect(valueMatchesSchema([{ key: 'ok', score: 0.5 }], schema)).toBe(true);
    expect(valueMatchesSchema([], schema)).toBe(false);
    expect(valueMatchesSchema([{ key: 'A', score: 2 }], schema)).toBe(false);
    expect(valueMatchesSchema([{ key: 'ok', score: 0.5, extra: true }], schema)).toBe(false);
    expect(
      valueMatchesSchema(
        [
          { key: 'ok', score: 0.5 },
          { key: 'ok', score: 0.5 }
        ],
        schema
      )
    ).toBe(false);
  });

  it('validates unions, constants, tuples and additional property schemas', () => {
    expect(valueMatchesSchema('x', { anyOf: [{ type: 'string' }, { type: 'number' }] })).toBe(true);
    expect(valueMatchesSchema(true, { oneOf: [{ type: 'boolean' }, { const: true }] })).toBe(false);
    expect(valueMatchesSchema(2, { allOf: [{ type: 'integer' }, { minimum: 1 }] })).toBe(true);
    expect(valueMatchesSchema('blocked', { not: { const: 'blocked' } })).toBe(false);
    expect(
      valueMatchesSchema(['node', 'output'], {
        type: 'array',
        prefixItems: [{ type: 'string' }, { type: 'string' }],
        items: false
      })
    ).toBe(true);
    expect(
      valueMatchesSchema(['node', 'output', 'extra'], {
        type: 'array',
        prefixItems: [{ type: 'string' }, { type: 'string' }],
        items: false
      })
    ).toBe(false);
    expect(
      valueMatchesSchema(
        { known: 'x', extra: 1 },
        {
          type: 'object',
          properties: { known: { type: 'string' } },
          additionalProperties: { type: 'integer' }
        }
      )
    ).toBe(true);
  });

  it('validates the complete branching, form and variable-update contracts', () => {
    const getInputSchema = (templateId: string, inputKey: string) =>
      getAutomationMeta(`builtin:${templateId}`)?.inputs?.[inputKey]?.valueSchema as Record<
        string,
        unknown
      >;

    const ifElseSchema = getInputSchema('if-else', 'ifElseList');
    expect(
      valueMatchesSchema(
        [
          {
            branchId: 'matched',
            condition: 'AND',
            list: [
              {
                variable: ['start', 'userChatInput'],
                condition: 'equalTo',
                value: ['', 'hello'],
                valueType: 'input'
              }
            ]
          }
        ],
        ifElseSchema
      )
    ).toBe(true);
    expect(
      valueMatchesSchema([{ condition: 'XOR', list: [{ condition: 'unknown' }] }], ifElseSchema)
    ).toBe(false);

    const formSchema = getInputSchema('form-input', 'userInputForms');
    expect(
      valueMatchesSchema(
        [
          {
            type: 'input',
            key: 'name',
            label: 'Name',
            value: '',
            valueType: 'string',
            required: true
          }
        ],
        formSchema
      )
    ).toBe(true);
    expect(valueMatchesSchema([{ key: 'name' }], formSchema)).toBe(false);

    const updateSchema = getInputSchema('variable-update', 'updateList');
    expect(
      valueMatchesSchema(
        [
          {
            variable: ['globalVariable', 'answer'],
            value: ['', 'done'],
            valueType: 'string',
            renderType: 'input'
          }
        ],
        updateSchema
      )
    ).toBe(true);
    expect(valueMatchesSchema([{ renderType: 'textarea' }], updateSchema)).toBe(false);
  });
});
