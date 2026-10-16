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
    expect(generated.schema).toMatchObject({
      required: ['body', 'rows'],
      properties: {
        body: { required: ['title', 'appId', 'nullableId'] },
        rows: { items: { required: ['title', 'appId', 'nullableId'] } }
      }
    });
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
