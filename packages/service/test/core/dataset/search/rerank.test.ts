import { describe, expect, it } from 'vitest';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import {
  buildSynonymAwareRerankDocument,
  buildSynonymAwareRerankQuery
} from '../../../../core/dataset/search/defaultRecall/rerank';

const baseItem = {
  id: '68ee0bd23d17260b7829b137',
  updateTime: new Date(),
  q: 'Apple 手机退款',
  a: '请提交订单号',
  datasetId: '68ee0bd23d17260b7829b138',
  collectionId: '68ee0bd23d17260b7829b139',
  sourceId: '68ee0bd23d17260b7829b140',
  sourceName: '退款说明',
  score: []
} satisfies SearchDataResponseItemType;

describe('synonym-aware rerank context', () => {
  it('keeps the original query before the expanded query and removes duplicates', () => {
    expect(
      buildSynonymAwareRerankQuery({
        originalQuery: '苹果手机怎么退款',
        expandedQuery: '苹果手机怎么退款 Apple 水果'
      })
    ).toBe('苹果手机怎么退款\n苹果手机怎么退款 Apple 水果');

    expect(
      buildSynonymAwareRerankQuery({
        originalQuery: 'same query',
        expandedQuery: 'same query'
      })
    ).toBe('same query');
  });

  it('adds only chunk mappings to the rerank document', () => {
    expect(
      buildSynonymAwareRerankDocument({
        ...baseItem,
        synonymMappings: [
          {
            mappingId: '68ee0bd23d17260b7829b141',
            datasetId: baseItem.datasetId,
            fileVersion: 2,
            matchedTerm: '苹果',
            standardizedTerm: 'Apple'
          }
        ]
      })
    ).toBe('Apple 手机退款\n请提交订单号\n\n同义词：苹果 = Apple');
  });

  it('does not append an empty synonym section', () => {
    expect(buildSynonymAwareRerankDocument(baseItem)).toBe('Apple 手机退款\n请提交订单号');
  });
});
