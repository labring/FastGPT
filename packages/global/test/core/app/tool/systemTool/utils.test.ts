import { describe, expect, it } from 'vitest';
import { stripUnsetOptionalToolInputs } from '@fastgpt/global/core/app/tool/systemTool/utils';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';

describe('stripUnsetOptionalToolInputs', () => {
  it('passes input through unchanged when inputSchema or properties is missing', () => {
    const input = { count: null, text: '', flag: undefined };

    expect(stripUnsetOptionalToolInputs({ input })).toEqual(input);
    expect(
      stripUnsetOptionalToolInputs({
        input,
        inputSchema: { type: 'object' }
      })
    ).toEqual(input);
  });

  it('keeps null and empty string on required fields', () => {
    const inputSchema: JSONSchemaInputType = {
      type: 'object',
      properties: {
        requiredText: { type: 'string' },
        requiredNumber: { type: 'number' }
      },
      required: ['requiredText', 'requiredNumber']
    };

    expect(
      stripUnsetOptionalToolInputs({
        input: {
          requiredText: null,
          requiredNumber: ''
        },
        inputSchema
      })
    ).toEqual({
      requiredText: null,
      requiredNumber: ''
    });
  });

  it('drops null and undefined on optional non-nullable fields while keeping 0 and false', () => {
    const inputSchema: JSONSchemaInputType = {
      type: 'object',
      properties: {
        count: { type: 'number' },
        zeroCount: { type: 'number' },
        enabled: { type: 'boolean' },
        disabled: { type: 'boolean' },
        text: { type: 'string' },
        omitMe: { type: 'string' }
      }
    };

    expect(
      stripUnsetOptionalToolInputs({
        input: {
          count: null,
          zeroCount: 0,
          enabled: null,
          disabled: false,
          text: null,
          omitMe: undefined
        },
        inputSchema
      })
    ).toEqual({
      zeroCount: 0,
      disabled: false
    });
  });

  it('drops empty string only when declared type does not allow string', () => {
    const inputSchema: JSONSchemaInputType = {
      type: 'object',
      properties: {
        optionalText: { type: 'string' },
        optionalNumber: { type: 'number' },
        optionalInt: { type: 'integer' },
        optionalBool: { type: 'boolean' },
        optionalObj: { type: 'object' },
        optionalArr: { type: 'array' },
        nullableNumber: { type: ['number', 'null'] },
        nullableText: { type: ['string', 'null'] },
        unionNumber: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        unionMixed: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        untyped: {}
      }
    };

    expect(
      stripUnsetOptionalToolInputs({
        input: {
          optionalText: '',
          optionalNumber: '',
          optionalInt: '',
          optionalBool: '',
          optionalObj: '',
          optionalArr: '',
          nullableNumber: '',
          nullableText: '',
          unionNumber: '',
          unionMixed: '',
          untyped: ''
        },
        inputSchema
      })
    ).toEqual({
      optionalText: '',
      nullableText: '',
      unionMixed: '',
      untyped: ''
    });
  });

  it('keeps null when schema explicitly allows null', () => {
    const inputSchema: JSONSchemaInputType = {
      type: 'object',
      properties: {
        typeArray: { type: ['number', 'null'] },
        anyOfNull: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        oneOfNull: { oneOf: [{ type: 'object' }, { type: 'null' }] },
        nullableFlag: { type: 'object', nullable: true },
        constNull: { const: null },
        enumNull: { enum: ['auto', null] }
      }
    };

    const input = {
      typeArray: null,
      anyOfNull: null,
      oneOfNull: null,
      nullableFlag: null,
      constNull: null,
      enumNull: null
    };

    expect(stripUnsetOptionalToolInputs({ input, inputSchema })).toEqual(input);
  });

  it('does not touch unknown keys outside schema properties', () => {
    const inputSchema: JSONSchemaInputType = {
      type: 'object',
      properties: {
        known: { type: 'number' }
      }
    };

    expect(
      stripUnsetOptionalToolInputs({
        input: {
          known: null,
          unknown: null
        },
        inputSchema
      })
    ).toEqual({
      unknown: null
    });
  });
});
