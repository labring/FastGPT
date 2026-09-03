import { describe, expect, it } from 'vitest';
import {
  RetrievalTraceBranchNameEnum,
  RetrievalTraceStageNameEnum,
  RetrievalTraceStageStatusEnum,
  SearchScoreTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { RetrievalTraceSchema } from '@fastgpt/global/core/dataset/type';
import { DispatchNodeResponseSchema } from '@fastgpt/global/core/workflow/runtime/type';

describe('RetrievalTraceSchema', () => {
  const trace = {
    branches: [
      {
        name: RetrievalTraceBranchNameEnum.text,
        stages: [
          {
            name: RetrievalTraceStageNameEnum.textEmbeddingRecall,
            count: 3,
            scoreType: SearchScoreTypeEnum.embedding,
            minScore: 0.4,
            maxScore: 0.9
          },
          {
            name: RetrievalTraceStageNameEnum.rerank,
            count: 3,
            status: RetrievalTraceStageStatusEnum.fallback
          }
        ]
      }
    ],
    pipeline: [{ name: RetrievalTraceStageNameEnum.mergedCandidates, count: 3 }]
  };

  it('shares the same schema with persisted workflow responses', () => {
    expect(RetrievalTraceSchema.parse(trace)).toEqual(trace);
    expect(DispatchNodeResponseSchema.parse({ retrievalTrace: trace }).retrievalTrace).toEqual(
      trace
    );
  });

  it('rejects unknown branch and stage names', () => {
    expect(
      RetrievalTraceSchema.safeParse({
        branches: [{ name: 'unknown', stages: [] }],
        pipeline: [{ name: 'dynamicStage', count: 1 }]
      }).success
    ).toBe(false);
  });
});
