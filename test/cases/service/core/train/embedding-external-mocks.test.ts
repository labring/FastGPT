import { describe, test, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to set environment variables before all module imports
vi.hoisted(() => {
  process.env.DITING_MOCK_ENABLE = 'true';
  process.env.SFT_BRIDGE_MOCK_ENABLE = 'true';
  // Set mock SFT endpoint env vars so completed tasks return endpoint info
  process.env.SFT_BRIDGE_MOCK_RERANK_ENDPOINT_BASE_URL = 'http://test-sft:8080';
  process.env.SFT_BRIDGE_MOCK_RERANK_ENDPOINT_MODEL = 'test-rerank-model';
  process.env.SFT_BRIDGE_MOCK_RERANK_ENDPOINT_API_KEY = 'test-api-key';

  process.env.SFT_BRIDGE_MOCK_EMBED_ENDPOINT_BASE_URL = 'http://test-sft:8080';
  process.env.SFT_BRIDGE_MOCK_EMBED_ENDPOINT_MODEL = 'test-embed-model';
  process.env.SFT_BRIDGE_MOCK_EMBED_ENDPOINT_API_KEY = 'test-api-key';
});

import {
  synthesizeEmbeddingEvalData,
  createSFTTask,
  querySFTTaskStatus,
  SFTTaskStatus
} from '@fastgpt/service/core/train/embedding/external';
import { trainEnv } from '@fastgpt/service/core/train/common/env';

// Mock addLog
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('Embedding Train External Mocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DiTing Service Mocks', () => {
    test('应该成功生成评测数据集', async () => {
      const { mockSynthesizeEvalData } = await import(
        '@fastgpt/service/core/train/common/external/diting/mock'
      );

      const response = await mockSynthesizeEvalData({
        synthesizerConfig: {
          synthesizerName: 'eval_q_a_synthesizer'
        },
        inputData: {
          context: ['向量数据库简介', '向量是高维空间中的点', '余弦相似度用于衡量相似性']
        },
        llm_config: {
          name: 'Qwen3-32B',
          timeout: 30
        }
      });

      expect(response.success).toBe(true);
      expect(response.requestId).toBeDefined();
      expect(typeof response.requestId).toBe('string');
      expect(response.status).toBe('success');
      expect(response.data?.qaPairs).toBeDefined();
      expect(Array.isArray(response.data?.qaPairs)).toBe(true);
      expect(response.data?.qaPairs.length).toBeGreaterThan(0);
      expect(response.data?.qaPairs[0].question).toBeDefined();
      expect(response.data?.qaPairs[0].answer).toBeDefined();
      expect(response.usages).toBeDefined();
      expect(response.usages!.length).toBeGreaterThan(0);
    });

    test('synthesizeEvalData 应通过 index.ts 路由到 mock', async () => {
      const response = await synthesizeEmbeddingEvalData({
        inputData: { context: ['context1', 'context2'] },
        llm_config: { name: 'Qwen3-32B' }
      });

      expect(response.success).toBe(true);
      expect(response.requestId).toBeDefined();
      expect(Array.isArray(response.data?.qaPairs)).toBe(true);
      expect(response.data?.qaPairs[0].question).toBeDefined();
    });

    test('当 DITING_MOCK_SYNTH_FAIL=true 时应返回失败响应', async () => {
      const { mockSynthesizeEvalData } = await import(
        '@fastgpt/service/core/train/common/external/diting/mock'
      );

      trainEnv.DITING_MOCK_SYNTH_FAIL = true;
      try {
        const response = await mockSynthesizeEvalData({
          synthesizerConfig: { synthesizerName: 'eval_q_a_synthesizer' },
          inputData: { context: ['向量数据库简介', '向量是高维空间中的点'] },
          llm_config: { name: 'Qwen3-32B' }
        });

        expect(response.success).toBe(false);
        expect(response.status).toBe('failed');
        expect(response.error).toBeDefined();
        expect(response.data).toBeUndefined();
      } finally {
        trainEnv.DITING_MOCK_SYNTH_FAIL = false;
      }
    });
  });

  describe('SFT Bridge Service Mocks (embed taskType)', () => {
    test('应该成功创建 embed 类型的优化任务', async () => {
      const response = await createSFTTask({
        datasetFile: Buffer.from('mock embedding dataset content'),
        taskType: 'embed',
        parameters: {
          learning_rate: 0.0001,
          epochs: 5,
          batch_size: 16
        }
      });

      expect(response.task_id).toBeDefined();
      expect(typeof response.task_id).toBe('string');
      expect(response.task_id.length).toBeGreaterThan(0);
      expect(response.status).toBe('created');
      expect(response.message).toBeDefined();
    });

    test('应该立即查询到 created 状态', async () => {
      const createRes = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'embed',
        parameters: {}
      });

      const statusRes = await querySFTTaskStatus({ taskId: createRes.task_id });

      expect(statusRes.task_id).toBe(createRes.task_id);
      expect(statusRes.status).toBe(SFTTaskStatus.created);
      expect(statusRes.progress).toBe(0);
      expect(statusRes.message).toBeDefined();
    });

    test('任务状态应随时间变化', async () => {
      const createRes = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'embed',
        parameters: {}
      });

      // Should enter running state after ~4 seconds
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const runningStatus = await querySFTTaskStatus({ taskId: createRes.task_id });
      expect(runningStatus.status).toBe(SFTTaskStatus.running);
      expect(runningStatus.progress).toBeGreaterThan(0);
      expect(runningStatus.progress).toBeLessThan(80);
    }, 10000);

    test('完成后应该返回 embed endpoint 信息', async () => {
      const createRes = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'embed',
        parameters: {}
      });

      // Wait 13 seconds to ensure task completion
      await new Promise((resolve) => setTimeout(resolve, 13000));
      const completedStatus = await querySFTTaskStatus({ taskId: createRes.task_id });

      expect(completedStatus.status).toBe(SFTTaskStatus.completed);
      expect(completedStatus.progress).toBe(100);
      expect(completedStatus.endpoint).toBeDefined();
      // Should use MOCK_SFT_EMBED_ENDPOINT_* vars (not rerank vars)
      expect(completedStatus.endpoint?.model).toBe('test-embed-model');
      expect(completedStatus.endpoint?.base_url).toBe('http://test-sft:8080');
    }, 15000);

    test('embed 和 rerank 任务的 endpoint 应该不同', async () => {
      const [rerankTask, embedTask] = await Promise.all([
        createSFTTask({ datasetFile: Buffer.from('test'), taskType: 'rerank', parameters: {} }),
        createSFTTask({ datasetFile: Buffer.from('test'), taskType: 'embed', parameters: {} })
      ]);

      // Wait for both to complete
      await new Promise((resolve) => setTimeout(resolve, 13000));

      const rerankStatus = await querySFTTaskStatus({ taskId: rerankTask.task_id });
      const embedStatus = await querySFTTaskStatus({ taskId: embedTask.task_id });

      expect(rerankStatus.status).toBe(SFTTaskStatus.completed);
      expect(embedStatus.status).toBe(SFTTaskStatus.completed);

      // Model names should differ based on task type
      expect(rerankStatus.endpoint?.model).toBe('test-rerank-model');
      expect(embedStatus.endpoint?.model).toBe('test-embed-model');
    }, 15000);

    test('查询不存在的任务应返回错误', async () => {
      const response = await querySFTTaskStatus({ taskId: 'non_existent_task_id' });

      expect(response.status).toBe(SFTTaskStatus.failed);
      expect(response.error).toBeDefined();
      expect(response.message).toContain('not found');
    });

    test('当 SFT_BRIDGE_MOCK_EMBED_FAIL=true 时任务应最终进入 failed 状态', async () => {
      trainEnv.SFT_BRIDGE_MOCK_EMBED_FAIL = true;
      try {
        const createRes = await createSFTTask({
          datasetFile: Buffer.from('test'),
          taskType: 'embed',
          parameters: {}
        });

        // 等待超过 9 秒，进入失败判断分支
        await new Promise((resolve) => setTimeout(resolve, 10000));
        const statusRes = await querySFTTaskStatus({ taskId: createRes.task_id });

        expect(statusRes.status).toBe(SFTTaskStatus.failed);
        expect(statusRes.error).toBeDefined();
        expect(statusRes.endpoint).toBeUndefined();
      } finally {
        trainEnv.SFT_BRIDGE_MOCK_EMBED_FAIL = false;
      }
    }, 12000);
  });

  describe('Mock 数据一致性', () => {
    test('SFT embed 完成任务应返回正确的 endpoint 信息', async () => {
      const createRes = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'embed',
        parameters: {}
      });

      await new Promise((resolve) => setTimeout(resolve, 13000));
      const completedStatus = await querySFTTaskStatus({ taskId: createRes.task_id });

      expect(completedStatus.endpoint).toBeDefined();
      expect(completedStatus.endpoint?.model).toBeDefined();
      expect(completedStatus.endpoint?.base_url).toBeDefined();
      expect(completedStatus.endpoint?.api_key).toBeDefined();
    }, 15000);
  });
});
