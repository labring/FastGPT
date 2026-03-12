import type {
  DiTingSyntheticRerankTrainDatasRequest,
  DiTingSyntheticRerankTrainDatasResponse,
  DiTingSyntheticRerankEvalDataRequest,
  DiTingSyntheticRerankEvalDataResponse,
  DiTingEvaluateRerankRequest,
  DiTingEvaluateRerankResponse
} from './types';
import { addLog } from '../../../../../common/system/log';

/**
 * Mock implementation of rerank training data synthesis from dataset chunks (batch)
 * Real implementation should call DiTing's synthetic_rerank_train_data API
 *
 * @param request - Contains samples and configuration for data generation
 * @returns Generated training data samples
 */
export async function mockSynthesizeRerankTrainDatas(
  request: DiTingSyntheticRerankTrainDatasRequest
): Promise<DiTingSyntheticRerankTrainDatasResponse> {
  addLog.info('[MOCK] DiTing synthesize rerank train datas', {
    sampleCount: request.samples.length,
    config: request.config
  });

  await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000));

  const minNegativeSamples = request.config.minNegativeSamples ?? 1;
  const maxNegativeSamples = request.config.maxNegativeSamples ?? 5;
  const includeOriginalQ = request.config.includeOriginalQ ?? true;

  const allIndexTexts: string[] = [];
  const allDocuments: string[] = [];

  request.samples.forEach((sample) => {
    if (sample.indexes && Array.isArray(sample.indexes)) {
      sample.indexes.forEach((pair) => {
        if (Array.isArray(pair)) {
          pair.forEach((text) => {
            if (typeof text === 'string' && text) {
              allIndexTexts.push(text);
            }
          });
        }
      });
    }
    if (sample.q) allDocuments.push(sample.q);
    if (sample.a) allDocuments.push(sample.a);
  });

  const mockData: DiTingSyntheticRerankTrainDatasResponse['data'] = [];

  request.samples.forEach((sample) => {
    const questionText = sample.q || 'Sample question text';
    const answerText = sample.a || '';

    if (sample.indexes && Array.isArray(sample.indexes) && sample.indexes.length > 0) {
      sample.indexes.forEach((pair, pairIdx: number) => {
        if (Array.isArray(pair) && pair.length > 0) {
          pair.forEach((doc, docIdx: number) => {
            if (typeof doc === 'string' && doc) {
              const query = doc;
              const otherDoc = pair[(docIdx + 1) % pair.length];
              const positiveDoc = otherDoc || answerText || questionText;

              const negativeCount = Math.floor(
                Math.random() * (maxNegativeSamples - minNegativeSamples + 1) + minNegativeSamples
              );
              const negativeDocs: string[] = [];
              const availableNegatives = allDocuments.filter(
                (d) => d !== positiveDoc && d !== query
              );

              for (let i = 0; i < Math.min(negativeCount, availableNegatives.length); i++) {
                const randomIndex = Math.floor(Math.random() * availableNegatives.length);
                negativeDocs.push(availableNegatives[randomIndex]);
              }

              const trainingSample: DiTingSyntheticRerankTrainDatasResponse['data'][number] = {
                query,
                positive: [positiveDoc],
                negatives: negativeDocs,
                sourceId: sample.dataId,
                datasetId: sample.datasetId,
                metadata: {
                  pair_index: pairIdx,
                  source_type: 'synthesis_pair',
                  negative_count: negativeDocs.length
                }
              };

              if (includeOriginalQ) {
                trainingSample.originalQ = sample.q;
                trainingSample.originalA = sample.a;
              }

              mockData.push(trainingSample);
            }
          });
        }
      });
    } else {
      const negativeCount = Math.floor(
        Math.random() * (maxNegativeSamples - minNegativeSamples + 1) + minNegativeSamples
      );
      const negativeDocs: string[] = [];

      const availableNegatives = allDocuments.filter(
        (doc) => doc !== questionText && doc !== answerText
      );

      if (availableNegatives.length > 0) {
        for (let i = 0; i < Math.min(negativeCount, availableNegatives.length); i++) {
          const randomIndex = Math.floor(Math.random() * availableNegatives.length);
          negativeDocs.push(availableNegatives[randomIndex]);
        }
      } else {
        for (let i = 0; i < negativeCount; i++) {
          negativeDocs.push(`Negative sample ${i + 1}: Unrelated content`);
        }
      }

      const trainingSample: DiTingSyntheticRerankTrainDatasResponse['data'][number] = {
        query: questionText,
        positive: answerText ? [answerText] : [questionText],
        negatives: negativeDocs,
        sourceId: sample.dataId,
        datasetId: sample.datasetId,
        metadata: {
          pair_index: 0,
          source_type: 'qa_pair',
          negative_count: negativeDocs.length
        }
      };

      if (includeOriginalQ) {
        trainingSample.originalQ = sample.q;
        trainingSample.originalA = sample.a;
      }

      mockData.push(trainingSample);
    }
  });

  return {
    success: true,
    data: mockData
  };
}

