import { describe, expect, it } from 'vitest';
import type {
  JSONSchemaInputType,
  JSONSchemaOutputType
} from '@fastgpt/global/core/app/jsonschema';
import {
  jsonSchema2NodeInput,
  jsonSchema2NodeOutput,
  getNodeInputTypeFromSchemaInputType,
  getSchemaValueType,
  str2OpenApiSchema,
  resolveSchemaType,
  JSONSchemaInputTypeSchema,
  JsonSchemaPropertiesItemSchema
} from '@fastgpt/global/core/app/jsonschema';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

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

describe('getNodeInputTypeFromSchemaInputType', () => {
  it('should return string type for string input', () => {
    const result = getNodeInputTypeFromSchemaInputType({ type: 'string' });
    expect(result).toBe(WorkflowIOValueTypeEnum.string);
  });

  it('should return number type for number input', () => {
    const result = getNodeInputTypeFromSchemaInputType({ type: 'number' });
    expect(result).toBe(WorkflowIOValueTypeEnum.number);
  });

  it('should return number type for integer input', () => {
    const result = getNodeInputTypeFromSchemaInputType({ type: 'integer' });
    expect(result).toBe(WorkflowIOValueTypeEnum.number);
  });

  it('should return boolean type for boolean input', () => {
    const result = getNodeInputTypeFromSchemaInputType({ type: 'boolean' });
    expect(result).toBe(WorkflowIOValueTypeEnum.boolean);
  });

  it('should return object type for object input', () => {
    const result = getNodeInputTypeFromSchemaInputType({ type: 'object' });
    expect(result).toBe(WorkflowIOValueTypeEnum.object);
  });

  it('should return arrayAny when array type without items', () => {
    const result = getNodeInputTypeFromSchemaInputType({ type: 'array' });
    expect(result).toBe(WorkflowIOValueTypeEnum.arrayAny);
  });

  it('should return arrayString for array with string items', () => {
    const result = getNodeInputTypeFromSchemaInputType({
      type: 'array',
      arrayItems: { type: 'string' }
    });
    expect(result).toBe(WorkflowIOValueTypeEnum.arrayString);
  });

  it('should return arrayNumber for array with number items', () => {
    const result = getNodeInputTypeFromSchemaInputType({
      type: 'array',
      arrayItems: { type: 'number' }
    });
    expect(result).toBe(WorkflowIOValueTypeEnum.arrayNumber);
  });

  it('should return arrayNumber for array with integer items', () => {
    const result = getNodeInputTypeFromSchemaInputType({
      type: 'array',
      arrayItems: { type: 'integer' }
    });
    expect(result).toBe(WorkflowIOValueTypeEnum.arrayNumber);
  });

  it('should return arrayBoolean for array with boolean items', () => {
    const result = getNodeInputTypeFromSchemaInputType({
      type: 'array',
      arrayItems: { type: 'boolean' }
    });
    expect(result).toBe(WorkflowIOValueTypeEnum.arrayBoolean);
  });

  it('should return arrayObject for array with object items', () => {
    const result = getNodeInputTypeFromSchemaInputType({
      type: 'array',
      arrayItems: { type: 'object' }
    });
    expect(result).toBe(WorkflowIOValueTypeEnum.arrayObject);
  });

  it('should return arrayAny for array with array items', () => {
    const result = getNodeInputTypeFromSchemaInputType({
      type: 'array',
      arrayItems: { type: 'array' }
    });
    expect(result).toBe(WorkflowIOValueTypeEnum.arrayAny);
  });
});

describe('jsonSchema2NodeOutput', () => {
  it('should return empty array when properties is undefined', () => {
    const jsonSchema: JSONSchemaOutputType = {
      type: 'object'
    };
    const result = jsonSchema2NodeOutput(jsonSchema);
    expect(result).toEqual([]);
  });

  it('should return correct node output for basic types', () => {
    const jsonSchema: JSONSchemaOutputType = {
      type: 'object',
      properties: {
        result: { type: 'string', description: 'Result value' },
        count: { type: 'number' }
      },
      required: ['result']
    };
    const result = jsonSchema2NodeOutput(jsonSchema);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'result',
      key: 'result',
      label: 'result',
      required: true,
      valueType: WorkflowIOValueTypeEnum.string,
      description: 'Result value'
    });
    expect(result[1]).toMatchObject({
      id: 'count',
      key: 'count',
      label: 'count',
      required: false,
      valueType: WorkflowIOValueTypeEnum.number,
      description: undefined
    });
  });

  it('should use x-tool-description when available', () => {
    const jsonSchema: JSONSchemaOutputType = {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: 'Data object',
          'x-tool-description': 'Custom tool description'
        }
      }
    };
    const result = jsonSchema2NodeOutput(jsonSchema);

    expect(result[0].description).toBe('Data object');
  });

  it('should handle array types correctly', () => {
    const jsonSchema: JSONSchemaOutputType = {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'string' } }
      }
    };
    const result = jsonSchema2NodeOutput(jsonSchema);

    expect(result[0].valueType).toBe(WorkflowIOValueTypeEnum.arrayString);
  });
});

