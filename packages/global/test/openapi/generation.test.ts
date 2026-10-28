import { describe, expect, it } from 'vitest';
import z from 'zod';
import { createDocument, createSchema } from 'zod-openapi';
import { ObjectIdSchema } from '../../common/type/mongo';
import { openApiDocumentOptions } from '../../openapi/generation';
import { setRequiredRequestExamples } from '../../openapi/requiredExamples';

const id = '507f1f77bcf86cd799439011';
const fields = z.object({
  appId: ObjectIdSchema,
  optionalId: ObjectIdSchema.optional(),
  nullableId: ObjectIdSchema.nullable(),
  defaultId: ObjectIdSchema.default(id),
  optionalDefaultId: ObjectIdSchema.default(id).optional(),
  title: z.string(),
  optionalTitle: z.string().optional()
});

describe('OpenAPI ObjectId generation', () => {
  it('preserves required, optional and default semantics in nested request schemas', () => {
    const schema = z.object({ body: fields, rows: z.array(fields) });
    const generated = createSchema(schema, { io: 'input', opts: openApiDocumentOptions });
    if ('$ref' in generated.schema) throw new Error('Unexpected schema reference');
    const body = generated.schema.properties!.body;
    const rows = generated.schema.properties!.rows;
    if ('$ref' in body || '$ref' in rows || !rows.items || '$ref' in rows.items) {
      throw new Error('Expected inline body and row schemas');
    }

    // required 只表示字段集合；排序后完整比较，避免 Zod 版本间的顺序差异影响断言。
    expect(generated.schema.required?.slice().sort()).toEqual(['body', 'rows']);
    expect(body.required?.slice().sort()).toEqual(['appId', 'nullableId', 'title']);
    expect(rows.items.required?.slice().sort()).toEqual(['appId', 'nullableId', 'title']);

    const objectId = { toString: () => id };
    expect(fields.parse({ appId: objectId, nullableId: null, title: 'test' })).toMatchObject({
      appId: id,
      nullableId: null,
      defaultId: id
    });
    expect(fields.safeParse({ title: 'test' }).success).toBe(false);
    expect(ObjectIdSchema.safeParse(undefined).success).toBe(false);
    expect(ObjectIdSchema.optional().safeParse(undefined).success).toBe(true);
  });

  it('marks required query and header IDs and enables their request examples', () => {
    const paths = {
      '/test': {
        get: {
          requestParams: { query: fields, header: z.object({ teamId: ObjectIdSchema }) },
          responses: { '200': { description: 'ok' } }
        }
      }
    };
    const document = setRequiredRequestExamples(
      createDocument(
        { openapi: '3.1.0', info: { title: 'test', version: '1' }, paths },
        openApiDocumentOptions
      ),
      paths
    );
    const parameters = document.paths!['/test']!.get!.parameters!;
    expect(parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: 'query', name: 'appId', required: true }),
        expect.objectContaining({ in: 'query', name: 'nullableId', required: true }),
        expect.objectContaining({ in: 'header', name: 'teamId', required: true })
      ])
    );
    for (const parameter of parameters) {
      if ('$ref' in parameter) throw new Error('Unexpected parameter reference');
      const optional = ['optionalId', 'defaultId', 'optionalDefaultId', 'optionalTitle'].includes(
        parameter.name
      );
      expect(parameter.required === true).toBe(!optional);
      expect(parameter.examples?.default).toMatchObject({ 'x-disabled': optional });
    }
  });

  it('does not change response required fields', () => {
    expect(createSchema(fields, { io: 'output', opts: openApiDocumentOptions })).toEqual(
      createSchema(fields, { io: 'output' })
    );
  });
});

describe('OpenAPI never properties', () => {
  it.each(['input', 'output'] as const)(
    'hides forbidden fields in nested %s objects while retaining nullable values',
    (io) => {
      const fields = z.object({
        name: z.string(),
        forbidden: z.never().optional().optional(),
        nullableValue: z.never().nullable()
      });
      const { schema } = createSchema(z.object({ body: fields, rows: z.array(fields) }), {
        io,
        opts: openApiDocumentOptions
      });
      if ('$ref' in schema) throw new Error('Unexpected schema reference');
      const body = schema.properties!.body;
      const rows = schema.properties!.rows;
      if ('$ref' in body || '$ref' in rows || !rows.items || '$ref' in rows.items) {
        throw new Error('Expected inline body and row schemas');
      }

      for (const item of [body, rows.items]) {
        expect(item.properties).not.toHaveProperty('forbidden');
        expect(item.properties).toHaveProperty('name');
        expect(item.properties).toHaveProperty('nullableValue');
        expect(item.required?.slice().sort()).toEqual(['name', 'nullableValue']);
      }

      expect(fields.parse({ name: 'test', nullableValue: null })).toEqual({
        name: 'test',
        nullableValue: null
      });
      expect(
        fields.safeParse({ name: 'test', nullableValue: null, forbidden: 'invalid' }).success
      ).toBe(false);
    }
  );
});
