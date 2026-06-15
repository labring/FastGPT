import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema', () => ({
  MongoEvalDatasetData: {
    find: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {
    find: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/ai/rerank', () => ({
  reRankRecall: vi.fn()
}));

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getRerankModelById: vi.fn()
}));

import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { reRankRecall } from '@fastgpt/service/core/ai/rerank';
import { getRerankModelById } from '@fastgpt/service/core/ai/model';
import { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { evaluateRerankModelHelper } from '@fastgpt/service/core/train/rerank/task/helpers/evaluate-model';
import { trainEnv } from '@fastgpt/service/core/train/common/env';

const mockModel = {
  id: 'bge-reranker-v2',
  model: 'bge-reranker-v2',
  requestUrl: 'http://test:8080/rerank',
  requestAuth: 'test-key'
};

function makeEvalItem(userInput: string, expectedContextIds: string[], retrievalList: string[]) {
  return {
    _id: 'item_' + userInput,
    teamId: 'team1',
    tmbId: 'tmb1',
    evalDatasetCollectionId: 'col1',
    userInput,
    expectedContextIds,
    retrievalContextsFull: retrievalList.map((id, i) => ({
      id,
      score: [{ type: 'embedding', value: 1 - i * 0.05, index: 0 }]
    }))
  };
}

/** Build a mock MongoDatasetData.find response from candidate IDs */
function mockDatasetDataFind(ids: string[]) {
  return {
    lean: () => Promise.resolve(ids.map((id) => ({ _id: id, q: `q_${id}`, a: `a_${id}` })))
  };
}

function makeRerankResponse(orderedIds: string[]) {
  return {
    results: orderedIds.map((id, i) => ({ id, score: 1 - i * 0.1 })),
    inputTokens: 100
  };
}

describe('evaluateRerankModelHelper（本地 reranker）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getRerankModelById as any).mockReturnValue(mockModel);
    // Default: auto-generate q/a from any candidate IDs
    (MongoDatasetData.find as any).mockReturnValue({
      lean: () =>
        Promise.resolve(
          ['doc1', 'doc2', 'doc3', 'doc5', 'doc_not_here'].map((id) => ({
            _id: id,
            q: `q_${id}`,
            a: `a_${id}`
          }))
        )
    });
  });

  test('期望文档在重排后第 1 位: MRR = 1.0', async () => {
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () => Promise.resolve([makeEvalItem('query1', ['doc1'], ['doc1', 'doc2', 'doc3'])])
    });
    // reranker 重排后 doc1 在第 1 位
    (reRankRecall as any).mockResolvedValue(makeRerankResponse(['doc1', 'doc2', 'doc3']));

    const { evalResult } = await evaluateRerankModelHelper(
      'task1',
      'evalDataset1',
      'bge-reranker-v2',
      RerankTaskCheckpointStageEnum.eval_basemodel
    );

    expect(evalResult.detailed_results.rerank_top10_mrr).toBeCloseTo(1.0, 4);
  });

  test('重排把期望文档从第 3 位提到第 1 位', async () => {
    // 原始 embedding 结果: [doc2, doc3, doc1] (doc1 在第3)
    // 重排后: [doc1, doc2, doc3] (doc1 在第1)
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () => Promise.resolve([makeEvalItem('q', ['doc1'], ['doc2', 'doc3', 'doc1'])])
    });
    (reRankRecall as any).mockResolvedValue(makeRerankResponse(['doc1', 'doc2', 'doc3']));

    const { evalResult } = await evaluateRerankModelHelper(
      'task1',
      'evalDataset1',
      'bge-reranker-v2',
      RerankTaskCheckpointStageEnum.eval_basemodel
    );

    expect(evalResult.detailed_results.rerank_top10_mrr).toBeCloseTo(1.0, 4);
  });

  test('2 条 query：平均指标计算', async () => {
    // query1: doc1 重排后 rank=1 → MRR=1.0
    // query2: doc3 重排后 rank=3 → MRR=1/3
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () =>
        Promise.resolve([
          makeEvalItem('q1', ['doc1'], ['doc1', 'doc2', 'doc3']),
          makeEvalItem('q2', ['doc3'], ['doc2', 'doc5', 'doc3'])
        ])
    });
    (reRankRecall as any)
      .mockResolvedValueOnce(makeRerankResponse(['doc1', 'doc2', 'doc3']))
      .mockResolvedValueOnce(makeRerankResponse(['doc2', 'doc5', 'doc3']));

    const { evalResult } = await evaluateRerankModelHelper(
      'task1',
      'evalDataset1',
      'bge-reranker-v2',
      RerankTaskCheckpointStageEnum.eval_basemodel
    );

    expect(evalResult.detailed_results.rerank_top10_mrr).toBeCloseTo((1.0 + 1 / 3) / 2, 3);
  });

  test('返回结构包含 NDCG/MAP 等完整字段（与 embedding 对齐）', async () => {
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () => Promise.resolve([makeEvalItem('q', ['doc1'], ['doc1', 'doc2'])])
    });
    (reRankRecall as any).mockResolvedValue(makeRerankResponse(['doc1', 'doc2']));

    const { evalResult } = await evaluateRerankModelHelper(
      'task1',
      'evalDataset1',
      'bge-reranker-v2',
      RerankTaskCheckpointStageEnum.eval_basemodel
    );

    expect(evalResult.detailed_results.rerank_top5_mrr).toBeDefined();
    expect(evalResult.detailed_results.rerank_top5_ndcg).toBeDefined();
    expect(evalResult.detailed_results.rerank_top5_map).toBeDefined();
    expect(evalResult.detailed_results.rerank_top5_precision).toBeDefined();
    expect(evalResult.detailed_results.rerank_top10_mrr).toBeDefined();
    expect(evalResult.detailed_results.overall_mrr).toBeDefined();
    expect(evalResult.retrieval_ranks).toBeDefined();
    expect(evalResult.mrr_scores).toBeDefined();
    expect(evalResult.ndcg_scores).toBeDefined();
    expect(evalResult.map_scores).toBeDefined();
  });

  test('retrieval_ranks 记录重排后的排名', async () => {
    // doc2 重排后 rank=2，doc_not_here 不在列表中
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () =>
        Promise.resolve([makeEvalItem('q', ['doc2', 'doc_not_here'], ['doc1', 'doc2', 'doc3'])])
    });
    (reRankRecall as any).mockResolvedValue(makeRerankResponse(['doc1', 'doc2', 'doc3']));

    const { evalResult } = await evaluateRerankModelHelper(
      'task1',
      'evalDataset1',
      'bge-reranker-v2',
      RerankTaskCheckpointStageEnum.eval_basemodel
    );

    expect(evalResult.retrieval_ranks).toEqual([[2, -1]]);
  });

  test('retrievalContextsFull 为空时跳过该 case', async () => {
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () =>
        Promise.resolve([
          makeEvalItem('q_empty', ['doc1'], []), // 空候选列表
          makeEvalItem('q_has', ['doc1'], ['doc1', 'doc2'])
        ])
    });
    // 只有第二条 query 才调用 reranker
    (reRankRecall as any).mockResolvedValue(makeRerankResponse(['doc1', 'doc2']));

    const { evalResult } = await evaluateRerankModelHelper(
      'task1',
      'evalDataset1',
      'bge-reranker-v2',
      RerankTaskCheckpointStageEnum.eval_basemodel
    );

    expect(evalResult.total_rows).toBe(1); // 只计算有候选列表的 case
  });

  test('eval 数据为空时抛出错误', async () => {
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () => Promise.resolve([])
    });

    await expect(
      evaluateRerankModelHelper(
        'task1',
        'evalDataset1',
        'bge-reranker-v2',
        RerankTaskCheckpointStageEnum.eval_basemodel
      )
    ).rejects.toThrow();
  });

  test('模型不存在时抛出错误', async () => {
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () => Promise.resolve([makeEvalItem('q', ['doc1'], ['doc1'])])
    });
    (getRerankModelById as any).mockReturnValue(undefined);

    await expect(
      evaluateRerankModelHelper(
        'task1',
        'evalDataset1',
        'nonexistent',
        RerankTaskCheckpointStageEnum.eval_basemodel
      )
    ).rejects.toThrow();
  });

  test('pLimit 限制了 reRankRecall 的并发调用数不超过 TRAIN_EVAL_CONCURRENCY', async () => {
    // 构造 50 条 eval item（远超 TRAIN_EVAL_CONCURRENCY=5）
    const items = Array.from({ length: 50 }, (_, i) =>
      makeEvalItem(`q${i}`, [`doc${i}`], [`doc${i}`, `other${i}`])
    );
    (MongoEvalDatasetData.find as any).mockReturnValue({ lean: () => Promise.resolve(items) });

    let current = 0;
    let peak = 0;

    (reRankRecall as any).mockImplementation(async () => {
      current++;
      peak = Math.max(peak, current);
      await new Promise((resolve) => setTimeout(resolve, 5));
      current--;
      return { results: [], inputTokens: 0 };
    });

    await evaluateRerankModelHelper(
      'task1',
      'eval1',
      'bge-reranker-v2',
      RerankTaskCheckpointStageEnum.eval_basemodel
    );

    // TRAIN_EVAL_CONCURRENCY = 5
    expect(peak).toBeLessThanOrEqual(trainEnv.TRAIN_EVAL_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });
});
