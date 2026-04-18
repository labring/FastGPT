import { describe, test, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to set environment variables before all module imports
vi.hoisted(() => {
  process.env.USE_DITING_MOCK = 'true';
  process.env.USE_SFT_BRIDGE_MOCK = 'true';
  // Set mock SFT endpoint env vars so completed tasks return endpoint info
  process.env.MOCK_SFT_RERANK_ENDPOINT_BASE_URL = 'http://test-sft:8080';
  process.env.MOCK_SFT_RERANK_ENDPOINT_MODEL = 'test-rerank-model';
  process.env.MOCK_SFT_RERANK_ENDPOINT_API_KEY = 'test-api-key';
  process.env.MOCK_SFT_EMBED_ENDPOINT_BASE_URL = 'http://test-sft:8080';
  process.env.MOCK_SFT_EMBED_ENDPOINT_MODEL = 'test-embed-model';
  process.env.MOCK_SFT_EMBED_ENDPOINT_API_KEY = 'test-api-key';
});

import {
  synthesizeRerankEvalData,
  createSFTTask,
  querySFTTaskStatus,
  SFTTaskStatus
} from '@fastgpt/service/core/train/rerank/external';

// Mock addLog
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('Rerank Train External Mocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DiTing Service Mocks', () => {
    test('应该成功生成评测数据集', async () => {
      // Directly import the underlying DiTing API mock function
      const { mockSynthesizeEvalData } = await import(
        '@fastgpt/service/core/train/common/external/diting/mock'
      );

      const response = await mockSynthesizeEvalData({
        synthesizerConfig: {
          synthesizerName: 'eval_q_a_synthesizer'
        },
        inputData: {
          context: ['Question 1', 'Answer 1', 'Question 2', 'Answer 2']
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
      expect(response.data?.qaPair).toBeDefined();
      expect(response.data?.qaPair.question).toBeDefined();
      expect(response.data?.qaPair.answer).toBeDefined();
    });

    test('synthesizeEvalData 应通过 index.ts 路由到 mock', async () => {
      const response = await synthesizeRerankEvalData({
        synthesizerConfig: { synthesizerName: 'eval_q_a_synthesizer' },
        inputData: { context: ['context1', 'context2'] },
        llm_config: { name: 'Qwen3-32B' }
      });

      expect(response.success).toBe(true);
      expect(response.requestId).toBeDefined();
      expect(response.data?.qaPair.question).toBeDefined();
    });

    test('当 MOCK_DITING_SYNTH_FAIL=true 时应返回失败响应', async () => {
      const { mockSynthesizeEvalData } = await import(
        '@fastgpt/service/core/train/common/external/diting/mock'
      );

      process.env.MOCK_DITING_SYNTH_FAIL = 'true';
      try {
        const response = await mockSynthesizeEvalData({
          synthesizerConfig: { synthesizerName: 'eval_q_a_synthesizer' },
          inputData: { context: ['Question 1', 'Answer 1'] },
          llm_config: { name: 'Qwen3-32B' }
        });

        expect(response.success).toBe(false);
        expect(response.status).toBe('failed');
        expect(response.error).toBeDefined();
        expect(response.data).toBeUndefined();
      } finally {
        delete process.env.MOCK_DITING_SYNTH_FAIL;
      }
    });
  });

  describe('SFT Bridge Service Mocks', () => {
    test('应该成功创建优化任务', async () => {
      const response = await createSFTTask({
        datasetFile: Buffer.from('mock dataset content'),
        taskType: 'rerank',
        parameters: {
          learning_rate: 0.001,
          epochs: 10,
          batch_size: 32
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
        taskType: 'rerank',
        parameters: {}
      });

      const statusRes = await querySFTTaskStatus({ taskId: createRes.task_id });

      expect(statusRes.task_id).toBe(createRes.task_id);
      expect(statusRes.status).toBe(SFTTaskStatus.created);
      expect(statusRes.progress).toBeDefined();
      expect(typeof statusRes.progress).toBe('number');
      expect(statusRes.progress).toBe(0);
      expect(statusRes.message).toBeDefined();
    });

    test('任务状态应随时间变化', async () => {
      const createRes = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'rerank',
        parameters: {}
      });

      // Should enter running state after 4 seconds
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const runningStatus = await querySFTTaskStatus({ taskId: createRes.task_id });
      expect(runningStatus.status).toBe(SFTTaskStatus.running);
      expect(runningStatus.progress).toBeGreaterThan(0);
      expect(runningStatus.progress).toBeLessThan(80);
    }, 10000); // Increase test timeout

    test('完成后应该返回 endpoint 信息', async () => {
      const createRes = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'rerank',
        parameters: {}
      });

      // Wait 13 seconds to ensure task completion
      await new Promise((resolve) => setTimeout(resolve, 13000));
      const completedStatus = await querySFTTaskStatus({ taskId: createRes.task_id });

      expect(completedStatus.status).toBe(SFTTaskStatus.completed);
      expect(completedStatus.progress).toBe(100);
      expect(completedStatus.endpoint).toBeDefined();
      expect(completedStatus.endpoint?.base_url).toBeDefined();
      expect(completedStatus.endpoint?.model).toBeDefined();
      expect(completedStatus.endpoint?.api_key).toBeDefined();
    }, 15000); // Increase test timeout

    test('查询不存在的任务应返回错误', async () => {
      const response = await querySFTTaskStatus({ taskId: 'non_existent_task_id' });

      expect(response.status).toBe(SFTTaskStatus.failed);
      expect(response.error).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message).toContain('not found');
    });

    test('当 MOCK_SFT_RERANK_FAIL=true 时任务应最终进入 failed 状态', async () => {
      process.env.MOCK_SFT_RERANK_FAIL = 'true';
      try {
        const createRes = await createSFTTask({
          datasetFile: Buffer.from('test'),
          taskType: 'rerank',
          parameters: {}
        });

        // 等待超过 9 秒，进入失败判断分支
        await new Promise((resolve) => setTimeout(resolve, 10000));
        const statusRes = await querySFTTaskStatus({ taskId: createRes.task_id });

        expect(statusRes.status).toBe(SFTTaskStatus.failed);
        expect(statusRes.error).toBeDefined();
        expect(statusRes.endpoint).toBeUndefined();
      } finally {
        delete process.env.MOCK_SFT_RERANK_FAIL;
      }
    }, 12000);

    test('不同任务类型应被正确记录', async () => {
      const rerankTask = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'rerank',
        parameters: {}
      });

      const embedTask = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'embed',
        parameters: {}
      });

      expect(rerankTask.task_id).not.toBe(embedTask.task_id);

      const rerankStatus = await querySFTTaskStatus({ taskId: rerankTask.task_id });
      const embedStatus = await querySFTTaskStatus({ taskId: embedTask.task_id });

      expect(rerankStatus.status).toBe(SFTTaskStatus.created);
      expect(embedStatus.status).toBe(SFTTaskStatus.created);
    });
  });

  describe('Mock 数据一致性', () => {
    test('SFT 完成的任务应返回 endpoint 信息', async () => {
      const createRes = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'rerank',
        parameters: {}
      });

      await new Promise((resolve) => setTimeout(resolve, 13000));
      const completedStatus = await querySFTTaskStatus({ taskId: createRes.task_id });

      // Only verify endpoint exists with required fields; skip exact value checks (mock may vary)
      expect(completedStatus.endpoint).toBeDefined();
      expect(completedStatus.endpoint?.model).toBeDefined();
    }, 15000);
  });
});