/**
 * Mock implementation of single evaluation data synthesis (QA pair)
 * Real implementation should call DiTing's dataset-synthesis/runs API
 *
 * @param request - Contains synthesizer config, input data, and LLM config
 * @returns Generated QA pair and metadata
 */
export async function mockSynthesizeRerankEvalData(
  request: DiTingSyntheticRerankEvalDataRequest
): Promise<DiTingSyntheticRerankEvalDataResponse> {
  addLog.info('[MOCK] DiTing synthesize eval data', {
    synthesizerName: request.synthesizerConfig.synthesizerName,
    contextLength: request.inputData.context.length,
    llmModel: request.llm_config.name
  });

  await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000));

  const contextText = request.inputData.context.join('\n');
  const question = `Question based on: ${contextText.slice(0, 50)}...`;
  const answer = `Answer based on context: ${contextText.slice(0, 100)}...`;

  return {
    success: true,
    requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    status: 'success',
    data: {
      qaPair: {
        question,
        answer
      },
      metadata: {
        synthesizer: request.synthesizerConfig.synthesizerName
      }
    },
    usages: [
      {
        modelType: request.llm_config.name,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      }
    ]
  };
}

/**
 * Mock implementation of rerank model evaluation
 * Real implementation should call DiTing's evaluate_rerank API
 *
 * @param request - Contains dataset, reranker config, and metric config
 * @returns Evaluation metrics and detailed results
 */
