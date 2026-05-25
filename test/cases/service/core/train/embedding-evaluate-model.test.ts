import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock MongoDB model
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema', () => ({
  MongoEvalDatasetData: {
    find: vi.fn()
  }
}));

// Mock dispatchDatasetSearch
vi.mock('@fastgpt/service/core/workflow/dispatch/dataset/search', () => ({
  dispatchDatasetSearch: vi.fn()
}));

// Mock addLog
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// Mock getEmbeddingModel
vi.mock('@fastgpt/service/core/ai/model', () => ({
  getEmbeddingModel: vi.fn()
}));

import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { dispatchDatasetSearch } from '@fastgpt/service/core/workflow/dispatch/dataset/search';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { EmbeddingTaskCheckpointStageEnum } from '@fastgpt/global/core/train/embedding/constants';
import { evaluateEmbeddingModelHelper } from '@fastgpt/service/core/train/embedding/task/helpers/evaluate-model';
import { trainEnv } from '@fastgpt/service/core/train/common/env';

function makeEvalItem(userInput: string, expectedContextIds: string[], datasetId = 'ds1') {
  return {
    _id: 'item_' + userInput,
    teamId: 'team1',
    tmbId: 'tmb1',
    evalDatasetCollectionId: 'col1',
    userInput,
    expectedContextIds,
    retrievalContextsFull: [],
    synthesisMetadata: { sourceDatasetId: datasetId }
  };
}

function makeSearchResponse(orderedDocIds: string[]) {
  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      retrievalResults: orderedDocIds.map((id, i) => ({
        id,
        q: `doc_q_${id}`,
        a: `doc_a_${id}`,
        score: [{ type: 'embedding', value: 1 - i * 0.05, index: 0 }]
      }))
    }
  };
}

describe('evaluateEmbeddingModelHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getEmbeddingModel as any).mockReturnValue({
      model: 'bge-m3',
      baseUrl: 'http://test:8080/v1',
      apiKey: 'test-key'
    });
  });

  test('期望文档在第 1 位时 MRR = 1.0', async () => {
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () => Promise.resolve([makeEvalItem('query1', ['doc1'])])
    });
    (dispatchDatasetSearch as any).mockResolvedValue(makeSearchResponse(['doc1', 'doc2', 'doc3']));

    const { evalResult } = await evaluateEmbeddingModelHelper(
      'task1',
      'evalDataset1',
      'bge-m3',
      EmbeddingTaskCheckpointStageEnum.eval_basemodel,
      'team1',
      'tmb1',
      ['ds1']
    );

    expect(evalResult.detailed_results.embed_top10_mrr).toBeCloseTo(1.0, 4);
    expect(evalResult.detailed_results.embed_top5_mrr).toBeCloseTo(1.0, 4);
  });

  test('2 条 query：平均指标正确计算', async () => {
    // query1: doc1 at rank 1 → MRR=1.0
    // query2: doc3 at rank 3 → MRR=1/3
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () =>
        Promise.resolve([makeEvalItem('query1', ['doc1']), makeEvalItem('query2', ['doc3'])])
    });
    (dispatchDatasetSearch as any)
      .mockResolvedValueOnce(makeSearchResponse(['doc1', 'doc2', 'doc3']))
      .mockResolvedValueOnce(makeSearchResponse(['doc2', 'doc5', 'doc3']));

    const { evalResult } = await evaluateEmbeddingModelHelper(
      'task1',
      'evalDataset1',
      'bge-m3',
      EmbeddingTaskCheckpointStageEnum.eval_basemodel,
      'team1',
      'tmb1',
      ['ds1']
    );

    // MRR@10 = (1.0 + 1/3) / 2 ≈ 0.667
    expect(evalResult.detailed_results.embed_top10_mrr).toBeCloseTo((1.0 + 1 / 3) / 2, 3);
  });

  test('未命中时 MRR = 0', async () => {
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () => Promise.resolve([makeEvalItem('query1', ['expected_not_in_results'])])
    });
    (dispatchDatasetSearch as any).mockResolvedValue(makeSearchResponse(['doc1', 'doc2', 'doc3']));

    const { evalResult } = await evaluateEmbeddingModelHelper(
      'task1',
      'evalDataset1',
      'bge-m3',
      EmbeddingTaskCheckpointStageEnum.eval_basemodel,
      'team1',
      'tmb1',
      ['ds1']
    );

    expect(evalResult.detailed_results.embed_top10_mrr).toBe(0);
  });

  test('返回结构包含所有必要字段', async () => {
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () => Promise.resolve([makeEvalItem('q', ['doc1'])])
    });
    (dispatchDatasetSearch as any).mockResolvedValue(makeSearchResponse(['doc1']));

    const { evalResult } = await evaluateEmbeddingModelHelper(
      'task1',
      'evalDataset1',
      'bge-m3',
      EmbeddingTaskCheckpointStageEnum.eval_basemodel,
      'team1',
      'tmb1',
      ['ds1']
    );

    expect(evalResult.detailed_results).toBeDefined();
    expect(evalResult.detailed_results.embed_top5_mrr).toBeDefined();
    expect(evalResult.detailed_results.embed_top5_ndcg).toBeDefined();
    expect(evalResult.detailed_results.embed_top5_map).toBeDefined();
    expect(evalResult.detailed_results.embed_top5_precision).toBeDefined();
    expect(evalResult.detailed_results.embed_top10_mrr).toBeDefined();
    expect(evalResult.detailed_results.overall_mrr).toBeDefined();
    expect(evalResult.retrieval_ranks).toBeDefined();
    expect(evalResult.mrr_scores).toBeDefined();
    expect(evalResult.ndcg_scores).toBeDefined();
    expect(evalResult.map_scores).toBeDefined();
    expect(evalResult.total_rows).toBe(1);
  });

  test('retrieval_ranks 正确记录每个 expectedId 的排名', async () => {
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () => Promise.resolve([makeEvalItem('q', ['doc2', 'doc_not_here'])])
    });
    // doc2 在 rank=2，doc_not_here 不在结果中
    (dispatchDatasetSearch as any).mockResolvedValue(makeSearchResponse(['doc1', 'doc2', 'doc3']));

    const { evalResult } = await evaluateEmbeddingModelHelper(
      'task1',
      'evalDataset1',
      'bge-m3',
      EmbeddingTaskCheckpointStageEnum.eval_basemodel,
      'team1',
      'tmb1',
      ['ds1']
    );

    expect(evalResult.retrieval_ranks).toEqual([[2, -1]]);
  });

  test('eval 数据为空时抛出 TrainTaskUnrecoverableError', async () => {
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () => Promise.resolve([])
    });

    await expect(
      evaluateEmbeddingModelHelper(
        'task1',
        'evalDataset1',
        'bge-m3',
        EmbeddingTaskCheckpointStageEnum.eval_basemodel,
        'team1',
        'tmb1',
        ['ds1']
      )
    ).rejects.toThrow();
  });

  test('dispatchDatasetSearch 调用时携带正确的 vectorModel', async () => {
    const modelConfig = { model: 'bge-m3', baseUrl: 'http://test:8080/v1', apiKey: 'test-key' };
    (getEmbeddingModel as any).mockReturnValue(modelConfig);
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () => Promise.resolve([makeEvalItem('query1', ['doc1'])])
    });
    (dispatchDatasetSearch as any).mockResolvedValue(makeSearchResponse(['doc1']));

    await evaluateEmbeddingModelHelper(
      'task1',
      'evalDataset1',
      'bge-m3',
      EmbeddingTaskCheckpointStageEnum.eval_basemodel,
      'team1',
      'tmb1',
      ['ds1', 'ds2']
    );

    const callArgs = (dispatchDatasetSearch as any).mock.calls[0][0];
    expect(callArgs.params.datasets).toEqual([
      { datasetId: 'ds1', avatar: '', name: '', vectorModel: modelConfig },
      { datasetId: 'ds2', avatar: '', name: '', vectorModel: modelConfig }
    ]);
  });

  test('模型不存在时抛出 TrainTaskUnrecoverableError', async () => {
    (MongoEvalDatasetData.find as any).mockReturnValue({
      lean: () => Promise.resolve([makeEvalItem('q', ['doc1'])])
    });
    (getEmbeddingModel as any).mockReturnValue(undefined);

    await expect(
      evaluateEmbeddingModelHelper(
        'task1',
        'evalDataset1',
        'nonexistent-model',
        EmbeddingTaskCheckpointStageEnum.eval_basemodel,
        'team1',
        'tmb1',
        ['ds1']
      )
    ).rejects.toThrow();
  });

  test('pLimit 限制了 dispatchDatasetSearch 的并发调用数不超过 TRAIN_EVAL_CONCURRENCY', async () => {
    const items = Array.from({ length: 50 }, (_, i) => makeEvalItem(`q${i}`, [`doc${i}`]));
    (MongoEvalDatasetData.find as any).mockReturnValue({ lean: () => Promise.resolve(items) });

    let current = 0;
    let peak = 0;

    (dispatchDatasetSearch as any).mockImplementation(async () => {
      current++;
      peak = Math.max(peak, current);
      await new Promise((resolve) => setTimeout(resolve, 5));
      current--;
      return makeSearchResponse([]);
    });

    await evaluateEmbeddingModelHelper(
      'task1',
      'eval1',
      'text-embedding-3-small',
      EmbeddingTaskCheckpointStageEnum.eval_basemodel,
      'team1',
      'tmb1',
      ['ds1']
    );

    expect(peak).toBeLessThanOrEqual(trainEnv.TRAIN_EVAL_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });
});
