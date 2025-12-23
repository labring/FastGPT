import { describe, it, expect } from 'vitest';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';

/**
 * 将 synthesis 类型的索引转换为 5x2 的二维数组
 * （复制自 packages/service/core/train/rerank/data/controller.ts 以便测试）
 */
function formatSynthesisIndexesToPairs(indexes: DatasetDataIndexItemType[]): string[][] {
  const synthesisIndexes = indexes.filter(
    (idx) => idx.type === DatasetDataIndexTypeEnum.synthesis && idx.synId !== undefined
  );

  const groupedBySynId = new Map<number, string[]>();
  for (const idx of synthesisIndexes) {
    const synId = idx.synId!;
    if (!groupedBySynId.has(synId)) {
      groupedBySynId.set(synId, []);
    }
    groupedBySynId.get(synId)!.push(idx.text);
  }

  const pairs: string[][] = [];
  for (let synId = 0; synId < 5; synId++) {
    const texts = groupedBySynId.get(synId) || [];
    if (texts.length === 2) {
      pairs.push([texts[0], texts[1]]);
    } else if (texts.length > 0) {
      pairs.push(texts.slice(0, 2));
    }
  }

  return pairs;
}

describe('formatSynthesisIndexesToPairs', () => {
  it('应该正确过滤出 synthesis 类型的索引', () => {
    const indexes: DatasetDataIndexItemType[] = [
      { type: DatasetDataIndexTypeEnum.custom, text: '自定义索引' } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: '问题0', synId: 0 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: '问题1', synId: 0 } as any,
      { type: DatasetDataIndexTypeEnum.hype, text: 'Hype索引' } as any
    ];

    const result = formatSynthesisIndexesToPairs(indexes);

    expect(result.length).toBe(1);
    expect(result[0]).toEqual(['问题0', '问题1']);
  });

  it('应该正确处理完整的 10 个 synthesis 索引（5 对）', () => {
    const indexes: DatasetDataIndexItemType[] = [
      // synId: 0
      { type: DatasetDataIndexTypeEnum.synthesis, text: '什么是AI？', synId: 0 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: 'AI的定义', synId: 0 } as any,
      // synId: 1
      { type: DatasetDataIndexTypeEnum.synthesis, text: '什么是机器学习？', synId: 1 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: '机器学习的概念', synId: 1 } as any,
      // synId: 2
      { type: DatasetDataIndexTypeEnum.synthesis, text: '深度学习是什么？', synId: 2 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: '深度学习的定义', synId: 2 } as any,
      // synId: 3
      { type: DatasetDataIndexTypeEnum.synthesis, text: '神经网络是什么？', synId: 3 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: '神经网络的解释', synId: 3 } as any,
      // synId: 4
      { type: DatasetDataIndexTypeEnum.synthesis, text: '自然语言处理是什么？', synId: 4 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: 'NLP的定义', synId: 4 } as any
    ];

    const result = formatSynthesisIndexesToPairs(indexes);

    expect(result.length).toBe(5);
    expect(result).toEqual([
      ['什么是AI？', 'AI的定义'],
      ['什么是机器学习？', '机器学习的概念'],
      ['深度学习是什么？', '深度学习的定义'],
      ['神经网络是什么？', '神经网络的解释'],
      ['自然语言处理是什么？', 'NLP的定义']
    ]);
  });

  it('应该忽略非 synthesis 类型的索引', () => {
    const indexes: DatasetDataIndexItemType[] = [
      { type: DatasetDataIndexTypeEnum.custom, text: '自定义索引1' } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: '问题0', synId: 0 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: '问题1', synId: 0 } as any,
      { type: DatasetDataIndexTypeEnum.hype, text: 'Hype索引' } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: '问题2', synId: 1 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: '问题3', synId: 1 } as any,
      { type: DatasetDataIndexTypeEnum.small2Big, text: 'Small2Big索引' } as any
    ];

    const result = formatSynthesisIndexesToPairs(indexes);

    expect(result.length).toBe(2);
    expect(result).toEqual([
      ['问题0', '问题1'],
      ['问题2', '问题3']
    ]);
  });

  it('应该按 synId 顺序排列（0-4）', () => {
    // 故意打乱顺序
    const indexes: DatasetDataIndexItemType[] = [
      { type: DatasetDataIndexTypeEnum.synthesis, text: 'Q4-1', synId: 4 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: 'Q0-1', synId: 0 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: 'Q2-1', synId: 2 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: 'Q4-2', synId: 4 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: 'Q1-1', synId: 1 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: 'Q0-2', synId: 0 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: 'Q3-1', synId: 3 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: 'Q2-2', synId: 2 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: 'Q1-2', synId: 1 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: 'Q3-2', synId: 3 } as any
    ];

    const result = formatSynthesisIndexesToPairs(indexes);

    expect(result.length).toBe(5);
    // 结果应该按 synId 0-4 的顺序排列
    expect(result[0]).toEqual(['Q0-1', 'Q0-2']);
    expect(result[1]).toEqual(['Q1-1', 'Q1-2']);
    expect(result[2]).toEqual(['Q2-1', 'Q2-2']);
    expect(result[3]).toEqual(['Q3-1', 'Q3-2']);
    expect(result[4]).toEqual(['Q4-1', 'Q4-2']);
  });

  it('应该处理 synthesis 索引数量不完整的情况', () => {
    // 只有 2 对索引（synId 0 和 1）
    const indexes: DatasetDataIndexItemType[] = [
      { type: DatasetDataIndexTypeEnum.synthesis, text: '问题0', synId: 0 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: '问题1', synId: 0 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: '问题2', synId: 1 } as any,
      { type: DatasetDataIndexTypeEnum.synthesis, text: '问题3', synId: 1 } as any
    ];

    const result = formatSynthesisIndexesToPairs(indexes);

    // 应该只有 2 对，因为 synId 2-4 没有数据
    expect(result.length).toBe(2);
    expect(result).toEqual([
      ['问题0', '问题1'],
      ['问题2', '问题3']
    ]);
  });

  it('应该处理空数组', () => {
    const indexes: DatasetDataIndexItemType[] = [];
    const result = formatSynthesisIndexesToPairs(indexes);
    expect(result).toEqual([]);
  });

  it('应该处理没有 synthesis 索引的情况', () => {
    const indexes: DatasetDataIndexItemType[] = [
      { type: DatasetDataIndexTypeEnum.custom, text: '自定义索引' } as any,
      { type: DatasetDataIndexTypeEnum.hype, text: 'Hype索引' } as any
    ];

    const result = formatSynthesisIndexesToPairs(indexes);
    expect(result).toEqual([]);
  });
});