export async function mockEvaluateRerankModel(
  request: DiTingEvaluateRerankRequest
): Promise<DiTingEvaluateRerankResponse> {
  addLog.info('[MOCK] DiTing evaluate rerank model', {
    datasetSize: request.dataset.length,
    rerankModel: request.reranker_config.name
  });

  await new Promise((resolve) => setTimeout(resolve, 3000 + Math.random() * 2000));

  const baseNdcg = 0.65 + Math.random() * 0.15;
  const baseMrr = 0.7 + Math.random() * 0.15;
  const basePrecision = 0.6 + Math.random() * 0.15;
  const baseRecall = 0.55 + Math.random() * 0.15;
  const baseMap = 0.7 + Math.random() * 0.1;

  // Generate retrieval ranks for each case (case-by-case)
  // Simulate rerank effect: expected documents should appear at various positions
  // to reflect realistic evaluation metrics
  const retrievalRanks: number[][] = request.dataset.map((item) => {
    const expectedIds = item.expected_dataid || [];
    const retrievalList = item.retrieval_reference_list || [];

    // Simulate reranked positions for each expected document
    const ranks: number[] = [];
    expectedIds.forEach((expectedId, index) => {
      const originalPosition = retrievalList.findIndex((doc) => doc.id === expectedId);

      if (originalPosition === -1) {
        // Expected document not found in retrieval list
        ranks.push(-1);
      } else {
        // Simulate rerank effect: move expected documents closer to top with some randomness
        // Distribution: 60% top-5, 30% top-10, 10% top-15+
        const random = Math.random();
        let rerankPosition: number;

        if (random < 0.6) {
          // 60% chance: rank 1-5 (good rerank)
          rerankPosition = Math.floor(Math.random() * 5) + 1;
        } else if (random < 0.9) {
          // 30% chance: rank 6-10 (medium rerank)
          rerankPosition = Math.floor(Math.random() * 5) + 6;
        } else {
          // 10% chance: rank 11-20 (poor rerank or difficult case)
          rerankPosition = Math.floor(Math.random() * 10) + 11;
        }

        // For the first expected document (best match), bias towards better ranks
        if (index === 0) {
          rerankPosition = Math.floor(Math.random() * 3) + 1; // 80% rank 1-3
        }

        ranks.push(rerankPosition);
      }
    });

    return ranks.length > 0 ? ranks : [-1]; // At least one rank per case
  });

  const detailedResults = {
    rerank_top5_mrr: Number(baseMrr.toFixed(4)),
    rerank_top5_ndcg: Number(baseNdcg.toFixed(4)),
    rerank_top5_map: Number(baseMap.toFixed(4)),
    rerank_top5_precision: Number(basePrecision.toFixed(4)),
    rerank_top10_mrr: Number(baseMrr.toFixed(4)),
    rerank_top10_ndcg: Number(baseNdcg.toFixed(4)),
    rerank_top10_map: Number(baseMap.toFixed(4)),
    rerank_top10_precision: Number(basePrecision.toFixed(4)),
    rerank_top10_recall: Number(baseRecall.toFixed(4)),
    rerank_top15_mrr: Number(baseMrr.toFixed(4)),
    rerank_top15_ndcg: Number(baseNdcg.toFixed(4)),
    rerank_top15_map: Number(baseMap.toFixed(4)),
    rerank_top15_precision: Number(basePrecision.toFixed(4)),
    overall_mrr: Number(baseMrr.toFixed(4)),
    overall_ndcg: Number(baseNdcg.toFixed(4)),
    overall_map: Number(baseMap.toFixed(4)),
    overall_precision: Number(basePrecision.toFixed(4))
  };

  // Generate metric scores for each case at different k values
  const mrrScores: Record<string, number[]> = {
    'mrr@5': request.dataset.map(() => Number((baseMrr + (Math.random() - 0.5) * 0.15).toFixed(4))),
    'mrr@10': request.dataset.map(() =>
      Number((baseMrr + (Math.random() - 0.5) * 0.15).toFixed(4))
    ),
    'mrr@15': request.dataset.map(() => Number((baseMrr + (Math.random() - 0.5) * 0.15).toFixed(4)))
  };

  const ndcgScores: Record<string, number[]> = {
    'ndcg@5': request.dataset.map(() =>
      Number((baseNdcg + (Math.random() - 0.5) * 0.12).toFixed(4))
    ),
    'ndcg@10': request.dataset.map(() =>
      Number((baseNdcg + (Math.random() - 0.5) * 0.12).toFixed(4))
    ),
    'ndcg@15': request.dataset.map(() =>
      Number((baseNdcg + (Math.random() - 0.5) * 0.12).toFixed(4))
    )
  };

  const mapScores: Record<string, number[]> = {
    'map@5': request.dataset.map(() => Number((baseMap + (Math.random() - 0.5) * 0.1).toFixed(4))),
    'map@10': request.dataset.map(() => Number((baseMap + (Math.random() - 0.5) * 0.1).toFixed(4))),
    'map@15': request.dataset.map(() => Number((baseMap + (Math.random() - 0.5) * 0.1).toFixed(4)))
  };

  return {
    success: true,
    requestId: `eval-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    status: 'success',
    data: {
      metricName: 'rerank_metric',
      score: detailedResults.rerank_top10_mrr,
      reason: `Processed ${request.dataset.length} items; rerank_top10: MRR=${detailedResults.rerank_top10_mrr}, NDCG=${detailedResults.rerank_top10_ndcg}, Precision=${detailedResults.rerank_top10_precision}`,
      runLogs: {
        detailed_results: detailedResults,
        mrr_scores: mrrScores,
        ndcg_scores: ndcgScores,
        map_scores: mapScores,
        retrieval_ranks: retrievalRanks,
        total_rows: request.dataset.length,
        expect_count: request.dataset.length
      }
    },
    usages: [
      {
        modelType: 'rerank',
        promptTokens: null,
        completionTokens: null,
        totalTokens: request.dataset.length * 10
      }
    ]
  };
}
