import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import { createDocument } from 'zod-openapi';
import type z from 'zod';
import {
  ExportCollectionBodyRawSchema,
  ExportCollectionBodySchema,
  ReadCollectionSourceBodyRawSchema
} from '../../../../openapi/core/dataset/collection/api';
import { GetQuoteDataBodyRawSchema } from '../../../../openapi/core/dataset/data/api';
import { openApiDocumentOptions } from '../../../../openapi/generation';
import { prepareOpenApiUnionPresentation } from '../../../../openapi/unionPresentation';

const id = '68ad85a7463006c963799a05';
const context = { chatId: 'chat', chatItemDataId: 'round' };

/** 用真实生成器及 Scalar 投影验证请求契约，避免只检查 required 数组而漏掉其他 union 分支。 */
function validators(schema: z.ZodType) {
  const document = createDocument(
    {
      openapi: '3.1.0',
      info: { title: 'chat context', version: '1' },
      paths: {
        '/test': {
          post: {
            requestBody: { content: { 'application/json': { schema } } },
            responses: { '200': { description: 'ok' } }
          }
        }
      }
    },
    openApiDocumentOptions
  );
  return [document, prepareOpenApiUnionPresentation(document)].map((value) => {
    const requestBody = value.paths!['/test']!.post!.requestBody!;
    if ('$ref' in requestBody) throw new Error('Expected inline request body');
    return new Ajv2020({ strict: false, validateFormats: false }).compile({
      ...requestBody.content['application/json'].schema,
      components: value.components
    });
  });
}

describe('dataset chat identity contracts', () => {
  it.each([
    {
      name: 'read collection',
      schema: ReadCollectionSourceBodyRawSchema,
      resource: { collectionId: id }
    },
    { name: 'read quote', schema: GetQuoteDataBodyRawSchema, resource: { id } }
  ])(
    '$name requires complete context for explicit identities in runtime and OpenAPI',
    ({ schema, resource }) => {
      const validate = validators(schema);
      for (const identity of [
        { customUid: 'customer' },
        { appId: id, customUid: 'customer' },
        { appId: id, authProxy: { tmbId: id } }
      ]) {
        const valid = { ...resource, ...identity, ...context };
        expect(schema.safeParse(valid).success).toBe(true);
        for (const accepts of validate)
          expect(accepts(valid), JSON.stringify(accepts.errors)).toBe(true);

        for (const missing of ['chatId', 'chatItemDataId'] as const) {
          const invalid: Record<string, unknown> = { ...valid };
          delete invalid[missing];
          expect(schema.safeParse(invalid).success).toBe(false);
          for (const accepts of validate) expect(accepts(invalid)).toBe(false);
        }
      }
      expect(schema.safeParse(resource).success).toBe(true);
      for (const accepts of validate) expect(accepts(resource)).toBe(true);
    }
  );

  it('ordinary export forbids chat fields without rejecting unrelated legacy fields', () => {
    const validate = validators(ExportCollectionBodyRawSchema);
    const ordinary = { collectionId: id, ignoredLegacyField: true };
    expect(ExportCollectionBodySchema.parse(ordinary)).toEqual({ collectionId: id });
    for (const accepts of validate) expect(accepts(ordinary)).toBe(true);

    for (const extra of [
      { customUid: 'customer' },
      { authProxy: { tmbId: id } },
      { appId: id },
      { skillId: id },
      { sourceType: 'app' },
      { outLinkAuthData: { shareId: 'share', outLinkUid: 'user' } },
      { chatId: 'chat' },
      { chatItemDataId: 'round' },
      { chatTime: '2026-11-06T00:00:00Z' }
    ]) {
      const input = { collectionId: id, ...extra };
      expect(ExportCollectionBodySchema.safeParse(input).success).toBe(false);
      for (const accepts of validate) expect(accepts(input)).toBe(false);
    }
    const chatExport = { collectionId: id, customUid: 'customer', ...context };
    expect(ExportCollectionBodySchema.safeParse(chatExport).success).toBe(true);
    for (const accepts of validate) expect(accepts(chatExport)).toBe(true);
  });
});
