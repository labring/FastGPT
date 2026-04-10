// src/adapters/mock/embedding.ts
// Mock Embedding Provider

import type { EmbeddingProvider } from '../../ports/embedding';

export class MockEmbeddingProvider implements EmbeddingProvider {
  public readonly type = 'openai' as const;
  private dimension: number;

  constructor(dimension: number = 1536) {
    this.dimension = dimension;
  }

  async embed(texts: string[]): Promise<{ vectors: number[][]; tokens: number }> {
    const vectors = texts.map(() =>
      Array(this.dimension)
        .fill(0)
        .map(() => Math.random())
    );
    return { vectors, tokens: texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0) };
  }

  getModelInfo() {
    return { name: 'mock-embedding', dimension: this.dimension };
  }
}
