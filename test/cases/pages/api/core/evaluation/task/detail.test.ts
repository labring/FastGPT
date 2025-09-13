import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler as detailHandler } from '@/pages/api/core/evaluation/task/detail';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    getEvaluationDetail: vi.fn().mockResolvedValue({
      _id: 'mock-eval-id',
      name: 'Mock Evaluation',
      status: 'completed',
      tmbId: 'mock-tmb-id'
    })
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  getEvaluationPermissionAggregation: vi.fn().mockResolvedValue({
    teamId: 'mock-team-id',
    tmbId: 'mock-tmb-id',
    isOwner: false,
    roleList: [
      {
        resourceId: 'mock-eval-id',
        tmbId: 'mock-tmb-id',
        permission: 15
      }
    ],
    myGroupMap: new Map(),
    myOrgSet: new Set()
  })
}));

vi.mock('@fastgpt/service/support/user/utils', () => ({
  addSourceMember: vi.fn().mockImplementation(({ list }) =>
    list.map((item: any) => ({
      ...item,
      sourceMember: {
        name: 'Mock User',
        avatar: 'mock-avatar.png',
        status: 'active'
      }
    }))
  )
}));

vi.mock('@fastgpt/global/support/permission/evaluation/controller', () => ({
  EvaluationPermission: vi.fn().mockImplementation(({ role, isOwner }) => ({
    hasReadPer: true,
    hasWritePer: true,
    hasManagePer: isOwner,
    role,
    isOwner
  }))
}));

describe('Get Evaluation Task Detail API Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功获取评估任务详情', async () => {
    const evalId = new Types.ObjectId().toString();
    const mockReq = {
      method: 'GET',
      query: { evalId: evalId }
    } as any;

    const result = await detailHandler(mockReq);

    // Verify the result includes permission, private, and sourceMember fields
    expect(result).toEqual(
      expect.objectContaining({
        _id: 'mock-eval-id',
        name: 'Mock Evaluation',
        status: 'completed',
        permission: expect.any(Object),
        private: expect.any(Boolean),
        sourceMember: expect.objectContaining({
          name: 'Mock User',
          avatar: 'mock-avatar.png',
          status: 'active'
        })
      })
    );
  });

  test('应该拒绝缺少ID的请求', async () => {
    const mockReq = {
      method: 'GET',
      query: {}
    } as any;

    await expect(detailHandler(mockReq)).rejects.toThrow('evaluationIdRequired');
  });
});
