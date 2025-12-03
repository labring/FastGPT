import { vi } from 'vitest';

/**
 * Mock embedding generation utilities for testing
 */

/**
 * Generate a deterministic normalized vector based on text content
 * Uses a simple hash-based approach to ensure same text produces same vector
 */
export const generateMockEmbedding = (text: string, dimension: number = 1536): number[] => {
  // Simple hash function to generate seed from text
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Generate vector using seeded random
  const vector: number[] = [];
  let seed = Math.abs(hash);
  for (let i = 0; i < dimension; i++) {
    // Linear congruential generator
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    vector.push((seed / 0x7fffffff) * 2 - 1); // Range [-1, 1]
  }

  // Normalize the vector (L2 norm = 1)
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map((val) => val / norm);
};

/**
 * Generate multiple mock embeddings for a list of texts
 */
export const generateMockEmbeddings = (texts: string[], dimension: number = 1536): number[][] => {
  return texts.map((text) => generateMockEmbedding(text, dimension));
};

/**
 * Create a mock response for getVectorsByText
 */
export const createMockVectorsResponse = (
  texts: string | string[],
  dimension: number = 1536
): { tokens: number; vectors: number[][] } => {
  const textArray = Array.isArray(texts) ? texts : [texts];
  const vectors = generateMockEmbeddings(textArray, dimension);

  // Estimate tokens (roughly 1 token per 4 characters)
  const tokens = textArray.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);

  return { tokens, vectors };
};

/**
 * Generate a vector similar to another vector with controlled similarity
 * @param baseVector - The base vector to create similarity from
 * @param similarity - Target cosine similarity (0-1), higher means more similar
 */
export const generateSimilarVector = (baseVector: number[], similarity: number = 0.9): number[] => {
  const dimension = baseVector.length;
  const noise = generateMockEmbedding(`noise_${Date.now()}_${Math.random()}`, dimension);

  // Interpolate between base vector and noise
  const vector = baseVector.map((val, i) => val * similarity + noise[i] * (1 - similarity));

  // Normalize
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map((val) => val / norm);
};

/**
 * Generate a vector orthogonal (dissimilar) to the given vector
 */
export const generateOrthogonalVector = (baseVector: number[]): number[] => {
  const dimension = baseVector.length;
  const randomVector = generateMockEmbedding(`orthogonal_${Date.now()}`, dimension);

  // Gram-Schmidt orthogonalization
  const dotProduct = baseVector.reduce((sum, val, i) => sum + val * randomVector[i], 0);
  const vector = randomVector.map((val, i) => val - dotProduct * baseVector[i]);

  // Normalize
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map((val) => val / norm);
};

/**
 * Mock implementation for getVectorsByText
 * Automatically generates embeddings based on input text
 */
export const mockGetVectorsByText = vi.fn(
  async ({
    input,
    type
  }: {
    model: any;
    input: string[] | string;
    type?: string;
  }): Promise<{ tokens: number; vectors: number[][] }> => {
    const texts = Array.isArray(input) ? input : [input];
    return createMockVectorsResponse(texts);
  }
);

/**
 * Setup global mock for embedding module
 */
vi.mock('@fastgpt/service/core/ai/embedding', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getVectorsByText: mockGetVectorsByText
  };
});

/**
 * Setup global mock for AI model module
 */
vi.mock('@fastgpt/service/core/ai/model', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getEmbeddingModel: vi.fn().mockReturnValue({
      model: 'text-embedding-ada-002',
      name: 'text-embedding-ada-002'
    })
  };
});
