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
  it.each([500, '500'])(
    'accepts the shared page-size limit %j for offset and cursor pagination',
    (pageSize) => {
      expect(PaginationSchema.parse({ pageSize }).pageSize).toBe(500);
      expect(LinkedPaginationSchema().parse({ pageSize }).pageSize).toBe(500);
    }
  );

  it.each([501, '501', 0, -1, 1.5, 'invalid'])(
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

  it('applies the common limit to standalone list APIs and their OpenAPI metadata', () => {
    const query = Object.fromEntries(
      new URLSearchParams(
        'pageNum=1&pageSize=500&channelType=system&requestId=&codeType=all&startTimestamp=1791734400000&endTimestamp=1791907199999'
      )
    );
    expect(GetChannelLogsQuerySchema.parse(query).pageSize).toBe(500);
    expect(GetChannelLogsQuerySchema.safeParse({ ...query, pageSize: '501' }).success).toBe(false);
    expect(ListChannelsQuerySchema.parse({ pageSize: '500' }).pageSize).toBe(500);
    expect(ListChannelsQuerySchema.safeParse({ pageSize: '501' }).success).toBe(false);
    expect(ListChannelsQuerySchema.parse({}).pageSize).toBeUndefined();
    expect(ListSkillsQuerySchema.parse({ pageSize: '500' }).pageSize).toBe(500);
    expect(ListSkillsQuerySchema.safeParse({ pageSize: '501' }).success).toBe(false);
    expect(ListSkillVersionsBodySchema.parse({ skillId: 'skill-1', pageSize: 500 }).pageSize).toBe(
      500
    );
    expect(
      ListSkillVersionsBodySchema.safeParse({ skillId: 'skill-1', pageSize: 501 }).success
    ).toBe(false);
    expect(InvoiceListBodySchema.parse({ pageSize: '500' }).pageSize).toBe(500);
    expect(InvoiceListBodySchema.safeParse({ pageSize: '501' }).success).toBe(false);
    const document = z.toJSONSchema(GetChannelLogsQuerySchema);
    expect(document.properties?.pageSize.maximum).toBe(500);
    expect(document.properties?.pageSize.description).toContain('500');
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
