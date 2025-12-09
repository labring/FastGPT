/* 
  根据文本的余弦相似度，获取最大边际收益的检索词。
  Reference: https://github.com/jina-ai/submodular-optimization
*/

import { getVectorsByText } from '../embedding';
import { getEmbeddingModel } from '../model';

class PriorityQueue<T> {
  private heap: Array<{ item: T; priority: number }> = [];

  enqueue(item: T, priority: number): void {
    this.heap.push({ item, priority });
    this.heap.sort((a, b) => b.priority - a.priority);
  }

  dequeue(): T | undefined {
    return this.heap.shift()?.item;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  size(): number {
    return this.heap.length;
  }
}
export const useTextCosine = ({ embeddingModel }: { embeddingModel: string }) => {
  const vectorModel = getEmbeddingModel(embeddingModel);
  // Calculate marginal gain
  const computeMarginalGain = (
    candidateEmbedding: number[],
    selectedEmbeddings: number[][],
    originalEmbedding: number[],
    alpha: number = 0.3
  ): number => {
    // Calculate cosine similarity
    const cosineSimilarity = (a: number[], b: number[]): number => {
      if (a.length !== b.length) {
        throw new Error('Vectors must have the same length');
      }

      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }

      if (normA === 0 || normB === 0) return 0;
      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    if (selectedEmbeddings.length === 0) {
      return alpha * cosineSimilarity(originalEmbedding, candidateEmbedding);
    }

    let maxSimilarity = 0;
    for (const selectedEmbedding of selectedEmbeddings) {
      const similarity = cosineSimilarity(candidateEmbedding, selectedEmbedding);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    const relevance = alpha * cosineSimilarity(originalEmbedding, candidateEmbedding);
    const diversity = 1 - maxSimilarity;

    return relevance + diversity;
  };

  // Lazy greedy query selection algorithm
  const lazyGreedyQuerySelection = async ({
    originalText,
    candidates,
    k,
    alpha = 0.3
  }: {
    originalText: string;
    candidates: string[]; // 候选文本
    k: number;
    alpha?: number;
  }) => {
    const { tokens: embeddingTokens, vectors: embeddingVectors } = await getVectorsByText({
      model: vectorModel,
      input: [originalText, ...candidates],
      type: 'query'
    });

    const originalEmbedding = embeddingVectors[0];
    const candidateEmbeddings = embeddingVectors.slice(1);

    const n = candidates.length;
    const selected: string[] = [];
    const selectedEmbeddings: number[][] = [];

    // Initialize priority queue
    const pq = new PriorityQueue<{ index: number; gain: number }>();

    // Calculate initial marginal gain for all candidates
    for (let i = 0; i < n; i++) {
      const gain = computeMarginalGain(
        candidateEmbeddings[i],
        selectedEmbeddings,
        originalEmbedding,
        alpha
      );
      pq.enqueue({ index: i, gain }, gain);
    }

    // Greedy selection
    for (let iteration = 0; iteration < k; iteration++) {
      if (pq.isEmpty()) break;

      let bestCandidate: { index: number; gain: number } | undefined;

      // Find candidate with maximum marginal gain
      while (!pq.isEmpty()) {
        const candidate = pq.dequeue()!;
        const currentGain = computeMarginalGain(
          candidateEmbeddings[candidate.index],
          selectedEmbeddings,
          originalEmbedding,
          alpha
        );

        if (currentGain >= candidate.gain) {
          bestCandidate = { index: candidate.index, gain: currentGain };
          break;
        } else {
          // Create new object with updated gain to avoid infinite loop
          pq.enqueue({ index: candidate.index, gain: currentGain }, currentGain);
        }
      }

      if (bestCandidate) {
        selected.push(candidates[bestCandidate.index]);
        selectedEmbeddings.push(candidateEmbeddings[bestCandidate.index]);
      }
    }

    return {
      selectedData: selected,
      embeddingTokens
    };
  };

  return {
    lazyGreedyQuerySelection,
    embeddingModel: vectorModel.model
  };
};
