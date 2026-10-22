import { describe, expect, it } from 'vitest';
import {
  LinkedListResponseSchema,
  LinkedPaginationSchema,
  PaginationSchema
} from '../../openapi/api';
import {
  GetChannelLogsQuerySchema,
  ListChannelsQuerySchema
} from '../../openapi/core/ai/model/channel/api';
import {
  ListSkillsQuerySchema,
  ListSkillVersionsBodySchema
} from '../../openapi/core/ai/skill/api';
import { InvoiceListBodySchema } from '../../openapi/admin/wallet/bill/invoice/api';
import { SearchDatasetSynonymMappingsBodySchema } from '../../openapi/core/dataset/synonym/api';
import z from 'zod';

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

  it('keeps omitted page sizes optional or defaulted and allows explicit business limits', () => {
    expect(PaginationSchema.parse({})).toEqual({});
    expect(LinkedPaginationSchema().parse({}).pageSize).toBe(10);
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

  it('caps standalone list APIs and preserves their OpenAPI limit metadata', () => {
    const query = Object.fromEntries(
      new URLSearchParams(
        'pageNum=1&pageSize=500&channelType=system&requestId=&codeType=all&startTimestamp=1791734400000&endTimestamp=1791907199999'
      )
    );
    expect(GetChannelLogsQuerySchema.parse(query).pageSize).toBe(500);
    expect(GetChannelLogsQuerySchema.parse({ ...query, pageSize: '501' }).pageSize).toBe(500);
    expect(ListChannelsQuerySchema.parse({ pageSize: '500' }).pageSize).toBe(500);
    expect(ListChannelsQuerySchema.parse({ pageSize: '501' }).pageSize).toBe(500);
    expect(ListChannelsQuerySchema.parse({}).pageSize).toBeUndefined();
    expect(ListSkillsQuerySchema.parse({ pageSize: '500' }).pageSize).toBe(500);
    expect(ListSkillsQuerySchema.parse({ pageSize: '501' }).pageSize).toBe(500);
    expect(ListSkillVersionsBodySchema.parse({ skillId: 'skill-1', pageSize: 500 }).pageSize).toBe(
      500
    );
    expect(ListSkillVersionsBodySchema.parse({ skillId: 'skill-1', pageSize: 501 }).pageSize).toBe(
      500
    );
    expect(InvoiceListBodySchema.parse({ pageSize: '500' }).pageSize).toBe(500);
    expect(InvoiceListBodySchema.parse({ pageSize: '501' }).pageSize).toBe(500);
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