describe('getSchemaValueType', () => {
  it('should return number for integer type', () => {
    const result = getSchemaValueType({ type: 'integer' });
    expect(result).toBe(WorkflowIOValueTypeEnum.number);
  });

  it('should return arrayString for array with string items', () => {
    const result = getSchemaValueType({ type: 'array', items: { type: 'string' } });
    expect(result).toBe(WorkflowIOValueTypeEnum.arrayString);
  });

  it('should return arrayNumber for array with number items', () => {
    const result = getSchemaValueType({ type: 'array', items: { type: 'number' } });
    expect(result).toBe(WorkflowIOValueTypeEnum.arrayNumber);
  });

  it('should return arrayNumber for array with integer items', () => {
    const result = getSchemaValueType({ type: 'array', items: { type: 'integer' } });
    expect(result).toBe(WorkflowIOValueTypeEnum.arrayNumber);
  });

  it('should return arrayBoolean for array with boolean items', () => {
    const result = getSchemaValueType({ type: 'array', items: { type: 'boolean' } });
    expect(result).toBe(WorkflowIOValueTypeEnum.arrayBoolean);
  });

  it('should return arrayObject for array with object items', () => {
    const result = getSchemaValueType({ type: 'array', items: { type: 'object' } });
    expect(result).toBe(WorkflowIOValueTypeEnum.arrayObject);
  });

  it('should return the type directly for non-integer non-array types', () => {
    expect(getSchemaValueType({ type: 'string' })).toBe('string');
    expect(getSchemaValueType({ type: 'number' })).toBe('number');
    expect(getSchemaValueType({ type: 'boolean' })).toBe('boolean');
    expect(getSchemaValueType({ type: 'object' })).toBe('object');
  });

  it('should return array type when items type is not in typeMap', () => {
    const result = getSchemaValueType({ type: 'array', items: { type: 'any' } });
    expect(result).toBe('array');
  });
});

