import { beforeAll, afterAll, beforeEach, afterEach, describe, test, expect, vi } from 'vitest';
import { EvaluationDatasetService } from '@fastgpt/service/core/evaluation/dataset';
import { MongoEvalDataset } from '@fastgpt/service/core/evaluation/dataset/schema';
import type {
  CreateDatasetParams,
  DatasetColumn,
  DatasetItem
} from '@fastgpt/global/core/evaluation/type';
import type { AuthModeType } from '@fastgpt/service/support/permission/type';
import { Types } from '@fastgpt/service/common/mongo';

vi.mock('@fastgpt/service/support/permission/controller', () => ({
  parseHeaderCert: vi.fn()
}));

import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';

describe('EvaluationDatasetService', () => {
  let teamId: string;
  let tmbId: string;
  let auth: AuthModeType;

  beforeAll(async () => {
    // 数据库连接在 setup.ts 中处理
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439012';
    auth = { req: {} as any, authToken: true };
  });

  afterAll(async () => {
    // 清理测试数据
    await MongoEvalDataset.deleteMany({ teamId });
  });

  beforeEach(() => {
    // 每个测试前重置
    // Mock parseHeaderCert - 返回正确的ObjectId类型
    (parseHeaderCert as any).mockResolvedValue({
      teamId: new Types.ObjectId(teamId),
      tmbId: new Types.ObjectId(tmbId)
    });
  });

  afterEach(() => {
    // 每个测试后清理
  });

  describe('createDataset', () => {
    test('应该成功创建数据集', async () => {
      const params: CreateDatasetParams = {
        name: 'Test Dataset',
        description: 'A test dataset for unit testing',
        dataFormat: 'csv',
        columns: [
          { name: 'userInput', type: 'string', required: true, description: '测试问题' },
          { name: 'expectedOutput', type: 'string', required: true, description: '期望回答' },
          { name: 'category', type: 'string', required: false, description: '分类' }
        ]
      };

      const dataset = await EvaluationDatasetService.createDataset(params, auth);

      expect(dataset.name).toBe(params.name);
      expect(dataset.description).toBe(params.description);
      expect(dataset.dataFormat).toBe(params.dataFormat);
      // 检查columns基本结构，忽略自动生成的_id字段
      expect(dataset.columns).toHaveLength(params.columns.length);
      params.columns.forEach((col, index) => {
        expect(dataset.columns[index].name).toBe(col.name);
        expect(dataset.columns[index].type).toBe(col.type);
        expect(dataset.columns[index].required).toBe(col.required);
        expect(dataset.columns[index].description).toBe(col.description);
      });
      expect(dataset.teamId.toString()).toBe(teamId);
      expect(dataset.tmbId.toString()).toBe(tmbId);
      expect(Array.isArray(dataset.dataItems)).toBe(true);
      expect(dataset.dataItems).toHaveLength(0);
    });

    test('缺少必填字段时应该抛出错误', async () => {
      const invalidParams = {
        // 缺少 name
        description: 'Invalid dataset',
        dataFormat: 'csv' as const,
        columns: []
      };

      await expect(
        EvaluationDatasetService.createDataset(invalidParams as any, auth)
      ).rejects.toThrow();
    });
  });

  describe('getDataset', () => {
    test('应该成功获取数据集', async () => {
      // 先创建一个数据集
      const params: CreateDatasetParams = {
        name: 'Test Dataset for Get',
        description: 'A test dataset for get operation',
        dataFormat: 'csv',
        columns: [{ name: 'userInput', type: 'string', required: true, description: '测试问题' }]
      };
      const created = await EvaluationDatasetService.createDataset(params, auth);

      const dataset = await EvaluationDatasetService.getDataset(created._id, auth);

      expect(dataset._id.toString()).toBe(created._id.toString());
      expect(dataset.name).toBe('Test Dataset for Get');
    });

    test('数据集不存在时应该抛出错误', async () => {
      const nonExistentId = new Types.ObjectId().toString();

      await expect(EvaluationDatasetService.getDataset(nonExistentId, auth)).rejects.toThrow(
        'Dataset not found'
      );
    });
  });

  describe('updateDataset', () => {
    test('应该成功更新数据集', async () => {
      // 先创建一个数据集
      const params: CreateDatasetParams = {
        name: 'Test Dataset for Update',
        description: 'A test dataset for update operation',
        dataFormat: 'csv',
        columns: [{ name: 'userInput', type: 'string', required: true, description: '测试问题' }]
      };
      const created = await EvaluationDatasetService.createDataset(params, auth);

      const updates = {
        name: 'Updated Test Dataset',
        description: 'Updated description',
        columns: [
          { name: 'userInput', type: 'string' as const, required: true },
          { name: 'expectedOutput', type: 'string' as const, required: true }
        ]
      };

      await EvaluationDatasetService.updateDataset(created._id, updates, auth);

      const updatedDataset = await EvaluationDatasetService.getDataset(created._id, auth);
      expect(updatedDataset.name).toBe(updates.name);
      expect(updatedDataset.description).toBe(updates.description);
    });
  });

  describe('listDatasets', () => {
    test('应该成功获取数据集列表', async () => {
      // 先创建一个数据集
      const params: CreateDatasetParams = {
        name: 'Test Dataset for List',
        description: 'A test dataset for list operation',
        dataFormat: 'csv',
        columns: [{ name: 'userInput', type: 'string', required: true, description: '测试问题' }]
      };
      await EvaluationDatasetService.createDataset(params, auth);

      const result = await EvaluationDatasetService.listDatasets(auth, 1, 10);

      expect(Array.isArray(result.datasets)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(result.datasets.length).toBeGreaterThanOrEqual(1);
    });

    test('应该支持搜索功能', async () => {
      // 先创建一个数据集
      const params: CreateDatasetParams = {
        name: 'Searchable Test Dataset',
        description: 'A test dataset for search operation',
        dataFormat: 'csv',
        columns: [{ name: 'userInput', type: 'string', required: true, description: '测试问题' }]
      };
      await EvaluationDatasetService.createDataset(params, auth);

      const result = await EvaluationDatasetService.listDatasets(auth, 1, 10, 'Searchable');

      expect(Array.isArray(result.datasets)).toBe(true);
      expect(result.datasets.some((dataset) => dataset.name.includes('Searchable'))).toBe(true);
    });
  });

  describe('validateDataFormat', () => {
    const columns: DatasetColumn[] = [
      { name: 'userInput', type: 'string', required: true },
      { name: 'expectedOutput', type: 'string', required: true },
      { name: 'score', type: 'number', required: false }
    ];

    test('应该验证有效数据', async () => {
      const validData = [
        { userInput: 'What is AI?', expectedOutput: 'Artificial Intelligence', score: 95 },
        { userInput: 'What is ML?', expectedOutput: 'Machine Learning' }
      ];

      const result = await EvaluationDatasetService.validateDataFormat(validData, columns);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('应该检测缺少必填字段', async () => {
      const invalidData = [
        { userInput: 'What is AI?' }, // 缺少 expectedOutput
        { expectedOutput: 'Machine Learning' } // 缺少 userInput
      ];

      const result = await EvaluationDatasetService.validateDataFormat(invalidData, columns);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((error) => error.includes('expectedOutput'))).toBe(true);
      expect(result.errors.some((error) => error.includes('userInput'))).toBe(true);
    });

    test('应该检测数据类型错误', async () => {
      const invalidData = [
        { userInput: 'What is AI?', expectedOutput: 'Artificial Intelligence', score: 'high' } // score 应该是数字
      ];

      const result = await EvaluationDatasetService.validateDataFormat(invalidData, columns);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((error) => error.includes('score') && error.includes('number'))
      ).toBe(true);
    });

    test('应该处理未知字段', async () => {
      const dataWithUnknownFields = [
        { userInput: 'What is AI?', expectedOutput: 'AI', unknownField: 'value' }
      ];

      const result = await EvaluationDatasetService.validateDataFormat(
        dataWithUnknownFields,
        columns
      );

      expect(result.isValid).toBe(true); // 应该仍然有效
      expect(result.warnings.some((warning) => warning.includes('unknownField'))).toBe(true);
    });
  });

  describe('importData', () => {
    test('应该成功导入有效数据', async () => {
      // 先创建一个数据集
      const params: CreateDatasetParams = {
        name: 'Test Dataset for Import',
        description: 'A test dataset for import operation',
        dataFormat: 'csv',
        columns: [
          { name: 'userInput', type: 'string', required: true, description: '测试问题' },
          { name: 'expectedOutput', type: 'string', required: true, description: '期望回答' }
        ]
      };
      const created = await EvaluationDatasetService.createDataset(params, auth);

      const testData: DatasetItem[] = [
        { userInput: 'Test userInput 1', expectedOutput: 'Test answer 1' },
        { userInput: 'Test userInput 2', expectedOutput: 'Test answer 2' }
      ];

      const result = await EvaluationDatasetService.importData(created._id, testData, auth);

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(2);

      // 验证数据确实被导入
      const dataset = await EvaluationDatasetService.getDataset(created._id, auth);
      expect(dataset.dataItems).toHaveLength(2);
    });

    test('应该拒绝无效数据', async () => {
      const invalidData = [
        { userInput: 'Question without answer' } // 缺少必填字段
      ];

      // 先创建一个数据集
      const params: CreateDatasetParams = {
        name: 'Test Dataset for Invalid Import',
        description: 'A test dataset for invalid import test',
        dataFormat: 'csv',
        columns: [
          { name: 'userInput', type: 'string', required: true, description: '测试问题' },
          { name: 'expectedOutput', type: 'string', required: true, description: '期望回答' }
        ]
      };
      const created = await EvaluationDatasetService.createDataset(params, auth);

      const result = await EvaluationDatasetService.importData(
        created._id,
        invalidData as any,
        auth
      );

      expect(result.success).toBe(false);
      expect(result.importedCount).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('exportData', () => {
    test('应该成功导出 JSON 格式数据', async () => {
      // 先创建一个带数据的数据集
      const params: CreateDatasetParams = {
        name: 'Test Dataset for Export JSON',
        description: 'A test dataset for export JSON operation',
        dataFormat: 'csv',
        columns: [
          { name: 'userInput', type: 'string', required: true, description: '测试问题' },
          { name: 'expectedOutput', type: 'string', required: true, description: '期望回答' }
        ]
      };
      const created = await EvaluationDatasetService.createDataset(params, auth);

      // 导入一些数据
      const testData: DatasetItem[] = [
        { userInput: 'Test userInput', expectedOutput: 'Test response' },
        { userInput: 'Test userInput 2', expectedOutput: 'Test response 2' }
      ];
      await EvaluationDatasetService.importData(created._id, testData, auth);

      const buffer = await EvaluationDatasetService.exportData(created._id, 'json', auth);
      const data = JSON.parse(buffer.toString());

      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(2);
    });

    test('应该成功导出 CSV 格式数据', async () => {
      // 先创建一个带数据的数据集
      const params: CreateDatasetParams = {
        name: 'Test Dataset for Export CSV',
        description: 'A test dataset for export CSV operation',
        dataFormat: 'csv',
        columns: [
          { name: 'userInput', type: 'string', required: true, description: '测试问题' },
          { name: 'expectedOutput', type: 'string', required: true, description: '期望回答' }
        ]
      };
      const created = await EvaluationDatasetService.createDataset(params, auth);

      // 导入一些数据
      const testData: DatasetItem[] = [
        { userInput: 'Test userInput CSV', expectedOutput: 'Test response CSV' }
      ];
      await EvaluationDatasetService.importData(created._id, testData, auth);

      const buffer = await EvaluationDatasetService.exportData(created._id, 'csv', auth);
      const csvContent = buffer.toString();

      expect(csvContent.includes('userInput,expectedOutput')).toBe(true);
      expect(csvContent.includes('Test userInput CSV')).toBe(true);
    });
  });

  describe('deleteDataset', () => {
    test('应该成功删除数据集', async () => {
      // 先创建一个数据集
      const params: CreateDatasetParams = {
        name: 'Test Dataset for Delete',
        description: 'A test dataset for delete operation',
        dataFormat: 'csv',
        columns: [{ name: 'userInput', type: 'string', required: true, description: '测试问题' }]
      };
      const created = await EvaluationDatasetService.createDataset(params, auth);

      await EvaluationDatasetService.deleteDataset(created._id, auth);

      await expect(EvaluationDatasetService.getDataset(created._id, auth)).rejects.toThrow(
        'Dataset not found'
      );
    });
  });
});
