import { describe, expect, it } from 'vitest';
import z from 'zod';
import { createDocument, createSchema } from 'zod-openapi';
import { ObjectIdSchema } from '../../common/type/mongo';
import { openApiDocumentOptions } from '../../openapi/generation';
import { setRequiredRequestExamples } from '../../openapi/requiredExamples';
import { openAPIDocument } from '../../openapi/provider/devapi';
import { apiDocOpenAPIDocument } from '../../openapi/provider/systemopenapi';

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

describe('OpenAPI request omission semantics', () => {
  const fields = z.object({
    enabled: z.preprocess((value) => value ?? undefined, z.boolean().default(false)),
    count: z.number().default(0),
    text: z.string().default(''),
    items: z.array(z.string()).default([]),
    required: z.string(),
    nullable: z.string().nullable(),
    documentedDefault: z.string().meta({ default: 'example' })
  });

  it('uses accepted omissions rather than default annotations for request fields', () => {
    const { schema } = createSchema(fields, { io: 'input', opts: openApiDocumentOptions });
    if ('$ref' in schema) throw new Error('Unexpected schema reference');
    expect(schema.required?.slice().sort()).toEqual(['documentedDefault', 'nullable', 'required']);
    expect(schema.properties).toMatchObject({
      enabled: { type: 'boolean', default: false },
      count: { type: 'number', default: 0 },
      text: { type: 'string', default: '' },
      items: { type: 'array', default: [] },
      documentedDefault: { type: 'string', default: 'example' }
    });
    expect(
      fields.parse({ required: 'value', nullable: null, documentedDefault: 'value' })
    ).toMatchObject({ enabled: false, count: 0, text: '', items: [] });
  });

  it('applies the same rule to query and header parameters', () => {
    const paths = {
      '/test': {
        get: {
          requestParams: { query: fields, header: fields },
          responses: { '200': { description: 'ok' } }
        }
      }
    };
    const document = setRequiredRequestExamples(
      createDocument(
        {
          openapi: '3.1.0',
          info: { title: 'test', version: '1' },
          paths
        },
        openApiDocumentOptions
      ),
      paths
    );
    const parameters = document.paths!['/test']!.get!.parameters!;
    for (const parameter of parameters) {
      if ('$ref' in parameter) throw new Error('Unexpected parameter reference');
      expect(parameter.required === true, `${parameter.in}.${parameter.name}`).toBe(
        ['required', 'nullable', 'documentedDefault'].includes(parameter.name)
      );
    }
  });

  it('retains the generated requirement when a custom parser cannot be probed synchronously', () => {
    const fields = z.object({
      value: z.preprocess((value) => {
        if (value === undefined) throw new Error('Expected an explicit value');
        return value;
      }, z.string())
    });
    expect(createSchema(fields, { io: 'input', opts: openApiDocumentOptions })).toEqual(
      createSchema(fields, { io: 'input' })
    );
  });

  it('preserves response requirements and defaults', () => {
    const generated = createSchema(fields, { io: 'output', opts: openApiDocumentOptions });
    expect(generated).toEqual(createSchema(fields, { io: 'output' }));
    if ('$ref' in generated.schema) throw new Error('Unexpected schema reference');
    expect(generated.schema.required).toContain('enabled');
  });

  it.each([
    ['DevAPI', openAPIDocument],
    ['System OpenAPI', apiDocOpenAPIDocument]
  ] as const)(
    'documents optional completion flags in %s for all identities and versions',
    (_, document) => {
      for (const version of ['v1', 'v2']) {
        const body = document.paths![`/${version}/chat/completions`]!.post!.requestBody!;
        if ('$ref' in body) throw new Error('Unexpected body reference');
        const schema = body.content['application/json'].schema!;
        if ('$ref' in schema) throw new Error('Unexpected schema reference');
        const identities = schema.anyOf!.flatMap((branch) => branch.anyOf ?? [branch]);
        expect(identities.length).toBeGreaterThan(0);
        for (const identity of identities) {
          for (const name of ['retainDatasetCite', 'showSkillReferences', 'detail', 'stream']) {
            expect(identity.required ?? [], `${version}.${identity.title}.${name}`).not.toContain(
              name
            );
            expect(identity.properties?.[name]).toMatchObject({ type: 'boolean', default: false });
          }
        }
      }
    }
  );
});
