import { beforeAll, afterAll, beforeEach, describe, test, expect, vi } from 'vitest';
import {
  WorkflowTarget,
  createTargetInstance,
  validateTargetConfig
} from '@fastgpt/service/core/evaluation/target';
import type {
  TargetInput,
  TargetOutput,
  WorkflowConfig,
  EvalTarget
} from '@fastgpt/global/core/evaluation/type';

// Mock dependencies
vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: vi.fn()
  },
  AppCollectionName: 'apps'
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/auth/team', () => ({
  getUserChatInfoAndAuthTeamPoints: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getRunningUserInfoByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/utils', () => ({
  removeDatasetCiteText: vi.fn((text) => text)
}));

// Import mocked functions
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';

describe('WorkflowTarget - Workflow Only Support', () => {
  let workflowTarget: WorkflowTarget;
  let testInput: TargetInput;

  beforeEach(() => {
    vi.clearAllMocks();

    const config: WorkflowConfig = {
      appId: 'test-app-id',
      chatConfig: {}
    };
    workflowTarget = new WorkflowTarget(config);

    testInput = {
      userInput: 'What is the capital of France?',
      context: [],
      globalVariables: { language: 'en' }
    };

    // Setup mocks
    (MongoApp.findById as any).mockResolvedValue({
      _id: 'test-app-id',
      teamId: 'test-team-id',
      tmbId: 'test-tmb-id'
    });

    (getUserChatInfoAndAuthTeamPoints as any).mockResolvedValue({
      timezone: 'UTC',
      externalProvider: null
    });

    (getAppLatestVersion as any).mockResolvedValue({
      nodes: [],
      edges: [],
      chatConfig: {}
    });

    (getRunningUserInfoByTmbId as any).mockResolvedValue({
      user: 'test-user'
    });

    (dispatchWorkFlow as any).mockResolvedValue({
      assistantResponses: [{ text: { content: 'The capital of France is Paris.' } }],
      flowUsages: [{ totalPoints: 10 }]
    });
  });

  test('应该成功执行工作流评估', async () => {
    const result = await workflowTarget.execute(testInput);

    expect(result.actualOutput).toBe('The capital of France is Paris.');
    expect(result.usage).toEqual([{ totalPoints: 10 }]);
    expect(result.responseTime).toBeGreaterThan(0);

    expect(dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { language: 'en' },
        query: expect.arrayContaining([
          expect.objectContaining({
            text: expect.objectContaining({
              content: 'What is the capital of France?'
            })
          })
        ])
      })
    );
  });

  test('应该处理应用不存在的错误', async () => {
    (MongoApp.findById as any).mockResolvedValue(null);

    await expect(workflowTarget.execute(testInput)).rejects.toThrow('App not found');
  });

  test('应该验证工作流配置', async () => {
    (MongoApp.findById as any).mockResolvedValue({ _id: 'test-app-id' });

    const isValid = await workflowTarget.validate();
    expect(isValid).toBe(true);
    expect(MongoApp.findById).toHaveBeenCalledWith('test-app-id');
  });

  test('无效的应用ID应该返回false', async () => {
    (MongoApp.findById as any).mockResolvedValue(null);

    const isValid = await workflowTarget.validate();
    expect(isValid).toBe(false);
  });

  test('验证过程中的错误应该返回false', async () => {
    (MongoApp.findById as any).mockRejectedValue(new Error('Database error'));

    const isValid = await workflowTarget.validate();
    expect(isValid).toBe(false);
  });
});

describe('createTargetInstance', () => {
  test('应该创建工作流目标实例', () => {
    const targetConfig: EvalTarget = {
      type: 'workflow',
      config: {
        appId: 'test-app-id',
        chatConfig: {}
      }
    };

    const instance = createTargetInstance(targetConfig);
    expect(instance).toBeInstanceOf(WorkflowTarget);
  });

  test('不支持的目标类型应该抛出错误', () => {
    const invalidConfig = {
      type: 'unsupported_type',
      config: {}
    } as any;

    expect(() => createTargetInstance(invalidConfig)).toThrow(
      "Unsupported target type: unsupported_type. Only 'workflow' is currently supported."
    );
  });
});

describe('validateTargetConfig', () => {
  test('应该验证有效的工作流配置', async () => {
    (MongoApp.findById as any).mockResolvedValue({ _id: 'test-app-id' });

    const targetConfig: EvalTarget = {
      type: 'workflow',
      config: {
        appId: 'test-app-id',
        chatConfig: {}
      }
    };

    const result = await validateTargetConfig(targetConfig);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Target config is valid and accessible');
  });

  test('应该拒绝无效的工作流配置', async () => {
    (MongoApp.findById as any).mockResolvedValue(null);

    const targetConfig: EvalTarget = {
      type: 'workflow',
      config: {
        appId: 'invalid-app-id',
        chatConfig: {}
      }
    };

    const result = await validateTargetConfig(targetConfig);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Target config validation failed');
  });

  test('应该处理验证错误', async () => {
    const invalidConfig = {
      type: 'invalid_type',
      config: {}
    } as any;

    const result = await validateTargetConfig(invalidConfig);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Unsupported target type');
  });
});
