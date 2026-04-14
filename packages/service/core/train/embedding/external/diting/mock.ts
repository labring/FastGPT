import type {
  DiTingSyntheticEmbeddingTrainDatasRequest,
  DiTingSyntheticEmbeddingTrainDatasResponse,
  DiTingSyntheticEmbeddingEvalDataRequest,
  DiTingSyntheticEmbeddingEvalDataResponse,
  DiTingEvaluateEmbeddingRequest,
  DiTingEvaluateEmbeddingResponse
} from './types';
import { addLog } from '../../../../../common/system/log';

/**
 * Mock implementation of embedding training data synthesis from dataset chunks (batch)
 * Real implementation should call DiTing's synthetic_embedding_train_data API
 *
 * @param request - Contains samples and configuration for data generation
 * @returns Generated training data samples
 */
export async function mockSynthesizeEmbeddingTrainDatas(
  request: DiTingSyntheticEmbeddingTrainDatasRequest
): Promise<DiTingSyntheticEmbeddingTrainDatasResponse> {
  addLog.debug('[MOCK] DiTing synthesize embedding train datas', {
    sampleCount: request.samples.length,
    config: request.config
  });

  await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

  const minNegativeSamples = request.config.minNegativeSamples ?? 1;
  const maxNegativeSamples = request.config.maxNegativeSamples ?? 5;
  const includeOriginalQ = request.config.includeOriginalQ ?? true;

  // Collect all document texts as negative sample candidates
  const allDocuments: string[] = [];
  request.samples.forEach((sample) => {
    if (sample.q) allDocuments.push(sample.q);
    if (sample.a) allDocuments.push(sample.a);
  });

  const mockData: DiTingSyntheticEmbeddingTrainDatasResponse['data'] = [];

  request.samples.forEach((sample) => {
    const questionText = sample.q || 'Sample question text';
    const answerText = sample.a || '';

    if (sample.indexes && Array.isArray(sample.indexes) && sample.indexes.length > 0) {
      // indexes format: string[][] (each pair is [query_variant, positive_doc])
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
              const availableNegatives = allDocuments.filter(
                (d) => d !== positiveDoc && d !== query
              );
              const negativeDocs: string[] = [];
              for (let i = 0; i < Math.min(negativeCount, availableNegatives.length); i++) {
                const randomIndex = Math.floor(Math.random() * availableNegatives.length);
                negativeDocs.push(availableNegatives[randomIndex]);
              }

              const trainingSample: DiTingSyntheticEmbeddingTrainDatasResponse['data'][number] = {
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
      // Fallback: use q/a pair directly as query/positive
      const negativeCount = Math.floor(
        Math.random() * (maxNegativeSamples - minNegativeSamples + 1) + minNegativeSamples
      );
      const availableNegatives = allDocuments.filter(
        (doc) => doc !== questionText && doc !== answerText
      );
      const negativeDocs: string[] = [];

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

      const trainingSample: DiTingSyntheticEmbeddingTrainDatasResponse['data'][number] = {
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
export async function mockSynthesizeEmbeddingEvalData(
  request: DiTingSyntheticEmbeddingEvalDataRequest
): Promise<DiTingSyntheticEmbeddingEvalDataResponse> {
  addLog.debug('[MOCK] DiTing synthesize embedding eval data', {
    synthesizerName: request.synthesizerConfig.synthesizerName,
    contextLength: request.inputData.context.length,
    llmModel: request.llm_config.name
  });

  await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

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
 * Mock implementation of embedding model evaluation
 * Real implementation should call DiTing's evaluate_embedding API (/evaluations/embed)
 *
 * Simulates realistic retrieval rank distributions for each query:
 * - 60% chance: rank 1-3 (good retrieval)
 * - 30% chance: rank 4-8 (medium retrieval)
 * - 10% chance: rank 9-20 (poor retrieval or difficult case)
 *
 * @param request - Contains dataset with queries and expected data IDs
 * @returns Evaluation metrics (MRR, Precision) and per-case retrieval ranks
 */
export async function mockEvaluateEmbeddingModel(
  request: DiTingEvaluateEmbeddingRequest
): Promise<DiTingEvaluateEmbeddingResponse> {
  addLog.debug('[MOCK] DiTing evaluate embedding model', {
    datasetSize: request.dataset.length,
    embeddingModel: request.embedding_config.name
  });

  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 300));

  const baseMrr = 0.65 + Math.random() * 0.2;
  const basePrecision = 0.6 + Math.random() * 0.2;

  // Simulate retrieval ranks for each query (one rank per expected_dataid)
  const retrievalRanks: number[][] = request.dataset.map((item) => {
    const expectedIds = item.expected_dataid || [];

    return expectedIds.map((_, index) => {
      const random = Math.random();
      let rank: number;

      if (random < 0.6) {
        // 60%: top 3 (good retrieval)
        rank = Math.floor(Math.random() * 3) + 1;
      } else if (random < 0.9) {
        // 30%: rank 4-8 (medium)
        rank = Math.floor(Math.random() * 5) + 4;
      } else {
        // 10%: rank 9-20 (poor)
        rank = Math.floor(Math.random() * 12) + 9;
      }

      // First expected doc biased toward better ranks
      if (index === 0) {
        rank = Math.floor(Math.random() * 3) + 1;
      }

      return rank;
    });
  });

  const detailedResults = {
    embed_top5_mrr: Number(baseMrr.toFixed(4)),
    embed_top5_precision: Number(basePrecision.toFixed(4)),
    embed_top10_mrr: Number((baseMrr * 0.95).toFixed(4)),
    embed_top10_precision: Number((basePrecision * 0.9).toFixed(4)),
    embed_top15_mrr: Number((baseMrr * 0.92).toFixed(4)),
    embed_top15_precision: Number((basePrecision * 0.85).toFixed(4)),
    overall_mrr: Number(baseMrr.toFixed(4)),
    overall_precision: Number(basePrecision.toFixed(4))
  };

  const mrrScores: Record<string, number[]> = {
    'mrr@5': request.dataset.map(() => Number((baseMrr + (Math.random() - 0.5) * 0.15).toFixed(4))),
    'mrr@10': request.dataset.map(() =>
      Number((baseMrr * 0.95 + (Math.random() - 0.5) * 0.15).toFixed(4))
    ),
    'mrr@15': request.dataset.map(() =>
      Number((baseMrr * 0.92 + (Math.random() - 0.5) * 0.15).toFixed(4))
    )
  };

  const precisionScores: Record<string, number[]> = {
    'precision@5': request.dataset.map(() =>
      Number((basePrecision + (Math.random() - 0.5) * 0.12).toFixed(4))
    ),
    'precision@10': request.dataset.map(() =>
      Number((basePrecision * 0.9 + (Math.random() - 0.5) * 0.12).toFixed(4))
    ),
    'precision@15': request.dataset.map(() =>
      Number((basePrecision * 0.85 + (Math.random() - 0.5) * 0.12).toFixed(4))
    )
  };

  return {
    success: true,
    requestId: `eval-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    status: 'success',
    data: {
      metricName: 'embed_metric',
      score: detailedResults.embed_top10_mrr,
      reason: `Processed ${request.dataset.length} items; embed_top10: MRR=${detailedResults.embed_top10_mrr}, Precision=${detailedResults.embed_top10_precision}`,
      runLogs: {
        detailed_results: detailedResults,
        mrr_scores: mrrScores,
        precision_scores: precisionScores,
        retrieval_ranks: retrievalRanks,
        total_rows: request.dataset.length,
        expect_count: request.dataset.length
      }
    },
    usages: [
      {
        modelType: 'embedding',
        promptTokens: null,
        completionTokens: null,
        totalTokens: request.dataset.length * 10
      }
    ]
  };
}
