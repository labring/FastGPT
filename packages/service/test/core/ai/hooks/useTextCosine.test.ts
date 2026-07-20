import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockCountPromptTokens = vi.hoisted(() => vi.fn(async (text: string) => text.length));

vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countPromptTokens: mockCountPromptTokens
}));

// Mock the model cache lookups used by useTextCosine's default fallback
vi.mock('@fastgpt/service/core/ai/model/cache', () => ({
  assertModelUsable: (model: unknown) => model,
  assertModelActive: () => undefined,

  getEmbeddingModel: vi.fn(),
  getDefaultEmbeddingModel: vi.fn()
}));

import { useTextCosine } from '@fastgpt/service/core/ai/hooks/useTextCosine';
import { getDefaultEmbeddingModel, getEmbeddingModel } from '@fastgpt/service/core/ai/model/cache';
import {
  generateMockEmbedding,
  createMockVectorsResponse,
  generateSimilarVector,
  generateOrthogonalVector,
  mockGetVectors
} from '@test/mocks/core/ai/embedding';

describe('useTextCosine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountPromptTokens.mockImplementation(async (text: string) => text.length);
    const mockModel = {
      model: 'text-embedding-ada-002',
      name: 'text-embedding-ada-002',
      maxToken: 100
    } as any;
    vi.mocked(getEmbeddingModel).mockReturnValue(mockModel);
    vi.mocked(getDefaultEmbeddingModel).mockReturnValue(mockModel);
  });

  describe('lazyGreedyQuerySelection', () => {
    it('should return empty array when candidates is empty', async () => {
      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: {
          model: 'text-embedding-ada-002',
          name: 'text-embedding-ada-002',
          maxToken: 100
        } as any
      });
      const result = await lazyGreedyQuerySelection({
        originalText: 'test query',
        candidates: [],
        k: 3
      });

      expect(result.selectedData).toEqual([]);
      expect(result.embeddingTokens).toBe(0);
      expect(mockGetVectors).not.toHaveBeenCalled();
    });

    it('should select k candidates when k <= candidates.length', async () => {
      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: {
          model: 'text-embedding-ada-002',
          name: 'text-embedding-ada-002',
          maxToken: 100
        } as any
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
        embeddingModel: {
          model: 'text-embedding-ada-002',
          name: 'text-embedding-ada-002',
          maxToken: 100
        } as any
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
        embeddingModel: {
          model: 'text-embedding-ada-002',
          name: 'text-embedding-ada-002',
          maxToken: 100
        } as any
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

      mockGetVectors.mockResolvedValueOnce({
        tokens: 30,
        vectors: [originalVector, differentVector, similarVector]
      });

      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: {
          model: 'text-embedding-ada-002',
          name: 'text-embedding-ada-002',
          maxToken: 100
        } as any
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
        embeddingModel: {
          model: 'text-embedding-ada-002',
          name: 'text-embedding-ada-002',
          maxToken: 100
        } as any
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

    it('should call getVectors with correct parameters', async () => {
      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: { model: 'custom-model', name: 'custom-model', maxToken: 100 } as any
      });
      await lazyGreedyQuerySelection({
        originalText: 'test query',
        candidates: ['candidate'],
        k: 1
      });

      expect(mockGetVectors).toHaveBeenCalledWith({
        modelData: expect.anything(),
        inputs: [
          {
            type: 'text',
            input: 'test query'
          },
          {
            type: 'text',
            input: 'candidate'
          }
        ],
        type: 'query'
      });
    });

    it('should trim original text and skip blank candidates before embedding', async () => {
      const originalVector = generateMockEmbedding('test query');
      const candidateVector = generateSimilarVector(originalVector, 0.9);
      mockGetVectors.mockResolvedValueOnce({
        tokens: 10,
        vectors: [originalVector, candidateVector]
      });

      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: { model: 'custom-model', name: 'custom-model', maxToken: 100 } as any
      });
      const result = await lazyGreedyQuerySelection({
        originalText: ' test query ',
        candidates: [' ', ' candidate ', ''],
        k: 3
      });

      expect(mockGetVectors).toHaveBeenCalledWith({
        modelData: expect.anything(),
        inputs: [
          {
            type: 'text',
            input: 'test query'
          },
          {
            type: 'text',
            input: 'candidate'
          }
        ],
        type: 'query'
      });
      expect(result.selectedData).toEqual(['candidate']);
    });

    it('should pass overlong query and candidates to centralized embedding fallback', async () => {
      const mockFallback = {
        model: 'mock-embedding-model',
        name: 'Mock Embedding Model',
        maxToken: 12
      } as any;
      vi.mocked(getEmbeddingModel).mockReturnValue(mockFallback);
      vi.mocked(getDefaultEmbeddingModel).mockReturnValue(mockFallback);
      mockGetVectors.mockResolvedValueOnce({
        tokens: 10,
        vectors: [
          generateMockEmbedding('abcdefghijklmnopqrstuvwxy'),
          generateMockEmbedding('klmnopqrstuvwxy')
        ]
      });

      // No embedding model passed → falls back to the default model
      const { lazyGreedyQuerySelection } = useTextCosine({ embeddingModel: undefined as any });
      const result = await lazyGreedyQuerySelection({
        originalText: 'abcdefghijklmnopqrstuvwxy',
        candidates: ['klmnopqrstuvwxy'],
        k: 1
      });

      expect(mockGetVectors).toHaveBeenCalledWith({
        modelData: expect.objectContaining({
          model: 'mock-embedding-model'
        }),
        inputs: [
          {
            type: 'text',
            input: 'abcdefghijklmnopqrstuvwxy'
          },
          {
            type: 'text',
            input: 'klmnopqrstuvwxy'
          }
        ],
        type: 'query'
      });
      expect(result.selectedData).toEqual(['klmnopqrstuvwxy']);
    });

    it('should handle identical candidates correctly', async () => {
      const originalVector = generateMockEmbedding('original');
      const identicalVector = generateMockEmbedding('same');

      mockGetVectors.mockResolvedValueOnce({
        tokens: 30,
        vectors: [originalVector, identicalVector, identicalVector, identicalVector]
      });

      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: {
          model: 'text-embedding-ada-002',
          name: 'text-embedding-ada-002',
          maxToken: 100
        } as any
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

      mockGetVectors.mockResolvedValueOnce({
        tokens: 25,
        vectors: [originalVector, similarVector, differentVector]
      });

      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: {
          model: 'text-embedding-ada-002',
          name: 'text-embedding-ada-002',
          maxToken: 100
        } as any
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

      mockGetVectors.mockResolvedValueOnce(mockResponse);

      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: {
          model: 'text-embedding-ada-002',
          name: 'text-embedding-ada-002',
          maxToken: 100
        } as any
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
        embeddingModel: {
          model: 'text-embedding-ada-002',
          name: 'text-embedding-ada-002',
          maxToken: 100
        } as any
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

      mockGetVectors.mockResolvedValueOnce({
        tokens: 40,
        vectors: [originalVector, similar1, similar2, different]
      });

      const { lazyGreedyQuerySelection } = useTextCosine({
        embeddingModel: {
          model: 'text-embedding-ada-002',
          name: 'text-embedding-ada-002',
          maxToken: 100
        } as any
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
