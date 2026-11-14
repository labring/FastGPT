import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import type { oas31 } from 'zod-openapi';
import { prepareOpenApiUnionPresentation } from '../../openapi/unionPresentation';

const documentWith = (
  schema: oas31.SchemaObject,
  schemas: Record<string, oas31.SchemaObject> = {}
): oas31.OpenAPIObject => ({
  openapi: '3.1.0',
  info: { title: 'test', version: '1' },
  components: { schemas },
  paths: {
    '/test': {
      post: {
        requestBody: { content: { 'application/json': { schema } } },
        responses: { 200: { description: 'ok' } }
      }
    }
  }
});

const bodyOf = (document: oas31.OpenAPIObject) => {
  const body = document.paths!['/test']!.post!.requestBody!;
  if ('$ref' in body) throw new Error('Expected inline body');
  return body.content['application/json'].schema as oas31.SchemaObject;
};

/** 用真实 JSON Schema 校验核对投影前后行为，避免展示重排改变分支约束。 */
const expectEquivalent = (
  original: oas31.OpenAPIObject,
  projected: oas31.OpenAPIObject,
  values: unknown[]
) => {
  const ajv = new Ajv2020({ strict: false });
  const before = ajv.compile({ ...bodyOf(original), components: original.components });
  const after = ajv.compile({ ...bodyOf(projected), components: projected.components });
  for (const value of values) expect(after(value), JSON.stringify(value)).toBe(before(value));
};

