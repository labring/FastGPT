import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';

// Import API handlers directly - use named imports
import { handler as createHandler } from '@/pages/api/core/evaluation/dataset/create';
import { handler as listHandler } from '@/pages/api/core/evaluation/dataset/list';
import { handler as detailHandler } from '@/pages/api/core/evaluation/dataset/detail';
import { handler as updateHandler } from '@/pages/api/core/evaluation/dataset/update';
import { handler as deleteHandler } from '@/pages/api/core/evaluation/dataset/delete';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/dataset', () => ({
  EvaluationDatasetService: {
    createDataset: vi.fn(),
    listDatasets: vi.fn(),
    getDataset: vi.fn(),
    updateDataset: vi.fn(),
    deleteDataset: vi.fn(),
    importData: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: vi.fn().mockResolvedValue({
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId()
  })
}));

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('@fastgpt/service/common/file/multer', () => ({
  getUploadModel: vi.fn(() => ({
    getUploadFile: vi.fn()
  }))
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  unlinkSync: vi.fn()
}));

vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn()
  }
}));

import { EvaluationDatasetService } from '@fastgpt/service/core/evaluation/dataset';
import { addLog } from '@fastgpt/service/common/system/log';

describe('Dataset API Handler Tests (Direct Function Calls)', () => {
  const mockDataset = {
    _id: new Types.ObjectId(),
    name: 'Test Dataset',
    description: 'Test Description',
    dataFormat: 'csv',
    columns: [
      { name: 'userInput', type: 'string', required: true },
      { name: 'answer', type: 'string', required: true }
    ],
    dataItems: [],
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId(),
    createTime: new Date(),
    updateTime: new Date()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Dataset Handler', () => {
    test('应该成功创建数据集', async () => {
      const mockReq = {
        body: {
          name: 'Test Dataset',
          description: 'Test Description',
          dataFormat: 'csv',
          columns: [
            { name: 'userInput', type: 'string', required: true },
            { name: 'answer', type: 'string', required: true }
          ]
        }
      } as any;

      (EvaluationDatasetService.createDataset as any).mockResolvedValue(mockDataset);

      const result = await createHandler(mockReq);

      expect(EvaluationDatasetService.createDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Dataset',
          description: 'Test Description',
          dataFormat: 'csv',
          columns: mockReq.body.columns
        }),
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual(mockDataset);
      expect(addLog.info).toHaveBeenCalledWith(
        '[Evaluation Dataset] Dataset created successfully',
        expect.objectContaining({
          datasetId: mockDataset._id,
          name: mockDataset.name,
          columnCount: 2
        })
      );
    });

    test('应该拒绝空名称', async () => {
      const mockReq = {
        body: {
          name: '',
          columns: [{ name: 'test', type: 'string', required: true }]
        }
      } as any;

      await expect(createHandler(mockReq)).rejects.toMatch('Dataset name is required');
    });

    test('应该拒绝空列定义', async () => {
      const mockReq = {
        body: {
          name: 'Test Dataset',
          columns: []
        }
      } as any;

      await expect(createHandler(mockReq)).rejects.toMatch('Dataset columns are required');
    });

    test('应该拒绝重复列名', async () => {
      const mockReq = {
        body: {
          name: 'Test Dataset',
          columns: [
            { name: 'test', type: 'string', required: true },
            { name: 'test', type: 'string', required: false }
          ]
        }
      } as any;

      await expect(createHandler(mockReq)).rejects.toMatch(
        'Duplicate column names are not allowed'
      );
    });

    test('应该拒绝无效列类型', async () => {
      const mockReq = {
        body: {
          name: 'Test Dataset',
          columns: [{ name: 'test', type: 'invalid', required: true }]
        }
      } as any;

      await expect(createHandler(mockReq)).rejects.toMatch('Invalid column type: invalid');
    });
  });

  describe('List Datasets Handler', () => {
    test('应该成功获取数据集列表', async () => {
      const mockReq = {
        body: { pageNum: 1, pageSize: 10 }
      } as any;

      const mockResult = {
        datasets: [mockDataset],
        total: 1
      };

      (EvaluationDatasetService.listDatasets as any).mockResolvedValue(mockResult);

      const result = await listHandler(mockReq);

      expect(EvaluationDatasetService.listDatasets).toHaveBeenCalledWith(
        expect.objectContaining({
          req: mockReq,
          authToken: true
        }),
        1,
        10,
        undefined
      );
      expect(result).toEqual({
        list: mockResult.datasets,
        total: mockResult.total
      });
    });

    test('应该处理搜索参数', async () => {
      const mockReq = {
        body: { pageNum: 1, pageSize: 10, searchKey: 'test search' }
      } as any;

      const mockResult = { datasets: [], total: 0 };
      (EvaluationDatasetService.listDatasets as any).mockResolvedValue(mockResult);

      await listHandler(mockReq);

      expect(EvaluationDatasetService.listDatasets).toHaveBeenCalledWith(
        expect.objectContaining({
          req: mockReq,
          authToken: true
        }),
        1,
        10,
        'test search'
      );
    });

    test('应该拒绝无效分页参数', async () => {
      const mockReq = {
        body: { pageNum: 0, pageSize: 10 }
      } as any;

      await expect(listHandler(mockReq)).rejects.toMatch('Invalid page number');
    });

    test('应该拒绝过大的页面大小', async () => {
      const mockReq = {
        body: { pageNum: 1, pageSize: 200 }
      } as any;

      await expect(listHandler(mockReq)).rejects.toMatch('Invalid page size');
    });
  });

  describe('Get Dataset Detail Handler', () => {
    test('应该成功获取数据集详情', async () => {
      const datasetId = new Types.ObjectId().toString();
      const mockReq = {
        query: { id: datasetId }
      } as any;

      (EvaluationDatasetService.getDataset as any).mockResolvedValue(mockDataset);

      const result = await detailHandler(mockReq);

      expect(EvaluationDatasetService.getDataset).toHaveBeenCalledWith(
        datasetId,
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual(mockDataset);
    });

    test('应该拒绝缺少ID的请求', async () => {
      const mockReq = {
        query: {}
      } as any;

      await expect(detailHandler(mockReq)).rejects.toMatch('Dataset ID is required');
    });
  });

  describe('Update Dataset Handler', () => {
    test('应该成功更新数据集', async () => {
      const datasetId = new Types.ObjectId().toString();
      const mockReq = {
        query: { id: datasetId },
        body: {
          name: 'Updated Dataset',
          description: 'Updated Description'
        }
      } as any;

      (EvaluationDatasetService.updateDataset as any).mockResolvedValue(undefined);

      const result = await updateHandler(mockReq);

      expect(EvaluationDatasetService.updateDataset).toHaveBeenCalledWith(
        datasetId,
        expect.objectContaining({
          name: 'Updated Dataset',
          description: 'Updated Description'
        }),
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual({ message: 'Dataset updated successfully' });
    });
  });

  describe('Delete Dataset Handler', () => {
    test('应该成功删除数据集', async () => {
      const datasetId = new Types.ObjectId().toString();
      const mockReq = {
        query: { id: datasetId }
      } as any;

      (EvaluationDatasetService.deleteDataset as any).mockResolvedValue(undefined);

      const result = await deleteHandler(mockReq);

      expect(EvaluationDatasetService.deleteDataset).toHaveBeenCalledWith(
        datasetId,
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual({ message: 'Dataset deleted successfully' });
    });
  });

  describe('Import Dataset Handler', () => {
    // 跳过导入测试，因为它使用复杂的文件上传中间件
    // 这些测试更适合端到端测试而不是单元测试
    test.skip('导入功能需要集成测试环境', () => {
      // 导入功能涉及文件上传、文件系统操作等复杂依赖
      // 建议使用集成测试或端到端测试来验证
    });
  });
});
