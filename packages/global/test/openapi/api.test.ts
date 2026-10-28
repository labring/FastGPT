import { describe, expect, it } from 'vitest';
import {
  createPaginationSchema,
  LinkedListResponseSchema,
  LinkedPaginationSchema,
  PaginationPageNumSchema,
  PaginationPageSizeSchema,
  PaginationPageSizeLimit,
  PaginationSchema
} from '../../openapi/api';
import {
  GetChannelLogsQuerySchema,
  ListChannelsQuerySchema
} from '../../openapi/core/ai/model/channel/api';
import {
  ListSkillsV2QuerySchema,
  ListSkillVersionsBodySchema
} from '../../openapi/core/ai/skill/api';
import { ListAppV2BodySchema } from '../../openapi/core/app/common/api';
import { GetDatasetListV2BodySchema } from '../../openapi/core/dataset/api';
import { InvoiceListBodySchema } from '../../openapi/admin/wallet/bill/invoice/api';
import { SearchDatasetSynonymMappingsBodySchema } from '../../openapi/core/dataset/synonym/api';
import { GetDatasetTrainingErrorBodySchema } from '../../openapi/core/dataset/training/api';
import z from 'zod';
import { createSchema } from 'zod-openapi';
import { openApiDocumentOptions } from '../../openapi/generation';
import { GetUsersBodySchema } from '../../openapi/admin/user/api';
import { GetTeamsBodySchema } from '../../openapi/admin/team/api';
import { GetPaysBodySchema } from '../../openapi/admin/wallet/pay/api';
import { GetPlansBodySchema } from '../../openapi/admin/wallet/plan/api';
import { AdminAuditListBodySchema } from '../../openapi/admin/system/audit/api';
import { GetUserInformListBodySchema } from '../../openapi/support/user/inform/api';
import { ListToolSetV2BodySchema } from '../../openapi/core/app/toolSet/api';
import { GetLogUsersBodySchema } from '../../openapi/core/app/log/api';

