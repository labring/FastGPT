import { describe, expect, it } from 'vitest';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';
import { jsonSchema2NodeInput } from '@fastgpt/global/core/app/jsonschema';

describe('jsonSchema2NodeInput', () => {
  it('should return correct node input', () => {
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
        toolDescription: 'name',
        required: true,
        renderTypeList: ['input']
      },
      {
        key: 'select',
        label: 'select',
        valueType: 'string',
        toolDescription: 'select',
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
        toolDescription: 'age',
        required: true,
        renderTypeList: ['numberInput'],
        max: 100,
        min: 0
      },
      {
        key: 'boolean',
        label: 'boolean',
        valueType: 'boolean',
        toolDescription: 'boolean',
        required: false,
        renderTypeList: ['switch']
      },
      {
        key: 'object',
        label: 'object',
        valueType: 'object',
        toolDescription: 'object',
        required: false,
        renderTypeList: ['JSONEditor']
      },
      {
        key: 'strArr',
        label: 'strArr',
        valueType: 'arrayString',
        toolDescription: 'strArr',
        required: false,
        renderTypeList: ['JSONEditor']
      },
      {
        key: 'numArr',
        label: 'numArr',
        valueType: 'arrayNumber',
        toolDescription: 'numArr',
        required: false,
        renderTypeList: ['JSONEditor']
      },
      {
        key: 'boolArr',
        label: 'boolArr',
        valueType: 'arrayBoolean',
        toolDescription: 'boolArr',
        required: false,
        renderTypeList: ['JSONEditor']
      },
      {
        key: 'objArr',
        label: 'objArr',
        valueType: 'arrayObject',
        toolDescription: 'objArr',
        required: false,
        renderTypeList: ['JSONEditor']
      },
      {
        key: 'anyArr',
        label: 'anyArr',
        valueType: 'arrayAny',
        toolDescription: 'anyArr',
        required: false,
        renderTypeList: ['JSONEditor']
      }
    ];
    const result = jsonSchema2NodeInput(jsonSchema);

    expect(result).toEqual(expectResponse);
  });
});
