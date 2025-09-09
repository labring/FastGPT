import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler } from '@/pages/api/core/evaluation/task/item/export';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    exportEvaluationResults: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskRead: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));

describe('Export Evaluation Items API Handler', () => {
  const mockRequest = (query: any) =>
    ({
      query,
      method: 'GET'
    }) as any;

  const mockResponse = () => {
    const res = {
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn()
    };
    return res as any;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功导出JSON格式的结果', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      teamId: 'team-123',
      tmbId: 'tmb-123',
      evaluation: { name: 'Test Evaluation' }
    });
    (EvaluationTaskService.exportEvaluationResults as any).mockResolvedValue({
      results: '[]',
      total: 0
    });

    const req = mockRequest({
      evalId: 'eval-123',
      format: 'json'
    });
    const res = mockResponse();

    await handler(req, res);

    expect(authEvaluationTaskRead).toHaveBeenCalledWith('eval-123', {
      req,
      authApiKey: true,
      authToken: true
    });
    expect(EvaluationTaskService.exportEvaluationResults).toHaveBeenCalledWith(
      'eval-123',
      'team-123',
      'json'
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');
    expect(res.write).toHaveBeenCalledWith('[]');
    expect(res.end).toHaveBeenCalled();
  });

  test('应该成功导出CSV格式的结果', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      teamId: 'team-123',
      tmbId: 'tmb-123',
      evaluation: { name: 'Test Evaluation' }
    });
    (EvaluationTaskService.exportEvaluationResults as any).mockResolvedValue({
      results: 'id,data\n1,test',
      total: 1
    });

    const req = mockRequest({
      evalId: 'eval-123',
      format: 'csv'
    });
    const res = mockResponse();

    await handler(req, res);

    expect(EvaluationTaskService.exportEvaluationResults).toHaveBeenCalledWith(
      'eval-123',
      'team-123',
      'csv'
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.write).toHaveBeenCalledWith('id,data\n1,test');
    expect(res.end).toHaveBeenCalled();
  });

  test('默认格式应该是JSON', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      teamId: 'team-123',
      tmbId: 'tmb-123',
      evaluation: { name: 'Test Evaluation' }
    });
    (EvaluationTaskService.exportEvaluationResults as any).mockResolvedValue({
      results: '[]',
      total: 0
    });

    const req = mockRequest({
      evalId: 'eval-123'
    });
    const res = mockResponse();

    await handler(req, res);

    expect(EvaluationTaskService.exportEvaluationResults).toHaveBeenCalledWith(
      'eval-123',
      'team-123',
      'json'
    );
  });

  test('缺少evalId时应该抛出错误', async () => {
    const req = mockRequest({});
    const res = mockResponse();

    await expect(handler(req, res)).rejects.toThrow('evaluationIdRequired');
  });

  test('无效格式时应该抛出错误', async () => {
    const req = mockRequest({
      evalId: 'eval-123',
      format: 'invalid'
    });
    const res = mockResponse();

    await expect(handler(req, res)).rejects.toThrow('evaluationInvalidFormat');
  });

  test('认证失败时应该抛出错误', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockRejectedValue(new Error('Permission denied'));

    const req = mockRequest({
      evalId: 'eval-123',
      format: 'json'
    });
    const res = mockResponse();

    await expect(handler(req, res)).rejects.toThrow('Permission denied');
  });

  test('服务层异常时应该抛出错误', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      teamId: 'team-123',
      tmbId: 'tmb-123',
      evaluation: { name: 'Test Evaluation' }
    });
    (EvaluationTaskService.exportEvaluationResults as any).mockRejectedValue(
      new Error('Export failed')
    );

    const req = mockRequest({
      evalId: 'eval-123',
      format: 'json'
    });
    const res = mockResponse();

    await expect(handler(req, res)).rejects.toThrow('Export failed');
  });
});
