import { describe, it, expect } from 'vitest';
import { formatEmbeddingQuery } from '@fastgpt/service/core/ai/embedding/index';

describe('formatEmbeddingQuery', () => {
  it('无 instruction 时返回原始 queries', () => {
    expect(formatEmbeddingQuery(['hello world'])).toEqual(['hello world']);
    expect(formatEmbeddingQuery(['hello world'], undefined)).toEqual(['hello world']);
    expect(formatEmbeddingQuery(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('有 instruction 时返回 Instruct 格式化的 queries', () => {
    const result = formatEmbeddingQuery(
      ['hello world'],
      'Given a web search query, retrieve relevant passages'
    );
    expect(result).toEqual([
      'Instruct: Given a web search query, retrieve relevant passages\nQuery: hello world'
    ]);
  });

  it('批量 queries 时每个都格式化', () => {
    const result = formatEmbeddingQuery(
      ['query1', 'query2', 'query3'],
      'Given a web search query, retrieve relevant passages'
    );
    expect(result).toEqual([
      'Instruct: Given a web search query, retrieve relevant passages\nQuery: query1',
      'Instruct: Given a web search query, retrieve relevant passages\nQuery: query2',
      'Instruct: Given a web search query, retrieve relevant passages\nQuery: query3'
    ]);
  });
});
