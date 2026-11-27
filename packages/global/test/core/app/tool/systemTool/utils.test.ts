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

  it('keeps null for allOf with annotation branch, $ref to nullable definitions/$defs, untyped properties, and unresolvable $ref', () => {
    const draft7Schema = {
      $id: 'https://fastgpt.example.com/tool-draft7.json',
      type: 'object',
      definitions: {
        nullableSetting: { type: ['object', 'null'] },
        strictNumber: { type: 'number' }
      },
      properties: {
        allOfAnnotatedNullable: {
          allOf: [{ type: ['object', 'null'] }, { description: 'Override setting' }]
        },
        allOfStrictObject: {
          allOf: [{ type: ['object', 'null'] }, { type: 'object' }]
        },
        refNullable: { $ref: '#/definitions/nullableSetting' },
        refStrictNumber: { $ref: '#/definitions/strictNumber' },
        unresolvableRef: { $ref: '#/definitions/missing' },
        untypedEmpty: {},
        untypedAnnotated: { description: 'Any value' }
      }
    } as unknown as JSONSchemaInputType;

    expect(
      stripUnsetOptionalToolInputs({
        input: {
          allOfAnnotatedNullable: null,
          allOfStrictObject: null,
          refNullable: null,
          refStrictNumber: null,
          unresolvableRef: null,
          untypedEmpty: null,
          untypedAnnotated: null
        },
        inputSchema: draft7Schema
      })
    ).toEqual({
      allOfAnnotatedNullable: null,
      refNullable: null,
      unresolvableRef: null,
      untypedEmpty: null,
      untypedAnnotated: null
    });

    const draft2020Schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      $defs: {
        nullableSetting: { anyOf: [{ type: 'object' }, { type: 'null' }] },
        strictString: { type: 'string' }
      },
      properties: {
        refNullable: { $ref: '#/$defs/nullableSetting' },
        refStrictString: { $ref: '#/$defs/strictString' }
      }
    } as unknown as JSONSchemaInputType;

    expect(
      stripUnsetOptionalToolInputs({
        input: {
          refNullable: null,
          refStrictString: null
        },
        inputSchema: draft2020Schema
      })
    ).toEqual({
      refNullable: null
    });
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
