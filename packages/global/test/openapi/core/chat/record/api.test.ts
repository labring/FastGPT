import { describe, expect, it } from 'vitest';
import {
  GetRecordsV2BodyRawSchema,
  GetRecordsV2ResponseSchema
} from '@fastgpt/global/openapi/core/chat/record/api';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { UserChatItemFileItemSchema } from '@fastgpt/global/core/chat/type';
import { createSchema, createDocument } from 'zod-openapi';
import Ajv2020 from 'ajv/dist/2020';
import { openApiDocumentOptions } from '@fastgpt/global/openapi/generation';

const itemId = '68ad85a7463006c963799a05';

describe('chat record pagination contracts', () => {
  it('preserves historical null file keys when validating a complete records page', () => {
    const files = [1, 2].map((index) => ({
      file: {
        type: ChatFileTypeEnum.image,
        name: `image${index}.png`,
        url: `https://example.com/image${index}.png`,
        key: null
      }
    }));
    const human = {
      dataId: 'round',
      obj: ChatRoleEnum.Human,
      value: [{ text: { content: 'question' } }, ...files]
    };
    const ai = {
      dataId: 'round',
      obj: ChatRoleEnum.AI,
      value: [{ text: { content: 'answer' } }]
    };
    const page = {
      list: [ai, ai, human, ai, human],
      total: 5,
      hasMorePrev: true,
      hasMoreNext: false,
      prevCursor: 'round',
      nextCursor: null
    };

    expect(GetRecordsV2ResponseSchema.parse(page)).toEqual(page);

    // 校验附件字段的文档契约；完整分页的运行时校验已在上方覆盖。
    const { schema } = createSchema(UserChatItemFileItemSchema, {
      io: 'output',
      opts: openApiDocumentOptions
    });
    const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(schema);
    expect(validate(files[0].file)).toBe(true);
  });

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

  it('preserves built-in and custom output keys in persisted interactive records', () => {
    const interactive = {
      type: 'userSelect',
      entryNodeIds: ['select'],
      memoryEdges: [],
      nodeOutputs: [
        { nodeId: 'chat', key: NodeOutputKeyEnum.answerText, value: 'answer' },
        { nodeId: 'custom', key: 'count', value: 0 },
        { nodeId: 'custom', key: 'enabled', value: false },
        { nodeId: 'custom', key: '备注', value: '' }
      ],
      params: { description: '', userSelectOptions: [{ key: 'continue', value: 'Continue' }] }
    };
    const list = [
      { dataId: 'human', obj: ChatRoleEnum.Human, value: [{ text: { content: 'Hi' } }] },
      { dataId: 'ai', obj: ChatRoleEnum.AI, value: [{ interactive }] }
    ];

    const response = GetRecordsV2ResponseSchema.parse({
      list,
      total: 2,
      hasMorePrev: false,
      hasMoreNext: false,
      prevCursor: null,
      nextCursor: null
    });

    expect(response.list).toEqual(list);
  });

  it.each([undefined, null, 42, {}])('rejects non-string interactive output keys: %j', (key) => {
    const result = GetRecordsV2ResponseSchema.safeParse({
      list: [
        {
          dataId: 'ai',
          obj: ChatRoleEnum.AI,
          value: [
            {
              interactive: {
                type: 'userSelect',
                entryNodeIds: ['select'],
                memoryEdges: [],
                nodeOutputs: [{ nodeId: 'custom', key, value: 'answer' }],
                params: { description: '', userSelectOptions: [] }
              }
            }
          ]
        }
      ],
      total: 1,
      hasMorePrev: false,
      hasMoreNext: false,
      prevCursor: null,
      nextCursor: null
    });

    expect(result.success).toBe(false);
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
