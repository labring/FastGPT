import { describe, expect, it } from 'vitest';
import {
  GetRecordsV2BodyRawSchema,
  GetRecordsV2ResponseSchema
} from '@fastgpt/global/openapi/core/chat/record/api';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { createSchema, createDocument } from 'zod-openapi';
import Ajv2020 from 'ajv/dist/2020';
import { openApiDocumentOptions } from '@fastgpt/global/openapi/generation';

const itemId = '68ad85a7463006c963799a05';

describe('chat record pagination contracts', () => {
  it('accepts one of three anchors or the latest page, rejects conflicting anchors and caller-supplied roles', () => {
    const body = { appId: itemId, chatId: 'chat' };
    const keys = ['prevId', 'nextId', 'initialId'];
    expect(GetRecordsV2BodyRawSchema.safeParse(body).success).toBe(true);
    for (const key of keys) {
      expect(GetRecordsV2BodyRawSchema.parse({ ...body, [key]: 'round' })).toMatchObject({
        [key]: 'round'
      });
      expect(
        GetRecordsV2BodyRawSchema.safeParse({ ...body, [key]: 'round', role: ChatRoleEnum.AI })
          .success
      ).toBe(false);
      for (const other of keys.filter((value) => value !== key)) {
        expect(
          GetRecordsV2BodyRawSchema.safeParse({ ...body, [key]: 'round', [other]: 'round' }).success
        ).toBe(false);
      }
    }
  });

  it('preserves message metadata when validating responses', () => {
    const time = new Date('2026-11-13T00:00:00Z');
    const response = GetRecordsV2ResponseSchema.parse({
      list: [
        {
          _id: itemId,
          obj: ChatRoleEnum.Human,
          id: 'round',
          dataId: 'round',
          value: [{ text: { content: 'Hi' } }],
          time,
          hideInUI: false,
          customDisplayMetadata: 'preserved'
        }
      ],
      total: 2,
      hasMorePrev: false,
      hasMoreNext: true,
      prevCursor: null,
      nextCursor: 'round'
    });
    expect(response.list[0]).toMatchObject({
      _id: itemId,
      time,
      customDisplayMetadata: 'preserved',
      hideInUI: false
    });
    expect(response.prevCursor).toBeNull();
    expect(response.nextCursor).toBe('round');
  });

  it('documents mutually exclusive pagination modes in OpenAPI', () => {
    const document = createDocument(
      {
        openapi: '3.1.0',
        info: { title: 'chat records', version: '1' },
        paths: {
          '/records': {
            post: {
              requestBody: {
                content: { 'application/json': { schema: GetRecordsV2BodyRawSchema } }
              },
              responses: { '200': { description: 'ok' } }
            }
          }
        }
      },
      openApiDocumentOptions
    );
    const body = document.paths!['/records']!.post!.requestBody!;
    if ('$ref' in body) throw new Error('Expected inline request body');
    const validate = new Ajv2020({ strict: false, validateFormats: false }).compile({
      ...body.content['application/json'].schema,
      components: document.components
    });
    const target = { appId: itemId, chatId: 'chat' };
    expect(validate(target)).toBe(true);
    expect(validate({ ...target, role: ChatRoleEnum.AI })).toBe(false);
    for (const key of ['prevId', 'nextId', 'initialId']) {
      expect(validate({ ...target, [key]: 'round' })).toBe(true);
      for (const other of ['prevId', 'nextId', 'initialId'].filter((value) => value !== key)) {
        expect(validate({ ...target, [key]: 'round', [other]: 'round' })).toBe(false);
      }
    }
  });

  it('requires dataId, accepts records without the deprecated alias and documents its deprecation', () => {
    const record = { dataId: 'round', obj: ChatRoleEnum.Human, value: [] };
    const page = {
      list: [record],
      total: 1,
      hasMorePrev: false,
      hasMoreNext: false,
      prevCursor: null,
      nextCursor: null
    };
    expect(GetRecordsV2ResponseSchema.parse(page).list).toEqual([record]);
    expect(
      GetRecordsV2ResponseSchema.parse({ ...page, list: [{ ...record, id: 'round' }] }).list[0]
    ).toMatchObject({ id: 'round', dataId: 'round' });
    expect(
      GetRecordsV2ResponseSchema.safeParse({ ...page, list: [{ obj: record.obj, value: [] }] })
        .success
    ).toBe(false);
    expect(
      GetRecordsV2ResponseSchema.safeParse({
        ...page,
        nextCursor: { dataId: 'round', role: 'assistant' }
      }).success
    ).toBe(false);
    const { schema } = createSchema(GetRecordsV2ResponseSchema, {
      io: 'output',
      opts: openApiDocumentOptions
    });
    expect(schema).toMatchObject({
      properties: {
        list: {
          items: {
            allOf: expect.arrayContaining([
              expect.objectContaining({
                required: expect.arrayContaining(['dataId']),
                properties: expect.objectContaining({
                  id: expect.objectContaining({ deprecated: true })
                })
              })
            ])
          }
        }
      }
    });
  });
});