describe('shared API schemas', () => {
  it.each([1, '20', 500, '500'])(
    'keeps valid page size %j for offset and cursor pagination',
    (pageSize) => {
      expect(PaginationSchema.parse({ pageSize }).pageSize).toBe(Number(pageSize));
      expect(LinkedPaginationSchema().parse({ pageSize }).pageSize).toBe(Number(pageSize));
    }
  );

  it.each([501, '501', 1000, '1000', Number.MAX_SAFE_INTEGER])(
    'caps shared page size %j at 500 for offset and cursor pagination',
    (pageSize) => {
      expect(PaginationSchema.parse({ pageSize }).pageSize).toBe(500);
      expect(LinkedPaginationSchema().parse({ pageSize }).pageSize).toBe(500);
    }
  );

  it.each([0, -1, 1.5, 501.5, NaN, Infinity, 'invalid'])(
    'rejects invalid shared page sizes %j',
    (pageSize) => {
      expect(PaginationSchema.safeParse({ pageSize }).success).toBe(false);
      expect(LinkedPaginationSchema().safeParse({ pageSize }).success).toBe(false);
    }
  );

  it('applies the common page-size default and allows explicit business limits', () => {
    expect(PaginationPageSizeSchema.parse(undefined)).toBe(20);
    expect(PaginationSchema.parse({})).toEqual({ pageNum: 1, pageSize: 20 });
    expect(LinkedPaginationSchema().parse({}).pageSize).toBe(20);
    const special = LinkedPaginationSchema({ pageSize: z.number().int().positive().max(30) });
    expect(special.parse({ pageSize: 30 }).pageSize).toBe(30);
    expect(special.safeParse({ pageSize: 31 }).success).toBe(false);
    expect(
      SearchDatasetSynonymMappingsBodySchema.safeParse({
        datasetId: '68ad85a7463006c963799a05',
        pageSize: 101
      }).success
    ).toBe(false);
  });

  it('documents real defaults without assigning a fixed offset', () => {
    const { schema } = createSchema(PaginationSchema, {
      io: 'input',
      opts: openApiDocumentOptions
    });
    expect(schema).toMatchObject({
      anyOf: [
        { properties: { offset: { example: 0 }, pageSize: { default: 20 } } },
        { properties: { pageNum: { default: 1 }, pageSize: { default: 20 } } }
      ]
    });
    expect(schema).not.toHaveProperty('anyOf.0.properties.offset.default');
    expect(PaginationSchema.parse({ pageNum: 2 })).toEqual({ pageNum: 2, pageSize: 20 });
  });

  it.each([
    { name: 'users', schema: GetUsersBodySchema, input: {}, pageSize: 20 },
    { name: 'teams', schema: GetTeamsBodySchema, input: {}, pageSize: 20 },
    { name: 'payments', schema: GetPaysBodySchema, input: {}, pageSize: 20 },
    { name: 'plans', schema: GetPlansBodySchema, input: {}, pageSize: 20 },
    { name: 'admin audit', schema: AdminAuditListBodySchema, input: {}, pageSize: 20 },
    { name: 'notifications', schema: GetUserInformListBodySchema, input: {}, pageSize: 20 },
    {
      name: 'toolset tools',
      schema: ListToolSetV2BodySchema,
      input: { parentId: '68ad85a7463006c963799a05' },
      pageSize: 20
    },
    {
      name: 'log users',
      schema: GetLogUsersBodySchema,
      input: {
        appId: '68ad85a7463006c963799a05',
        dateStart: '2026-01-01T00:00:00Z',
        dateEnd: '2026-01-31T23:59:59Z'
      },
      pageSize: 20
    }
  ])(
    'retains the $name page-size default in parsing and OpenAPI',
    ({ schema, input, pageSize }) => {
      expect(schema.parse(input).pageSize).toBe(pageSize);
      const { schema: document } = createSchema(schema, {
        io: 'input',
        opts: openApiDocumentOptions
      });
      expect(document).toMatchObject({
        anyOf: [
          { properties: { pageSize: { default: pageSize } } },
          { properties: { pageSize: { default: pageSize } } }
        ]
      });
    }
  );

  it('applies the common limit to standalone list APIs and their OpenAPI metadata', () => {
    const query = Object.fromEntries(
      new URLSearchParams(
        'pageNum=1&pageSize=500&channelType=system&requestId=&codeType=all&startTimestamp=1791734400000&endTimestamp=1791907199999'
      )
    );
    for (const { schema, input } of [
      { schema: GetChannelLogsQuerySchema, input: query },
      { schema: ListChannelsQuerySchema, input: {} },
      { schema: ListSkillsV2QuerySchema, input: {} },
      { schema: ListSkillVersionsBodySchema, input: { skillId: 'skill-1' } },
      { schema: InvoiceListBodySchema, input: {} }
    ]) {
      for (const pageSize of [500, 501]) {
        expect(schema.parse({ ...input, pageSize })).toMatchObject({ pageSize: 500 });
      }
    }
    expect(ListChannelsQuerySchema.parse({})).toMatchObject({ pageSize: 20 });
    const document = z.toJSONSchema(GetChannelLogsQuerySchema);
    expect(document.properties?.pageSize).toMatchObject({
      maximum: 500,
      description: expect.stringContaining('超出自动按 500 处理')
    });
  });

  it('keeps legacy JSON cursor anchors compatible', () => {
    const anchor = { index: 2, filters: ['active'] };

    expect(LinkedPaginationSchema().parse({ anchor }).anchor).toEqual(anchor);
    expect(
      LinkedListResponseSchema(z.object({ name: z.string() })).parse({
        list: [{ id: 'item-1', name: 'First', anchor }],
        hasMorePrev: false,
        hasMoreNext: true
      }).list[0].anchor
    ).toEqual(anchor);
  });
});