describe('str2OpenApiSchema', () => {
  it('should parse valid OpenAPI 3.0 JSON schema', async () => {
    const openApiJson = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      servers: [{ url: 'https://api.example.com/v1' }],
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            summary: 'Get all users',
            responses: { '200': { description: 'Success' } }
          }
        }
      }
    });

    const result = await str2OpenApiSchema(openApiJson);

    expect(result.serverPath).toBe('https://api.example.com/v1');
    expect(result.pathData).toHaveLength(1);
    expect(result.pathData[0]).toMatchObject({
      path: '/users',
      method: 'get',
      name: 'getUsers',
      description: 'Get all users'
    });
  });

  it('should parse valid YAML schema', async () => {
    const openApiYaml = `
openapi: '3.0.0'
info:
  title: Test API
  version: '1.0.0'
servers:
  - url: https://api.example.com
paths:
  /items:
    post:
      operationId: createItem
      description: Create a new item
      responses:
        '201':
          description: Created
`;

    const result = await str2OpenApiSchema(openApiYaml);

    expect(result.serverPath).toBe('https://api.example.com');
    expect(result.pathData).toHaveLength(1);
    expect(result.pathData[0]).toMatchObject({
      path: '/items',
      method: 'post',
      name: 'createItem',
      description: 'Create a new item'
    });
  });

  it('should handle Swagger 2.0 host and basePath', async () => {
    const swagger2Json = JSON.stringify({
      swagger: '2.0',
      info: { title: 'Test API', version: '1.0.0' },
      host: 'api.example.com',
      basePath: '/v2',
      schemes: ['https'],
      paths: {
        '/test': {
          get: {
            operationId: 'testEndpoint',
            responses: { '200': { description: 'OK' } }
          }
        }
      }
    });

    const result = await str2OpenApiSchema(swagger2Json);

    expect(result.serverPath).toBe('https://api.example.com/v2');
  });

  it('should default to https when no schemes provided in Swagger 2.0', async () => {
    const swagger2Json = JSON.stringify({
      swagger: '2.0',
      info: { title: 'Test API', version: '1.0.0' },
      host: 'api.example.com',
      basePath: '/api',
      paths: {
        '/test': {
          get: {
            operationId: 'testEndpoint',
            responses: { '200': { description: 'OK' } }
          }
        }
      }
    });

    const result = await str2OpenApiSchema(swagger2Json);

    expect(result.serverPath).toBe('https://api.example.com/api');
  });

  it('should handle multiple HTTP methods', async () => {
    const openApiJson = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/resource': {
          get: { operationId: 'getResource', responses: { '200': { description: 'OK' } } },
          post: { operationId: 'createResource', responses: { '201': { description: 'Created' } } },
          put: { operationId: 'updateResource', responses: { '200': { description: 'OK' } } },
          delete: {
            operationId: 'deleteResource',
            responses: { '204': { description: 'No Content' } }
          },
          patch: { operationId: 'patchResource', responses: { '200': { description: 'OK' } } }
        }
      }
    });

    const result = await str2OpenApiSchema(openApiJson);

    expect(result.pathData).toHaveLength(5);
    const methods = result.pathData.map((p) => p.method);
    expect(methods).toContain('get');
    expect(methods).toContain('post');
    expect(methods).toContain('put');
    expect(methods).toContain('delete');
    expect(methods).toContain('patch');
  });

  it('should filter out deprecated methods', async () => {
    const openApiJson = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          get: { operationId: 'getUsers', responses: { '200': { description: 'OK' } } },
          post: {
            operationId: 'createUser',
            deprecated: true,
            responses: { '201': { description: 'Created' } }
          }
        }
      }
    });

    const result = await str2OpenApiSchema(openApiJson);

    expect(result.pathData).toHaveLength(1);
    expect(result.pathData[0].name).toBe('getUsers');
  });

  it('should handle requestBody in OpenAPI 3.0', async () => {
    const openApiJson = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          post: {
            operationId: 'createUser',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { name: { type: 'string' } }
                  }
                }
              }
            },
            responses: { '201': { description: 'Created' } }
          }
        }
      }
    });

    const result = await str2OpenApiSchema(openApiJson);

    expect(result.pathData[0].request).toBeDefined();
    expect(result.pathData[0].request.content).toBeDefined();
  });

  it('should handle body parameter in Swagger 2.0 style', async () => {
    const swagger2Json = JSON.stringify({
      swagger: '2.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          post: {
            operationId: 'createUser',
            parameters: [
              {
                in: 'body',
                name: 'body',
                schema: {
                  type: 'object',
                  properties: { name: { type: 'string' } }
                }
              }
            ],
            responses: { '201': { description: 'Created' } }
          }
        }
      }
    });

    const result = await str2OpenApiSchema(swagger2Json);

    expect(result.pathData[0].request).toBeDefined();
    expect(result.pathData[0].request.content['application/json']).toBeDefined();
  });

  it('should use path as name when operationId is not provided', async () => {
    const openApiJson = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          get: {
            summary: 'Get users',
            responses: { '200': { description: 'OK' } }
          }
        }
      }
    });

    const result = await str2OpenApiSchema(openApiJson);

    expect(result.pathData[0].name).toBe('/users');
  });

  it('should use summary as description when description is not provided', async () => {
    const openApiJson = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            summary: 'Get all users summary',
            responses: { '200': { description: 'OK' } }
          }
        }
      }
    });

    const result = await str2OpenApiSchema(openApiJson);

    expect(result.pathData[0].description).toBe('Get all users summary');
  });

  it('should return empty serverPath when no servers or host configured', async () => {
    const openApiJson = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/test': {
          get: { operationId: 'test', responses: { '200': { description: 'OK' } } }
        }
      }
    });

    const result = await str2OpenApiSchema(openApiJson);

    expect(result.serverPath).toBe('');
  });

  it('should reject invalid schema', async () => {
    const invalidSchema = 'this is not valid json or yaml {{{';

    await expect(str2OpenApiSchema(invalidSchema)).rejects.toBeDefined();
  });

  it('should handle empty string input', async () => {
    await expect(str2OpenApiSchema('')).rejects.toBeDefined();
  });

  it('should filter out non-HTTP methods', async () => {
    const openApiJson = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          get: { operationId: 'getUsers', responses: { '200': { description: 'OK' } } },
          parameters: [{ name: 'id', in: 'query' }],
          summary: 'User operations'
        }
      }
    });

    const result = await str2OpenApiSchema(openApiJson);

    expect(result.pathData).toHaveLength(1);
    expect(result.pathData[0].method).toBe('get');
  });

  it('should handle parameters in path operations', async () => {
    const openApiJson = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users/{id}': {
          get: {
            operationId: 'getUserById',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
              { name: 'include', in: 'query', schema: { type: 'string' } }
            ],
            responses: { '200': { description: 'OK' } }
          }
        }
      }
    });

    const result = await str2OpenApiSchema(openApiJson);

    expect(result.pathData[0].params).toHaveLength(2);
  });
});

