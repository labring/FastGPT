import { describe, expect, it } from 'vitest';
import { LinkedListResponseSchema, LinkedPaginationSchema } from '../../openapi/api';
import z from 'zod';

describe('shared API schemas', () => {
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
