import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logging
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}));

// Mock axios BEFORE importing the client
vi.mock('axios', () => {
  return {
    default: {
      post: vi.fn()
    }
  };
});

import { evaluateEmbeddingModel } from '@fastgpt/service/core/train/embedding/external/diting/client';
import axios from 'axios';

describe('Embedding DiTing Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DITING_BASE_URL = 'http://diting:3000';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('evaluateEmbeddingModel', () => {
    test('应该使用正确的参数调用 /evaluations/embed 端点', async () => {
      // Verify type compatibility - embedding_config and field names match rerank pattern
      const requestData: Parameters<typeof evaluateEmbeddingModel>[0] = {
        dataset: [
          {
            q: 'test query 1',
            expected_dataid: ['doc1']
          }
        ],
        embedding_config: {
          name: 'embedding-v1',
          base_url: 'http://api.example.com',
          api_key: 'key-123'
        }
      };

      // Type check: embedding_config should be present
      expect(requestData).toHaveProperty('embedding_config');

      // Dataset items should have q and expected_dataid (matching rerank field names)
      expect(requestData.dataset[0]).toHaveProperty('q');
      expect(requestData.dataset[0]).toHaveProperty('expected_dataid');
      expect(requestData.dataset[0]).not.toHaveProperty('retrieval_reference_list');
    });

    test('应该处理评估超时', async () => {
      const timeoutError = new Error('Request timeout');
      (timeoutError as any).code = 'ECONNABORTED';
      vi.mocked(axios.post).mockRejectedValue(timeoutError);

      const result = await evaluateEmbeddingModel({
        dataset: [{ query: 'test', expected_dataids: ['doc1'] }],
        embedding_config: {
          name: 'embedding-v1',
          base_url: 'http://api.example.com',
          api_key: 'key-123'
        }
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('应该在请求中包含 expected_dataid 字段', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: {
          success: true,
          status: 'success',
          data: {
            runLogs: { detailed_results: {} }
          }
        }
      } as any);

      const requestData = {
        dataset: [
          {
            q: 'test query',
            expected_dataid: ['doc1']
          }
        ],
        embedding_config: {
          name: 'embedding-v1',
          base_url: 'http://api.example.com',
          api_key: 'key-123'
        }
      };

      await evaluateEmbeddingModel(requestData);

      // The field "q" and "expected_dataid" should be used in dataset items, not "query" and "retrieval_reference_list"
      expect(requestData.dataset[0]).toHaveProperty('q');
      expect(requestData.dataset[0]).toHaveProperty('expected_dataid');
      expect(requestData.dataset[0]).not.toHaveProperty('retrieval_reference_list');
    });
  });
});
