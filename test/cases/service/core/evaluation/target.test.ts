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
  getAppVersionById: vi.fn()
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

vi.mock('@fastgpt/service/core/chat/saveChat', () => ({
  saveChat: vi.fn()
}));

// Import mocked functions
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getAppVersionById } from '@fastgpt/service/core/app/version/controller';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

describe('WorkflowTarget - Workflow Only Support', () => {
  let workflowTarget: WorkflowTarget;
  let testInput: TargetInput;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Date.now to ensure predictable responseTime
    const mockStartTime = 1000000000000;
    const mockEndTime = mockStartTime + 1500; // 1.5 seconds later
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(mockStartTime) // First call in execute()
      .mockReturnValueOnce(mockEndTime); // Second call in execute()

    const config: WorkflowConfig = {
      appId: 'test-app-id',
      chatConfig: {}
    };
    workflowTarget = new WorkflowTarget(config);

    testInput = {
      userInput: 'What is the capital of France?',
      context: [],
      targetCallParams: { variables: { language: 'en' } }
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

    (getAppVersionById as any).mockResolvedValue({
      versionId: 'test-version-id',
      versionName: 'Test Version',
      nodes: [],
      edges: [],
      chatConfig: {}
    });

    (getRunningUserInfoByTmbId as any).mockResolvedValue({
      user: 'test-user'
    });

    (dispatchWorkFlow as any).mockResolvedValue({
      assistantResponses: [{ text: { content: 'The capital of France is Paris.' } }],
      flowUsages: [{ totalPoints: 10 }],
      flowResponses: [],
      system_memories: [],
      durationSeconds: 1.5
    });
  });

  test('应该成功执行工作流评估', async () => {
    const result = await workflowTarget.execute(testInput);

    expect(result.actualOutput).toBe('The capital of France is Paris.');
    expect(result.usage).toEqual([{ totalPoints: 10 }]);
    expect(result.responseTime).toBe(1500); // 1.5 seconds as mocked

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

    await expect(workflowTarget.execute(testInput)).rejects.toThrow(
      EvaluationErrEnum.evalAppNotFound
    );
  });

  test('应该使用指定版本执行工作流评估', async () => {
    const configWithVersion: WorkflowConfig = {
      appId: 'test-app-id',
      versionId: 'test-version-id',
      chatConfig: {}
    };
    const workflowTargetWithVersion = new WorkflowTarget(configWithVersion);

    const result = await workflowTargetWithVersion.execute(testInput);

    expect(result.actualOutput).toBe('The capital of France is Paris.');
    expect(getAppVersionById).toHaveBeenCalledWith({
      appId: 'test-app-id',
      versionId: 'test-version-id',
      app: expect.objectContaining({
        _id: 'test-app-id',
        teamId: 'test-team-id',
        tmbId: 'test-tmb-id'
      })
    });
  });

  test('应该验证工作流配置', async () => {
    (MongoApp.findById as any).mockResolvedValue({ _id: 'test-app-id', name: 'Test App' });

    const result = await workflowTarget.validate();
    expect(result.isValid).toBe(true);
    expect(result.message).toContain('Test App');
    expect(MongoApp.findById).toHaveBeenCalledWith('test-app-id');
  });

  test('无效的应用ID应该返回false', async () => {
    (MongoApp.findById as any).mockResolvedValue(null);

    const result = await workflowTarget.validate();
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('not found or not accessible');
  });

  test('验证过程中的错误应该返回false', async () => {
    (MongoApp.findById as any).mockRejectedValue(new Error('Database error'));

    const result = await workflowTarget.validate();
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('Database error');
  });

  test('应该验证指定版本的工作流配置', async () => {
    const configWithVersion: WorkflowConfig = {
      appId: 'test-app-id',
      versionId: 'test-version-id'
    };
    const workflowTargetWithVersion = new WorkflowTarget(configWithVersion);

    (MongoApp.findById as any).mockResolvedValue({ _id: 'test-app-id', name: 'Test App' });
    (getAppVersionById as any).mockResolvedValue({
      versionId: 'test-version-id',
      versionName: 'Test Version',
      nodes: [],
      edges: [],
      chatConfig: {}
    });

    const result = await workflowTargetWithVersion.validate();
    expect(result.isValid).toBe(true);
    expect(result.message).toContain('Test App');
    expect(getAppVersionById).toHaveBeenCalledWith({
      appId: 'test-app-id',
      versionId: 'test-version-id',
      app: { _id: 'test-app-id', name: 'Test App' }
    });
  });

  test('指定的版本不存在时应该返回false', async () => {
    const configWithVersion: WorkflowConfig = {
      appId: 'test-app-id',
      versionId: 'invalid-version-id'
    };
    const workflowTargetWithVersion = new WorkflowTarget(configWithVersion);

    (MongoApp.findById as any).mockResolvedValue({ _id: 'test-app-id', name: 'Test App' });
    (getAppVersionById as any).mockResolvedValue({
      versionId: 'latest-version-id', // Different from specified versionId, indicating fallback to latest
      versionName: 'Latest Version',
      nodes: [],
      edges: [],
      chatConfig: {}
    });

    const result = await workflowTargetWithVersion.validate();
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('invalid-version-id');
    expect(result.message).toContain('not found');
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

  test('应该创建带版本ID的工作流目标实例', () => {
    const targetConfig: EvalTarget = {
      type: 'workflow',
      config: {
        appId: 'test-app-id',
        versionId: 'test-version-id',
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
      EvaluationErrEnum.evalUnsupportedTargetType
    );
  });
});

describe('validateTargetConfig', () => {
  test('应该验证有效的工作流配置', async () => {
    (MongoApp.findById as any).mockResolvedValue({ _id: 'test-app-id', name: 'Test App' });

    const targetConfig: EvalTarget = {
      type: 'workflow',
      config: {
        appId: 'test-app-id',
        chatConfig: {}
      }
    };

    const result = await validateTargetConfig(targetConfig);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Test App');
  });

  test('应该验证带版本ID的有效工作流配置', async () => {
    (MongoApp.findById as any).mockResolvedValue({ _id: 'test-app-id', name: 'Test App' });
    (getAppVersionById as any).mockResolvedValue({
      versionId: 'test-version-id',
      versionName: 'Test Version',
      nodes: [],
      edges: [],
      chatConfig: {}
    });

    const targetConfig: EvalTarget = {
      type: 'workflow',
      config: {
        appId: 'test-app-id',
        versionId: 'test-version-id',
        chatConfig: {}
      }
    };

    const result = await validateTargetConfig(targetConfig);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Test App');
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
    expect(result.message).toContain('invalid-app-id');
    expect(result.message).toContain('not found');
  });

  test('应该处理验证错误', async () => {
    const invalidConfig = {
      type: 'invalid_type',
      config: {}
    } as any;

    const result = await validateTargetConfig(invalidConfig);
    expect(result.success).toBe(false);
    expect(result.message).toContain(EvaluationErrEnum.evalUnsupportedTargetType);
  });
});
