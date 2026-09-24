import { describe, expect, it } from 'vitest';
import {
  adaptSangforCollectionFilterMatch,
  isSangforDatasetSearchPayload,
  isSangforEmbeddedRef
} from '@fastgpt/service/thirdProvider/sangfor/workflowTagAdapter';

describe('sangfor workflow adapter', () => {
  it('identifies Sangfor search payload and embedded $ref tuples', () => {
    expect(isSangforEmbeddedRef(['$ref', 'node_1', 'out_key'])).toBe(true);
    expect(isSangforEmbeddedRef(['$ref', 'node_1'])).toBe(false);
    expect(isSangforEmbeddedRef(['other', 'node_1', 'out_key'])).toBe(false);

    expect(isSangforDatasetSearchPayload({ tags: { $and: [] } })).toBe(true);
    expect(isSangforDatasetSearchPayload({ tags: { $or: [] } })).toBe(true);
    expect(isSangforDatasetSearchPayload({ tags: { $xor: [] } })).toBe(false);
    expect(isSangforDatasetSearchPayload({ tags: 'invalid' })).toBe(false);
  });

  it('resolves embedded $ref inside JSON strings', () => {
    const resolveReference = (ref: unknown) =>
      Array.isArray(ref) && ref[1] === 'price' ? 42 : undefined;

    expect(
      adaptSangforCollectionFilterMatch({
        value: '{"tags":{"$and":[{"price":{"$gte":["$ref","node","price"]}}]}}',
        resolveReference: resolveReference as any
      })
    ).toBe(JSON.stringify({ tags: { $and: [{ price: { $gte: 42 } }] } }));

    // 无 resolveReference / 解不出值时原样保留
    const unresolved = '{"tags":{"$and":[{"price":{"$gte":["$ref","node","price"]}}]}}';
    expect(adaptSangforCollectionFilterMatch({ value: unresolved })).toBe(unresolved);
    expect(
      adaptSangforCollectionFilterMatch({
        value: unresolved,
        resolveReference: () => undefined
      })
    ).toBe(unresolved);

    // 未解出的引用不能触发重新序列化，需保留调用方原始 JSON 文本
    const formattedUnresolved = `{
  "tags": { "${'$'}and": [{ "price": { "${'$'}gte": ["${'$'}ref", "node", "missing"] } }] }
}`;
    expect(
      adaptSangforCollectionFilterMatch({
        value: formattedUnresolved,
        resolveReference: () => undefined
      })
    ).toBe(formattedUnresolved);

    // 普通数组值不受影响
    const plain = '{"tags":{"$and":[{"category":{"$in":["a","b"]}}]}}';
    expect(
      adaptSangforCollectionFilterMatch({
        value: plain,
        resolveReference: resolveReference as any
      })
    ).toBe(plain);

    expect(
      adaptSangforCollectionFilterMatch({
        value: { tags: { $and: [{ price: { $gte: ['$ref', 'node', 'price'] } }] } },
        resolveReference: resolveReference as any
      })
    ).toBe(JSON.stringify({ tags: { $and: [{ price: { $gte: 42 } }] } }));

    // 历史非对象条件项原样保留，同时继续解析同数组中的合法条件
    expect(
      adaptSangforCollectionFilterMatch({
        value: { tags: { $and: ['legacy', { price: { $gte: ['$ref', 'node', 'price'] } }] } },
        resolveReference: resolveReference as any
      })
    ).toBe(JSON.stringify({ tags: { $and: ['legacy', { price: { $gte: 42 } }] } }));
  });

  it('only resolves $ref on tags conditions and preserves non-tag references', () => {
    const resolveReference = (ref: unknown) =>
      Array.isArray(ref) && ref[1] === 'price' ? 42 : undefined;

    const outsideTags = '{"collectionIds":[["$ref","node","price"]]}';
    expect(
      adaptSangforCollectionFilterMatch({
        value: outsideTags,
        resolveReference: resolveReference as any
      })
    ).toBe(outsideTags);

    expect(
      adaptSangforCollectionFilterMatch({
        value: '{"tags":{"$or":[{"price":{"$lt":["$ref","node","price"]}}]}}',
        resolveReference: resolveReference as any
      })
    ).toBe(JSON.stringify({ tags: { $or: [{ price: { $lt: 42 } }] } }));

    // 非 Sangfor 检索载荷返回 undefined
    expect(adaptSangforCollectionFilterMatch({ value: { tags: { $xor: [] } } })).toBeUndefined();
    expect(
      adaptSangforCollectionFilterMatch({ value: '{"tags":{"$and":"not-array"}}' })
    ).toBeUndefined();
    expect(adaptSangforCollectionFilterMatch({ value: 'open' })).toBeUndefined();
    expect(adaptSangforCollectionFilterMatch({ value: 42 })).toBeUndefined();
  });
});
