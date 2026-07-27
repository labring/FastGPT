import { getAutomationMeta, parseNodeTemplateRef, valueMatchesSchema } from '../../src';
import { describe, expect, it } from 'vitest';

describe('valueMatchesSchema', () => {
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
      getAutomationMeta(parseNodeTemplateRef(`builtin:${templateId}`))?.inputs?.[inputKey]
        ?.valueSchema as Record<string, unknown>;

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