describe('exclusive pagination', () => {
  const schema = createPaginationSchema({ searchKey: z.string().optional() });

  it.each([
    { input: {}, expected: { pageNum: 1, pageSize: 20 } },
    { input: { pageSize: '20' }, expected: { pageSize: 20, pageNum: 1 } },
    { input: { pageNum: '2', pageSize: 20 }, expected: { pageNum: 2, pageSize: 20 } },
    { input: { offset: '0', pageNum: 5 }, expected: { offset: 0, pageSize: 20 } },
    {
      input: { offset: 3, pageNum: -1, searchKey: 'retained', unknown: 'removed' },
      expected: { offset: 3, pageSize: 20, searchKey: 'retained' }
    }
  ])('parses $input as $expected', ({ input, expected }) => {
    expect(schema.parse(input)).toEqual(expected);
  });

  it.each([
    { offset: -1, pageNum: 2 },
    { offset: 'invalid', pageNum: 2 },
    { offset: 1.5 },
    { pageNum: 0 },
    { pageNum: -1 },
    { pageNum: 'invalid' },
    { offset: 0, searchKey: 1 }
  ])('rejects invalid selected-mode parameters %j without switching modes', (input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });

  it('supports the legacy Skill page field', () => {
    const skillSchema = createPaginationSchema({}, { page: PaginationPageNumSchema });
    expect(skillSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(skillSchema.parse({ offset: 0, page: 'ignored' })).toEqual({ offset: 0, pageSize: 20 });
    expect(skillSchema.parse({ page: '2' })).toEqual({ page: 2, pageSize: 20 });
  });

  it('uses common training-error pagination limits and defaults in validation and documentation', () => {
    const datasetId = '68ad85a7463006c963799a05';
    expect(GetDatasetTrainingErrorBodySchema.parse({ datasetId })).toEqual({
      datasetId,
      pageSize: 20,
      pageNum: 1
    });
    expect(
      GetDatasetTrainingErrorBodySchema.parse({
        datasetId,
        pageSize: `${PaginationPageSizeLimit}`,
        offset: '100001',
        pageNum: -1
      })
    ).toEqual({ datasetId, offset: 100001, pageSize: PaginationPageSizeLimit });
    expect(GetDatasetTrainingErrorBodySchema.parse({ datasetId, pageNum: 5001 })).toEqual({
      datasetId,
      pageNum: 5001,
      pageSize: 20
    });
    expect(
      GetDatasetTrainingErrorBodySchema.parse({
        datasetId,
        pageSize: PaginationPageSizeLimit + 1
      }).pageSize
    ).toBe(PaginationPageSizeLimit);

    const { schema: document } = createSchema(GetDatasetTrainingErrorBodySchema, {
      io: 'input',
      opts: openApiDocumentOptions
    });
    expect(document).toMatchObject({
      anyOf: [
        {
          properties: {
            offset: { maximum: Number.MAX_SAFE_INTEGER },
            pageSize: { maximum: PaginationPageSizeLimit, default: 20 }
          }
        },
        {
          properties: {
            pageNum: { maximum: Number.MAX_SAFE_INTEGER, default: 1 },
            pageSize: { maximum: PaginationPageSizeLimit, default: 20 }
          }
        }
      ]
    });
  });

  it('documents two named modes and hides the non-selected field in each', () => {
    const { schema: document } = createSchema(schema, {
      io: 'input',
      opts: openApiDocumentOptions
    });
    if ('$ref' in document) throw new Error('Unexpected schema reference');
    expect(document.anyOf).toHaveLength(2);
    expect(document.anyOf?.[0]).toMatchObject({
      title: '按偏移量获取',
      required: ['offset'],
      properties: { offset: { example: 0 } }
    });
    expect(document.anyOf?.[0]).not.toHaveProperty('properties.pageNum');
    expect(document.anyOf?.[1]).toMatchObject({
      title: '按页码获取',
      properties: { pageNum: { default: 1 } }
    });
    expect(document.anyOf?.[1]).not.toHaveProperty('properties.offset');
  });
});

describe('resource listV2 query modes', () => {
  const id = '68ad85a7463006c963799a05';
  const cases = [
    { name: 'app', schema: ListAppV2BodySchema, idsKey: 'appIds', pageKey: 'pageNum' },
    {
      name: 'dataset',
      schema: GetDatasetListV2BodySchema,
      idsKey: 'datasetIds',
      pageKey: 'pageNum'
    },
    { name: 'skill', schema: ListSkillsV2QuerySchema, idsKey: 'skillIds', pageKey: 'page' }
  ];

  it.each([
    { schema: GetDatasetListV2BodySchema, idsKey: 'datasetIds' },
    { schema: ListSkillsV2QuerySchema, idsKey: 'skillIds' }
  ])('retains withAppCount in both list modes ($idsKey)', ({ schema, idsKey }) => {
    for (const withAppCount of [true, false]) {
      expect(schema.parse({ withAppCount }).withAppCount).toBe(withAppCount);
      expect(schema.parse({ [idsKey]: [id], withAppCount }).withAppCount).toBe(withAppCount);
    }
  });

  it.each(cases)('$name 的 ID 查询接受 1 到分页上限个 ID', ({ schema, idsKey }) => {
    for (const length of [1, PaginationPageSizeLimit]) {
      const ids = Array.from({ length }, () => id);
      expect(schema.parse({ [idsKey]: ids })).toEqual({ [idsKey]: ids });
    }
  });

  it.each(cases)('$name 的无效 IDs 不会回退为分页查询', ({ schema, idsKey, pageKey }) => {
    for (const ids of [
      [],
      Array.from({ length: PaginationPageSizeLimit + 1 }, () => id),
      [''],
      null,
      id
    ]) {
      expect(schema.safeParse({ [idsKey]: ids }).success).toBe(false);
      expect(
        schema.safeParse({ [idsKey]: ids, parentId: null, [pageKey]: 1, pageSize: 20 }).success
      ).toBe(false);
    }
  });

  it.each(cases)(
    '$name 优先保留 IDs 和公共字段，过滤目录及分页参数',
    ({ schema, idsKey, pageKey }) => {
      const expected = { [idsKey]: [id], searchKey: 'Selected' };
      expect(
        schema.parse({
          ...expected,
          parentId: null,
          [pageKey]: 3,
          pageSize: 1,
          offset: 1000,
          unknownField: 'removed'
        })
      ).toEqual(expected);
      // 被丢弃的字段无需通过校验，也不应在解析结果中残留 undefined 属性。
      expect(
        schema.parse({
          ...expected,
          parentId: 'invalid-parent',
          [pageKey]: -1,
          pageSize: -1,
          offset: -1
        })
      ).toEqual(expected);
    }
  );

  it.each(cases)('$name 不传 IDs 时保留默认列表和分页参数解析', ({ schema, pageKey }) => {
    expect(schema.parse({})).toEqual({ [pageKey]: 1, pageSize: 20 });
    expect(schema.parse({ parentId: id, [pageKey]: '2', pageSize: '20' })).toEqual({
      parentId: id,
      [pageKey]: 2,
      pageSize: 20
    });
    expect(
      schema.parse({ parentId: null, offset: '0', pageSize: PaginationPageSizeLimit })
    ).toEqual({
      parentId: null,
      offset: 0,
      pageSize: PaginationPageSizeLimit
    });
    expect(schema.parse({ offset: 0, [pageKey]: 'ignored', searchKey: 'Selected' })).toEqual({
      offset: 0,
      pageSize: 20,
      searchKey: 'Selected'
    });
  });

  it.each(cases)('$name 的 OpenAPI 区分查询模式并隐藏禁用字段', ({ schema, idsKey, pageKey }) => {
    const { schema: document } = createSchema(schema, {
      io: 'input',
      opts: openApiDocumentOptions
    });
    if ('$ref' in document) throw new Error('Unexpected schema reference');
    expect(document.anyOf).toHaveLength(2);
    expect(JSON.stringify(document).includes('"withAppCount"')).toBe(idsKey !== 'appIds');
    expect(document.anyOf?.[0]).toMatchObject({
      title: '按 IDs 获取',
      required: [idsKey],
      properties: {
        [idsKey]: { minItems: 1, maxItems: PaginationPageSizeLimit }
      }
    });
    for (const key of ['parentId', pageKey, 'pageSize', 'offset']) {
      expect(document.anyOf?.[0]).not.toHaveProperty(`properties.${key}`);
    }
    const pagination = document.anyOf?.[1];
    if (!pagination || '$ref' in pagination) throw new Error('Expected inline pagination schema');
    expect(pagination).toMatchObject({ title: '分页获取' });
    expect(pagination?.anyOf).toHaveLength(2);
    expect(pagination?.anyOf?.[0]).toMatchObject({
      title: '按偏移量获取',
      properties: { offset: { example: 0 } }
    });
    expect(pagination?.anyOf?.[0]).not.toHaveProperty(`properties.${pageKey}`);
    expect(pagination?.anyOf?.[1]).toMatchObject({
      title: '按页码获取',
      properties: { [pageKey]: { default: 1 } }
    });
    expect(pagination?.anyOf?.[1]).not.toHaveProperty('properties.offset');
    pagination?.anyOf?.forEach((branch) => {
      expect(branch).toMatchObject({
        properties: {
          pageSize: { default: 20 },
          parentId: expect.any(Object)
        }
      });
      expect(branch).not.toHaveProperty('properties.parentId.default');
      expect(branch).not.toHaveProperty('properties.offset.default');
      expect(branch).not.toHaveProperty(`properties.${idsKey}`);
    });
  });
});