describe('JSON Schema type validation (issue #6451)', () => {
  describe('resolveSchemaType', () => {
    it('should pass through standard types unchanged', () => {
      expect(resolveSchemaType('string')).toBe('string');
      expect(resolveSchemaType('number')).toBe('number');
      expect(resolveSchemaType('integer')).toBe('integer');
      expect(resolveSchemaType('boolean')).toBe('boolean');
      expect(resolveSchemaType('array')).toBe('array');
      expect(resolveSchemaType('object')).toBe('object');
    });

    it('should resolve "null" to "string"', () => {
      expect(resolveSchemaType('null')).toBe('string');
    });

    it('should resolve array type ["string", "null"] to "string"', () => {
      expect(resolveSchemaType(['string', 'null'])).toBe('string');
    });

    it('should resolve array type ["null", "integer"] to "integer"', () => {
      expect(resolveSchemaType(['null', 'integer'])).toBe('integer');
    });

    it('should resolve array type ["null"] to "string" (fallback)', () => {
      expect(resolveSchemaType(['null'])).toBe('string');
    });

    it('should pick the first non-null type from array', () => {
      expect(resolveSchemaType(['number', 'string'])).toBe('number');
      expect(resolveSchemaType(['boolean', 'null'])).toBe('boolean');
    });
  });

  describe('JSONSchemaInputTypeSchema accepts MCP tool schemas', () => {
    it('should accept "null" as a property type', () => {
      const schema = {
        type: 'object',
        properties: {
          optionalField: { type: 'null', description: 'Always null' }
        }
      };
      const result = JSONSchemaInputTypeSchema.safeParse(schema);
      expect(result.success).toBe(true);
    });

    it('should accept array type like ["string", "null"]', () => {
      const schema = {
        type: 'object',
        properties: {
          nullableString: { type: ['string', 'null'], description: 'Nullable string' }
        }
      };
      const result = JSONSchemaInputTypeSchema.safeParse(schema);
      expect(result.success).toBe(true);
    });

    it('should accept array items with union type', () => {
      const schema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: ['string', 'null'] },
            description: 'Nullable string array'
          }
        }
      };
      const result = JSONSchemaInputTypeSchema.safeParse(schema);
      expect(result.success).toBe(true);
    });

    it('should still reject truly invalid types', () => {
      const schema = {
        type: 'object',
        properties: {
          bad: { type: 'foobar' }
        }
      };
      const result = JSONSchemaInputTypeSchema.safeParse(schema);
      expect(result.success).toBe(false);
    });
  });

  describe('getNodeInputTypeFromSchemaInputType with union types', () => {
    it('should handle ["string", "null"] as string', () => {
      const result = getNodeInputTypeFromSchemaInputType({
        type: ['string', 'null'] as any
      });
      expect(result).toBe(WorkflowIOValueTypeEnum.string);
    });

    it('should handle ["integer", "null"] as number', () => {
      const result = getNodeInputTypeFromSchemaInputType({
        type: ['integer', 'null'] as any
      });
      expect(result).toBe(WorkflowIOValueTypeEnum.number);
    });

    it('should handle array with union item type', () => {
      const result = getNodeInputTypeFromSchemaInputType({
        type: 'array',
        arrayItems: { type: ['string', 'null'] as any }
      });
      expect(result).toBe(WorkflowIOValueTypeEnum.arrayString);
    });
  });

  describe('jsonSchema2NodeInput with nullable MCP properties', () => {
    it('should correctly parse MCP schema with nullable types', () => {
      const jsonSchema = {
        type: 'object' as const,
        properties: {
          query: { type: 'string' as const, description: 'Search query' },
          limit: { type: ['integer', 'null'] as any, description: 'Max results' },
          tags: {
            type: 'array' as const,
            items: { type: ['string', 'null'] as any },
            description: 'Filter tags'
          }
        },
        required: ['query']
      };

      const result = jsonSchema2NodeInput({ jsonSchema, isToolParams: true });

      expect(result).toHaveLength(3);

      const queryInput = result.find((r) => r.key === 'query');
      expect(queryInput?.valueType).toBe(WorkflowIOValueTypeEnum.string);
      expect(queryInput?.required).toBe(true);

      const limitInput = result.find((r) => r.key === 'limit');
      expect(limitInput?.valueType).toBe(WorkflowIOValueTypeEnum.number);

      const tagsInput = result.find((r) => r.key === 'tags');
      expect(tagsInput?.valueType).toBe(WorkflowIOValueTypeEnum.arrayString);
    });
  });
});
