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
  const maxNegativeSamples = request.config.maxNegativeSamples ?? 7;
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
    overall_map: Number(baseMap.toFixed(4))
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
