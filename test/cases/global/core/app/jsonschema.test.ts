import { describe, expect, it } from 'vitest';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';
import { jsonSchema2NodeInput } from '@fastgpt/global/core/app/jsonschema';

describe('jsonSchema2NodeInput', () => {
  it('should return correct node input for http schema', () => {
    const jsonSchema: JSONSchemaInputType = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        select: { type: 'string', enum: ['11', '22'] },
        age: { type: 'number', minimum: 0, maximum: 100 },
        boolean: { type: 'boolean' },
        object: { type: 'object' },
        strArr: { type: 'array', items: { type: 'string' } },
        numArr: { type: 'array', items: { type: 'number' } },
        boolArr: { type: 'array', items: { type: 'boolean' } },
        objArr: { type: 'array', items: { type: 'object' } },
        anyArr: { type: 'array', items: { type: 'array' } }
      },
      required: ['name', 'age']
    };
    const expectResponse = [
      {
        key: 'name',
        label: 'name',
        valueType: 'string',
        toolDescription: undefined,
        required: true,
        renderTypeList: ['input', 'reference']
      },
      {
        key: 'select',
        label: 'select',
        valueType: 'string',
        toolDescription: undefined,
        required: false,
        value: '11',
        renderTypeList: ['select'],
        list: [
          {
            label: '11',
            value: '11'
          },
          {
            label: '22',
            value: '22'
          }
        ]
      },
      {
        key: 'age',
        label: 'age',
        valueType: 'number',
        toolDescription: undefined,
        required: true,
        renderTypeList: ['numberInput', 'reference'],
        max: 100,
        min: 0
      },
      {
        key: 'boolean',
        label: 'boolean',
        valueType: 'boolean',
        toolDescription: undefined,
        required: false,
        renderTypeList: ['switch']
      },
      {
        key: 'object',
        label: 'object',
        valueType: 'object',
        toolDescription: undefined,
        required: false,
        renderTypeList: ['JSONEditor', 'reference']
      },
      {
        key: 'strArr',
        label: 'strArr',
        valueType: 'arrayString',
        toolDescription: undefined,
        required: false,
        renderTypeList: ['JSONEditor', 'reference']
      },
      {
        key: 'numArr',
        label: 'numArr',
        valueType: 'arrayNumber',
        toolDescription: undefined,
        required: false,
        renderTypeList: ['JSONEditor', 'reference']
      },
      {
        key: 'boolArr',
        label: 'boolArr',
        valueType: 'arrayBoolean',
        toolDescription: undefined,
        required: false,
        renderTypeList: ['JSONEditor', 'reference']
      },
      {
        key: 'objArr',
        label: 'objArr',
        valueType: 'arrayObject',
        toolDescription: undefined,
        required: false,
        renderTypeList: ['JSONEditor', 'reference']
      },
      {
        key: 'anyArr',
        label: 'anyArr',
        valueType: 'arrayAny',
        toolDescription: undefined,
        required: false,
        renderTypeList: ['JSONEditor', 'reference']
      }
    ];
    const result = jsonSchema2NodeInput({ jsonSchema, schemaType: 'http' });

    expect(result).toEqual(expectResponse);
  });

  it('should return correct node input for mcp schema', () => {
    const jsonSchema: JSONSchemaInputType = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'User name' },
        age: { type: 'number', minimum: 0, maximum: 100 },
        withoutDesc: { type: 'string' }
      },
      required: ['name']
    };
    const expectResponse = [
      {
        key: 'name',
        label: 'name',
        valueType: 'string',
        description: 'User name',
        toolDescription: 'User name',
        required: true,
        renderTypeList: ['input', 'reference']
      },
      {
        key: 'age',
        label: 'age',
        valueType: 'number',
        toolDescription: 'age',
        required: false,
        renderTypeList: ['numberInput', 'reference'],
        max: 100,
        min: 0
      },
      {
        key: 'withoutDesc',
        label: 'withoutDesc',
        valueType: 'string',
        toolDescription: 'withoutDesc',
        required: false,
        renderTypeList: ['input', 'reference']
      }
    ];
    const result = jsonSchema2NodeInput({ jsonSchema, schemaType: 'mcp' });

    expect(result).toEqual(expectResponse);
  });
});