describe('automatic union presentation', () => {
  it('detects presence, type and required differences without business field names or annotations', () => {
    const document = documentWith({
      oneOf: [
        {
          type: 'object',
          properties: {
            common: { type: 'string' },
            target: { type: 'string' },
            mode: { const: 'a' }
          },
          required: ['target', 'mode']
        },
        {
          type: 'object',
          properties: {
            common: { type: 'string' },
            target: { type: 'integer' },
            mode: { const: 'b' }
          },
          required: ['common', 'mode']
        }
      ]
    });
    const result = prepareOpenApiUnionPresentation(document);
    for (const variant of bodyOf(result).oneOf!) {
      for (const key of ['target', 'mode'])
        expect(variant.properties![key]).toHaveProperty('x-fastgpt-union-parameter');
    }
    expect(bodyOf(result).oneOf![0].properties!.common).not.toHaveProperty(
      'x-fastgpt-union-parameter'
    );
    expect(bodyOf(result).oneOf![1].properties!.common).toHaveProperty('x-fastgpt-union-parameter');
    expect(bodyOf(document).oneOf![0].properties!.target).not.toHaveProperty(
      'x-fastgpt-union-parameter'
    );
    expectEquivalent(document, result, [
      { target: 'one', mode: 'a' },
      { target: 1, mode: 'a' },
      { common: 'two', mode: 'b' },
      { mode: 'b' },
      {}
    ]);
  });

  it('places each nested union’s own parameters before its child choices', () => {
    const document = documentWith({
      anyOf: [
        {
          title: 'app',
          description: 'app description',
          anyOf: [
            {
              type: 'object',
              title: 'default',
              properties: { common: { type: 'string' }, appRef: { type: 'string' } },
              required: ['appRef']
            },
            {
              type: 'object',
              title: 'custom',
              properties: {
                common: { type: 'string' },
                appRef: { type: 'string' },
                customer: { type: 'string' }
              },
              required: ['appRef', 'customer']
            }
          ]
        },
        {
          type: 'object',
          title: 'skill',
          properties: { common: { type: 'string' }, skillRef: { type: 'string' } },
          required: ['skillRef']
        }
      ]
    });
    const result = prepareOpenApiUnionPresentation(document);
    const app = bodyOf(result).anyOf![0];
    expect(Object.keys(app.properties!)).toEqual(['appRef']);
    expect(app).toHaveProperty('x-fastgpt-union-layout', true);
    expect(app.allOf![0].anyOf![1].properties).toHaveProperty('customer');
    expect(app.allOf![0].anyOf![1].properties).not.toHaveProperty('appRef');
    expect(app.allOf![0].anyOf![1].properties!.customer).toHaveProperty(
      'x-fastgpt-union-parameter'
    );
    expectEquivalent(document, result, [
      { appRef: 'app' },
      { appRef: 1 },
      { appRef: 'app', customer: 'c' },
      { skillRef: 'skill' },
      {},
      null
    ]);
  });

  it('groups shared companions immediately after the distinguishing field in one visual card', () => {
    const group = { 'x-fastgpt-union-group': { id: 'paging', label: '分页参数' } };
    const document = documentWith({
      type: 'object',
      properties: { limit: { type: 'integer', ...group }, common: { type: 'string' } },
      anyOf: [
        { type: 'object', properties: { from: { type: 'integer', ...group } }, required: ['from'] },
        { type: 'object', properties: { page: { type: 'integer', ...group } }, required: ['page'] }
      ]
    });
    const result = prepareOpenApiUnionPresentation(document);
    for (const [index, key] of ['from', 'page'].entries()) {
      const variant = bodyOf(result).anyOf![index];
      expect(Object.keys(variant.properties!).slice(0, 2)).toEqual([key, 'limit']);
      expect(variant.properties![key]).toHaveProperty('x-fastgpt-union-parameter', {
        label: '分页参数',
        position: 'first'
      });
      expect(variant.properties!.limit).toHaveProperty('x-fastgpt-union-parameter', {
        label: '分页参数',
        position: 'last'
      });
      expect(variant.properties!.common).not.toHaveProperty('x-fastgpt-union-parameter');
    }
    expectEquivalent(document, result, [
      { from: 0, limit: 20 },
      { page: 2, limit: 20 },
      { from: 'bad' },
      { page: 2, limit: 'bad' },
      {}
    ]);
  });

  it('handles local references and recursive models without changing their constraints', () => {
    const document = documentWith(
      { anyOf: [{ $ref: '#/components/schemas/A' }, { $ref: '#/components/schemas/B' }] },
      {
        A: {
          type: 'object',
          additionalProperties: false,
          properties: { name: { type: 'string' }, child: { $ref: '#/components/schemas/A' } },
          required: ['name']
        },
        B: {
          type: 'object',
          additionalProperties: false,
          properties: { size: { type: 'number' } },
          required: ['size']
        }
      }
    );
    const result = prepareOpenApiUnionPresentation(document);
    expect(bodyOf(result).anyOf![0].properties!.name).toHaveProperty('x-fastgpt-union-parameter');
    expectEquivalent(document, result, [
      { name: 'a' },
      { name: 'a', child: { name: 'b' } },
      { name: 'a', extra: 1 },
      { size: 1 },
      { size: 'bad' },
      {}
    ]);
  });

  it('intersects overlapping common and branch constraints, including boolean schemas', () => {
    const document = documentWith({
      type: 'object',
      properties: { blocked: false, value: { type: 'string' } },
      anyOf: [
        {
          type: 'object',
          properties: { left: { type: 'string' }, blocked: true, value: { minLength: 2 } },
          required: ['left']
        },
        {
          type: 'object',
          properties: { right: { type: 'string' }, value: false },
          required: ['right']
        }
      ]
    });
    const result = prepareOpenApiUnionPresentation(document);
    expectEquivalent(document, result, [
      { left: 'a', value: 'ok' },
      { left: 'a', value: 'x' },
      { left: 'a', value: 123 },
      { left: 'a', blocked: true },
      { right: 'b' },
      { right: 'b', value: 'no' },
      {}
    ]);
  });

  it('preserves closed nested objects while highlighting their parameters locally', () => {
    const document = documentWith({
      anyOf: [
        {
          anyOf: [
            {
              type: 'object',
              additionalProperties: false,
              properties: { appRef: { type: 'string' }, mode: { const: 'a' } },
              required: ['appRef', 'mode']
            },
            {
              type: 'object',
              additionalProperties: false,
              properties: { appRef: { type: 'string' }, mode: { const: 'b' } },
              required: ['appRef', 'mode']
            }
          ]
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: { skillRef: { type: 'string' } },
          required: ['skillRef']
        }
      ]
    });
    const result = prepareOpenApiUnionPresentation(document);
    expect(bodyOf(result).anyOf![0].anyOf![0].properties!.appRef).toHaveProperty(
      'x-fastgpt-union-parameter'
    );
    expectEquivalent(document, result, [
      { appRef: 'app', mode: 'a' },
      { appRef: 'app', mode: 'b', extra: 1 },
      { skillRef: 'skill' },
      { appRef: 'app' },
      {}
    ]);
  });

  it('keeps primitive/nullable choices and example payloads unchanged', () => {
    const document = documentWith({
      anyOf: [
        { type: 'string' },
        { type: 'null' },
        { type: 'object', properties: { value: { type: 'string' } } }
      ]
    });
    const body = document.paths!['/test']!.post!.requestBody!;
    if ('$ref' in body) throw new Error('Expected body');
    body.content['application/json'].example = {
      schema: { anyOf: [{ properties: { a: true } }, { properties: { b: true } }] }
    };
    const result = prepareOpenApiUnionPresentation(document);
    expect(result).toEqual(document);
  });

  it('applies the same automatic rule to Query, response and array-item schemas', () => {
    const choice: oas31.SchemaObject = {
      anyOf: [
        { type: 'object', properties: { shared: { type: 'string' }, left: { type: 'string' } } },
        { type: 'object', properties: { shared: { type: 'string' }, right: { type: 'string' } } }
      ]
    };
    const document = documentWith({ type: 'array', items: choice });
    const operation = document.paths!['/test']!.post!;
    operation.parameters = [
      { in: 'query', name: 'query', style: 'form', explode: true, schema: choice }
    ];
    operation.responses![200] = {
      description: 'ok',
      content: { 'application/json': { schema: choice } }
    };
    const result = prepareOpenApiUnionPresentation(document);
    const projected = result.paths!['/test']!.post!;
    const parameter = projected.parameters![0];
    const response = projected.responses![200];
    if ('$ref' in parameter || '$ref' in response) throw new Error('Expected inline schemas');
    for (const schema of [
      bodyOf(result).items,
      parameter.schema,
      response.content!['application/json'].schema
    ]) {
      const object = schema as oas31.SchemaObject;
      expect(Object.keys(object.anyOf![0].properties!)[0]).toBe('left');
      expect(object.anyOf![0].properties!.left).toHaveProperty('x-fastgpt-union-parameter');
    }
  });

  it('recognizes required-only alternatives while preserving a closed shared object', () => {
    const document = documentWith({
      type: 'object',
      additionalProperties: false,
      properties: {
        shared: { type: 'boolean' },
        byName: { type: 'string' },
        byId: { type: 'integer' }
      },
      oneOf: [{ required: ['byName'] }, { required: ['byId'] }]
    });
    const result = prepareOpenApiUnionPresentation(document);
    for (const [index, key] of ['byName', 'byId'].entries()) {
      const branch = bodyOf(result).oneOf![index];
      expect(branch.title).toBe(`提供 ${key}`);
      expect(Object.keys(branch.properties!)[0]).toBe(key);
      expect(branch.properties![key]).toHaveProperty('x-fastgpt-union-parameter');
      expect(branch.properties![index === 0 ? 'byId' : 'byName']).not.toHaveProperty(
        'x-fastgpt-union-parameter'
      );
    }
    expectEquivalent(document, result, [
      { byName: 'a' },
      { byId: 1 },
      { byName: 'a', byId: 1 },
      { byId: 'bad' },
      { byName: 'a', extra: true },
      {}
    ]);
  });
});
