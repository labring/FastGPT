import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useTextCosine } from '@fastgpt/service/core/ai/hooks/useTextCosine';
import {
  generateMockEmbedding,
  createMockVectorsResponse,
  generateSimilarVector,
  generateOrthogonalVector,
  mockGetVectorsByText
} from '../../../../../mocks/core/ai/embedding';

describe('useTextCosine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('lazyGreedyQuerySelection', () => {
    it('should return empty array when candidates is empty', async () => {
      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: 'text-embedding-ada-002'
      });
      const result = await lazyGreedyQuerySelection({
        originalText: 'test query',
        candidates: [],
        k: 3
      });

      expect(result.selectedData).toEqual([]);
    });

    it('should select k candidates when k <= candidates.length', async () => {
      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: 'text-embedding-ada-002'
      });
      const result = await lazyGreedyQuerySelection({
        originalText: 'original text',
        candidates: ['candidate1', 'candidate2', 'candidate3'],
        k: 2
      });

      expect(result.selectedData.length).toBe(2);
    });

    it('should select all candidates when k > candidates.length', async () => {
      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: 'text-embedding-ada-002'
      });
      const result = await lazyGreedyQuerySelection({
        originalText: 'original text',
        candidates: ['candidate1', 'candidate2'],
        k: 5
      });

      expect(result.selectedData.length).toBe(2);
    });

    it('should select single candidate correctly', async () => {
      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: 'text-embedding-ada-002'
      });
      const result = await lazyGreedyQuerySelection({
        originalText: 'original text',
        candidates: ['only candidate'],
        k: 1
      });

      expect(result.selectedData).toEqual(['only candidate']);
    });

    it('should prefer candidates with higher relevance to original text', async () => {
      const originalVector = generateMockEmbedding('original text');
      // Create a candidate very similar to original
      const similarVector = generateSimilarVector(originalVector, 0.95);
      // Create a candidate very different from original
      const differentVector = generateOrthogonalVector(originalVector);

      mockGetVectorsByText.mockResolvedValueOnce({
        tokens: 30,
        vectors: [originalVector, differentVector, similarVector]
      });

      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: 'text-embedding-ada-002'
      });
      const result = await lazyGreedyQuerySelection({
        originalText: 'original text',
        candidates: ['different', 'similar'],
        k: 1,
        alpha: 1.0 // Only consider relevance, not diversity
      });

      // Should select the similar candidate first when alpha=1.0
      expect(result.selectedData[0]).toBe('similar');
    });

    it('should balance relevance and diversity with default alpha', async () => {
      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: 'text-embedding-ada-002'
      });
      const result = await lazyGreedyQuerySelection({
        originalText: 'original text',
        candidates: ['c1', 'c2', 'c3'],
        k: 3,
        alpha: 0.3 // Default alpha
      });

      expect(result.selectedData.length).toBe(3);
      // All candidates should be selected
      expect(result.selectedData).toContain('c1');
      expect(result.selectedData).toContain('c2');
      expect(result.selectedData).toContain('c3');
    });

    it('should call getVectorsByText with correct parameters', async () => {
      const { lazyGreedyQuerySelection } = useTextCosine({ embeddingModel: 'custom-model' });
      await lazyGreedyQuerySelection({
        originalText: 'test query',
        candidates: ['candidate'],
        k: 1
      });

      expect(mockGetVectorsByText).toHaveBeenCalledWith({
        model: expect.anything(),
        input: ['test query', 'candidate'],
        type: 'query'
      });
    });

    it('should handle identical candidates correctly', async () => {
      const originalVector = generateMockEmbedding('original');
      const identicalVector = generateMockEmbedding('same');

      mockGetVectorsByText.mockResolvedValueOnce({
        tokens: 30,
        vectors: [originalVector, identicalVector, identicalVector, identicalVector]
      });

      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: 'text-embedding-ada-002'
      });
      const result = await lazyGreedyQuerySelection({
        originalText: 'original',
        candidates: ['same1', 'same2', 'same3'],
        k: 2
      });

      expect(result.selectedData.length).toBe(2);
    });

    it('should respect alpha parameter for diversity weighting', async () => {
      const originalVector = generateMockEmbedding('original');
      // Create vectors with known similarities
      const similarVector = generateSimilarVector(originalVector, 0.9);
      const differentVector = generateOrthogonalVector(originalVector);

      mockGetVectorsByText.mockResolvedValueOnce({
        tokens: 25,
        vectors: [originalVector, similarVector, differentVector]
      });

      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: 'text-embedding-ada-002'
      });

      // With high alpha (more relevance)
      const resultHighAlpha = await lazyGreedyQuerySelection({
        originalText: 'original',
        candidates: ['similar', 'different'],
        k: 1,
        alpha: 0.9
      });

      expect(resultHighAlpha.selectedData.length).toBe(1);
    });

    it('should return correct embedding tokens', async () => {
      const mockResponse = createMockVectorsResponse(['test', 'candidate']);
      mockResponse.tokens = 12345; // Override tokens for specific test

      mockGetVectorsByText.mockResolvedValueOnce(mockResponse);

      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: 'text-embedding-ada-002'
      });
      const result = await lazyGreedyQuerySelection({
        originalText: 'test',
        candidates: ['candidate'],
        k: 1
      });

      expect(result.embeddingTokens).toBe(12345);
    });

    it('should handle k=0 correctly', async () => {
      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: 'text-embedding-ada-002'
      });
      const result = await lazyGreedyQuerySelection({
        originalText: 'test',
        candidates: ['candidate'],
        k: 0
      });

      expect(result.selectedData).toEqual([]);
    });

    it('should select diverse candidates when alpha is low', async () => {
      const originalVector = generateMockEmbedding('original');
      // Create 3 candidates: 2 similar to each other, 1 different
      const similar1 = generateSimilarVector(originalVector, 0.8);
      const similar2 = generateSimilarVector(similar1, 0.95); // Very close to similar1
      const different = generateOrthogonalVector(originalVector);

      mockGetVectorsByText.mockResolvedValueOnce({
        tokens: 40,
        vectors: [originalVector, similar1, similar2, different]
      });

      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: 'text-embedding-ada-002'
      });
      const result = await lazyGreedyQuerySelection({
        originalText: 'original',
        candidates: ['similar1', 'similar2', 'different'],
        k: 2,
        alpha: 0.1 // Low alpha means more diversity
      });

      expect(result.selectedData.length).toBe(2);
    });
  });
});
