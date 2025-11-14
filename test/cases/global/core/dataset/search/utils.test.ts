import { describe, it, expect } from 'vitest';
import { datasetSearchResultConcat } from '@fastgpt/global/core/dataset/search/utils';
import { SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';

describe('datasetSearchResultConcat', () => {
  // Helper function to create test data
  const createSearchItem = (
    id: string,
    q: string,
    scores: { type: `${SearchScoreTypeEnum}`; value: number; index: number }[] = []
  ): SearchDataResponseItemType => ({
    id,
    datasetId: 'dataset1',
    collectionId: 'collection1',
    sourceName: 'source1',
    sourceId: 'source1',
    q,
    a: `Answer for ${q}`,
    chunkIndex: 0,
    updateTime: new Date(),
    score: scores
  });

  describe('Edge cases', () => {
    it('should handle empty array', () => {
      const result = datasetSearchResultConcat([]);
      expect(result).toEqual([]);
    });

    it('should handle all empty lists', () => {
      const input = [
        { weight: 1.0, list: [] },
        { weight: 0.5, list: [] }
      ];
      const result = datasetSearchResultConcat(input);
      expect(result).toEqual([]);
    });

    it('should handle only one non-empty list', () => {
      const items = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 }
        ]),
        createSearchItem('2', 'Question 2', [
          { type: SearchScoreTypeEnum.embedding, value: 0.8, index: 1 }
        ])
      ];

      const input = [
        { weight: 1.0, list: items },
        { weight: 0.5, list: [] }
      ];

      const result = datasetSearchResultConcat(input);
      expect(result).toEqual(items);
    });
  });

  describe('RRF algorithm tests', () => {
    it('should calculate RRF scores correctly', () => {
      const items1 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 }
        ]),
        createSearchItem('2', 'Question 2', [
          { type: SearchScoreTypeEnum.embedding, value: 0.8, index: 1 }
        ])
      ];

      const items2 = [
        createSearchItem('2', 'Question 2', [
          { type: SearchScoreTypeEnum.fullText, value: 0.7, index: 0 }
        ]),
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.fullText, value: 0.6, index: 1 }
        ])
      ];

      const input = [
        { weight: 1.0, list: items1 },
        { weight: 1.0, list: items2 }
      ];

      const result = datasetSearchResultConcat(input);

      // Verify RRF score calculation
      // item1: 1.0 * (1/(60+1)) + 1.0 * (1/(60+2)) = 1/61 + 1/62 ≈ 0.0163934 + 0.0161290 ≈ 0.0325224
      // item2: 1.0 * (1/(60+2)) + 1.0 * (1/(60+1)) = 1/62 + 1/61 ≈ 0.0161290 + 0.0163934 ≈ 0.0325224

      expect(result).toHaveLength(2);

      // Verify RRF scores are added
      result.forEach((item) => {
        const rrfScore = item.score.find((s) => s.type === SearchScoreTypeEnum.rrf);
        expect(rrfScore).toBeDefined();
        expect(rrfScore!.value).toBeCloseTo(0.0325224, 6);
      });
    });

    it('should weight RRF scores correctly', () => {
      const items1 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 }
        ])
      ];

      const items2 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.fullText, value: 0.7, index: 0 }
        ])
      ];

      const input = [
        { weight: 2.0, list: items1 }, // Higher weight
        { weight: 1.0, list: items2 }
      ];

      const result = datasetSearchResultConcat(input);

      expect(result).toHaveLength(1);

      const rrfScore = result[0].score.find((s) => s.type === SearchScoreTypeEnum.rrf);
      expect(rrfScore).toBeDefined();

      // Should be: 2.0 * (1/61) + 1.0 * (1/61) = 3.0 * (1/61) ≈ 0.0491803
      expect(rrfScore!.value).toBeCloseTo(3.0 / 61, 6);
    });
  });

  describe('Score merging tests', () => {
    it('should merge different score types correctly', () => {
      const items1 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 },
          { type: SearchScoreTypeEnum.reRank, value: 0.8, index: 0 }
        ])
      ];

      const items2 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.fullText, value: 0.7, index: 0 }
        ])
      ];

      const input = [
        { weight: 1.0, list: items1 },
        { weight: 1.0, list: items2 }
      ];

      const result = datasetSearchResultConcat(input);

      expect(result).toHaveLength(1);
      expect(result[0].score).toHaveLength(4); // embedding, reRank, fullText, rrf

      // Verify all score types exist
      const scoreTypes = result[0].score.map((s) => s.type);
      expect(scoreTypes).toContain(SearchScoreTypeEnum.embedding);
      expect(scoreTypes).toContain(SearchScoreTypeEnum.fullText);
      expect(scoreTypes).toContain(SearchScoreTypeEnum.reRank);
      expect(scoreTypes).toContain(SearchScoreTypeEnum.rrf);
    });

    it('should take max value for same score types', () => {
      const items1 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 }
        ])
      ];

      const items2 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.embedding, value: 0.7, index: 0 } // Lower score
        ])
      ];

      const input = [
        { weight: 1.0, list: items1 },
        { weight: 1.0, list: items2 }
      ];

      const result = datasetSearchResultConcat(input);

      expect(result).toHaveLength(1);

      const embeddingScore = result[0].score.find((s) => s.type === SearchScoreTypeEnum.embedding);
      expect(embeddingScore).toBeDefined();
      expect(embeddingScore!.value).toBe(0.9); // Should take higher value
    });
  });

  describe('Sorting tests', () => {
    it('should sort by RRF score descending', () => {
      const items1 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 }
        ]),
        createSearchItem('2', 'Question 2', [
          { type: SearchScoreTypeEnum.embedding, value: 0.8, index: 1 }
        ]),
        createSearchItem('3', 'Question 3', [
          { type: SearchScoreTypeEnum.embedding, value: 0.7, index: 2 }
        ])
      ];

      const items2 = [
        createSearchItem('3', 'Question 3', [
          { type: SearchScoreTypeEnum.fullText, value: 0.9, index: 0 }
        ]), // First position, higher RRF
        createSearchItem('2', 'Question 2', [
          { type: SearchScoreTypeEnum.fullText, value: 0.8, index: 1 }
        ]),
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.fullText, value: 0.7, index: 2 }
        ]) // Third position, lower RRF
      ];

      const input = [
        { weight: 1.0, list: items1 },
        { weight: 1.0, list: items2 }
      ];

      const result = datasetSearchResultConcat(input);

      expect(result).toHaveLength(3);

      // Verify descending RRF score order
      for (let i = 0; i < result.length - 1; i++) {
        const currentRrf = result[i].score.find((s) => s.type === SearchScoreTypeEnum.rrf)!.value;
        const nextRrf = result[i + 1].score.find((s) => s.type === SearchScoreTypeEnum.rrf)!.value;
        expect(currentRrf).toBeGreaterThanOrEqual(nextRrf);
      }

      // item1 and item3 have same RRF score, but item1 should be first due to stable sort order
      expect(['1', '3']).toContain(result[0].id);
    });
  });

  describe('RRF score update tests', () => {
    it('should update existing RRF scores when multiple lists', () => {
      const items1 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 },
          { type: SearchScoreTypeEnum.rrf, value: 0.5, index: 0 } // Existing RRF score
        ])
      ];

      const items2 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.fullText, value: 0.7, index: 0 }
        ])
      ];

      const input = [
        { weight: 1.0, list: items1 },
        { weight: 1.0, list: items2 }
      ];

      const result = datasetSearchResultConcat(input);

      expect(result).toHaveLength(1);

      const rrfScores = result[0].score.filter((s) => s.type === SearchScoreTypeEnum.rrf);
      expect(rrfScores).toHaveLength(1); // Should only have one RRF score

      // RRF score should be updated to calculated value, not the original 0.5
      expect(rrfScores[0].value).not.toBe(0.5);
      expect(rrfScores[0].value).toBeCloseTo(1.0 / 61 + 1.0 / 61, 6);
      expect(rrfScores[0].index).toBe(0); // Index after sorting
    });

    it('should add RRF score for items without one when multiple lists', () => {
      const items1 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 }
          // No RRF score
        ])
      ];

      const items2 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.fullText, value: 0.7, index: 0 }
        ])
      ];

      const input = [
        { weight: 1.0, list: items1 },
        { weight: 1.0, list: items2 }
      ];

      const result = datasetSearchResultConcat(input);

      expect(result).toHaveLength(1);

      const rrfScore = result[0].score.find((s) => s.type === SearchScoreTypeEnum.rrf);
      expect(rrfScore).toBeDefined();
      expect(rrfScore!.value).toBeCloseTo(1.0 / 61 + 1.0 / 61, 6);
      expect(rrfScore!.index).toBe(0);
    });

    it('should not modify single list (direct return)', () => {
      const items1 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 }
        ])
      ];

      const input = [{ weight: 1.0, list: items1 }];

      const result = datasetSearchResultConcat(input);

      expect(result).toHaveLength(1);
      expect(result).toEqual(items1); // Should be exactly the same as input

      // Should not have RRF score because single list is returned directly
      const rrfScore = result[0].score.find((s) => s.type === SearchScoreTypeEnum.rrf);
      expect(rrfScore).toBeUndefined();
    });
  });

  describe('Complex scenario tests', () => {
    it('should handle complex multi-source merging', () => {
      const embeddingResults = [
        createSearchItem('doc1', 'AI Introduction', [
          { type: SearchScoreTypeEnum.embedding, value: 0.95, index: 0 }
        ]),
        createSearchItem('doc2', 'Machine Learning Basics', [
          { type: SearchScoreTypeEnum.embedding, value: 0.9, index: 1 }
        ]),
        createSearchItem('doc3', 'Deep Learning Principles', [
          { type: SearchScoreTypeEnum.embedding, value: 0.85, index: 2 }
        ])
      ];

      const fullTextResults = [
        createSearchItem('doc2', 'Machine Learning Basics', [
          { type: SearchScoreTypeEnum.fullText, value: 0.88, index: 0 }
        ]),
        createSearchItem('doc4', 'Neural Network Applications', [
          { type: SearchScoreTypeEnum.fullText, value: 0.82, index: 1 }
        ]),
        createSearchItem('doc1', 'AI Introduction', [
          { type: SearchScoreTypeEnum.fullText, value: 0.78, index: 2 }
        ])
      ];

      const reRankResults = [
        createSearchItem('doc3', 'Deep Learning Principles', [
          { type: SearchScoreTypeEnum.reRank, value: 0.92, index: 0 }
        ]),
        createSearchItem('doc1', 'AI Introduction', [
          { type: SearchScoreTypeEnum.reRank, value: 0.89, index: 1 }
        ])
      ];

      const input = [
        { weight: 1.0, list: embeddingResults },
        { weight: 0.8, list: fullTextResults },
        { weight: 1.2, list: reRankResults }
      ];

      const result = datasetSearchResultConcat(input);

      // Should have 4 unique documents
      expect(result).toHaveLength(4);

      // Verify all documents have RRF scores
      result.forEach((item) => {
        const rrfScore = item.score.find((s) => s.type === SearchScoreTypeEnum.rrf);
        expect(rrfScore).toBeDefined();
        expect(rrfScore!.value).toBeGreaterThan(0);
      });

      // Verify merged scores
      const doc1 = result.find((item) => item.id === 'doc1')!;
      const doc1ScoreTypes = doc1.score.map((s) => s.type);
      expect(doc1ScoreTypes).toContain(SearchScoreTypeEnum.embedding);
      expect(doc1ScoreTypes).toContain(SearchScoreTypeEnum.fullText);
      expect(doc1ScoreTypes).toContain(SearchScoreTypeEnum.reRank);
      expect(doc1ScoreTypes).toContain(SearchScoreTypeEnum.rrf);

      // Verify sorting by RRF score descending
      for (let i = 0; i < result.length - 1; i++) {
        const currentRrf = result[i].score.find((s) => s.type === SearchScoreTypeEnum.rrf)!.value;
        const nextRrf = result[i + 1].score.find((s) => s.type === SearchScoreTypeEnum.rrf)!.value;
        expect(currentRrf).toBeGreaterThanOrEqual(nextRrf);
      }
    });
  });

  describe('Edge weight tests', () => {
    it('should handle zero weight', () => {
      const items1 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 }
        ])
      ];

      const items2 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.fullText, value: 0.7, index: 0 }
        ])
      ];

      const input = [
        { weight: 0, list: items1 },
        { weight: 1.0, list: items2 }
      ];

      const result = datasetSearchResultConcat(input);

      expect(result).toHaveLength(1);

      const rrfScore = result[0].score.find((s) => s.type === SearchScoreTypeEnum.rrf);
      expect(rrfScore).toBeDefined();
      expect(rrfScore!.value).toBeCloseTo(1.0 / 61, 6); // Only from second list
    });

    it('should handle negative weight', () => {
      const items1 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 }
        ])
      ];

      const items2 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.fullText, value: 0.7, index: 0 }
        ])
      ];

      const input = [
        { weight: -1.0, list: items1 },
        { weight: 1.0, list: items2 }
      ];

      const result = datasetSearchResultConcat(input);

      expect(result).toHaveLength(1);

      const rrfScore = result[0].score.find((s) => s.type === SearchScoreTypeEnum.rrf);
      expect(rrfScore).toBeDefined();
      // Should be: -1.0 * (1/61) + 1.0 * (1/61) = 0
      expect(rrfScore!.value).toBeCloseTo(0, 6);
    });

    it('should handle very small weight', () => {
      const items1 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 }
        ])
      ];

      const items2 = [
        createSearchItem('1', 'Question 1', [
          { type: SearchScoreTypeEnum.fullText, value: 0.7, index: 0 }
        ])
      ];

      const input = [
        { weight: 0.001, list: items1 },
        { weight: 1.0, list: items2 }
      ];

      const result = datasetSearchResultConcat(input);

      expect(result).toHaveLength(1);

      const rrfScore = result[0].score.find((s) => s.type === SearchScoreTypeEnum.rrf);
      expect(rrfScore).toBeDefined();
      expect(rrfScore!.value).toBeCloseTo(0.001 / 61 + 1.0 / 61, 6);
    });
  });
});
