import { MongoEvalDataset } from './schema';
import type {
  EvalDatasetSchemaType,
  CreateDatasetParams,
  UpdateDatasetParams,
  ValidationResult,
  ImportResult,
  DatasetColumn,
  DatasetItem
} from '@fastgpt/global/core/evaluation/type';
import { Types } from 'mongoose';
import type { AuthModeType } from '../../../support/permission/type';
import {
  validateResourceAccess,
  validateResourceCreate,
  validateListAccess,
  checkUpdateResult,
  checkDeleteResult
} from '../common';

export class EvaluationDatasetService {
  // 创建数据集
  static async createDataset(
    params: CreateDatasetParams,
    auth: AuthModeType
  ): Promise<EvalDatasetSchemaType> {
    const { teamId, tmbId } = await validateResourceCreate(auth);

    const dataset = await MongoEvalDataset.create({
      ...params,
      teamId,
      tmbId,
      dataItems: []
    });

    return dataset.toObject();
  }

  // 获取数据集
  static async getDataset(datasetId: string, auth: AuthModeType): Promise<EvalDatasetSchemaType> {
    const { resourceFilter, notFoundError } = await validateResourceAccess(
      datasetId,
      auth,
      'Dataset'
    );

    const dataset = await MongoEvalDataset.findOne(resourceFilter).lean();

    if (!dataset) {
      throw new Error(notFoundError);
    }

    return dataset;
  }

  // 更新数据集
  static async updateDataset(
    datasetId: string,
    updates: UpdateDatasetParams,
    auth: AuthModeType
  ): Promise<void> {
    const { resourceFilter } = await validateResourceAccess(datasetId, auth, 'Dataset');

    const result = await MongoEvalDataset.updateOne(resourceFilter, { $set: updates });

    checkUpdateResult(result, 'Dataset');
  }

  // 删除数据集
  static async deleteDataset(datasetId: string, auth: AuthModeType): Promise<void> {
    const { resourceFilter } = await validateResourceAccess(datasetId, auth, 'Dataset');

    const result = await MongoEvalDataset.deleteOne(resourceFilter);

    checkDeleteResult(result, 'Dataset');
  }

  // 获取数据集列表
  static async listDatasets(
    auth: AuthModeType,
    page: number = 1,
    pageSize: number = 20,
    searchKey?: string
  ): Promise<{
    datasets: EvalDatasetSchemaType[];
    total: number;
  }> {
    const { filter, skip, limit, sort } = await validateListAccess(auth, searchKey, page, pageSize);

    const [datasets, total] = await Promise.all([
      MongoEvalDataset.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      MongoEvalDataset.countDocuments(filter)
    ]);

    return { datasets, total };
  }

  // 验证数据格式
  static async validateDataFormat(
    data: any[],
    columns: DatasetColumn[]
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(data)) {
      errors.push('Data must be an array');
      return { isValid: false, errors, warnings };
    }

    const requiredColumns = columns.filter((col) => col.required);

    data.forEach((item, index) => {
      if (typeof item !== 'object' || item === null) {
        errors.push(`Row ${index + 1}: Item must be an object`);
        return;
      }

      // 检查必填字段
      requiredColumns.forEach((col) => {
        if (!(col.name in item) || item[col.name] === null || item[col.name] === undefined) {
          errors.push(`Row ${index + 1}: Missing required field '${col.name}'`);
        }
      });

      // 检查数据类型
      Object.keys(item).forEach((key) => {
        const column = columns.find((col) => col.name === key);
        if (!column) {
          warnings.push(`Row ${index + 1}: Unknown field '${key}'`);
          return;
        }

        const value = item[key];
        if (value === null || value === undefined) return;

        switch (column.type) {
          case 'string':
            if (typeof value !== 'string') {
              errors.push(`Row ${index + 1}: Field '${key}' must be string`);
            }
            break;
          case 'number':
            if (typeof value !== 'number') {
              errors.push(`Row ${index + 1}: Field '${key}' must be number`);
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              errors.push(`Row ${index + 1}: Field '${key}' must be boolean`);
            }
            break;
        }
      });
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // 导入数据
  static async importData(
    datasetId: string,
    data: DatasetItem[],
    auth: AuthModeType
  ): Promise<ImportResult> {
    try {
      const { resourceFilter, notFoundError } = await validateResourceAccess(
        datasetId,
        auth,
        'Dataset'
      );

      const dataset = await MongoEvalDataset.findOne(resourceFilter);

      if (!dataset) {
        throw new Error(notFoundError);
      }

      // 验证数据格式
      const validation = await this.validateDataFormat(data, dataset.columns);
      if (!validation.isValid) {
        return {
          success: false,
          importedCount: 0,
          errors: validation.errors
        };
      }

      // 更新数据集
      await MongoEvalDataset.updateOne(
        { _id: new Types.ObjectId(datasetId) },
        {
          $set: {
            dataItems: data,
            updateTime: new Date()
          }
        }
      );

      return {
        success: true,
        importedCount: data.length,
        errors: validation.warnings // 将警告作为非致命错误返回
      };
    } catch (error) {
      return {
        success: false,
        importedCount: 0,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  // 导出数据
  static async exportData(
    datasetId: string,
    format: 'csv' | 'json',
    auth: AuthModeType
  ): Promise<Buffer> {
    const dataset = await this.getDataset(datasetId, auth);

    if (format === 'json') {
      return Buffer.from(JSON.stringify(dataset.dataItems, null, 2));
    } else {
      // CSV 格式
      if (dataset.dataItems.length === 0) {
        return Buffer.from('');
      }

      const headers = dataset.columns.map((col) => col.name);
      const csvRows = [headers.join(',')];

      dataset.dataItems.forEach((item) => {
        const row = headers.map((header) => {
          const value = item[header];
          if (value === null || value === undefined) {
            return '';
          }
          // 处理包含逗号或引号的值
          const stringValue = String(value);
          if (
            stringValue.includes(',') ||
            stringValue.includes('"') ||
            stringValue.includes('\n')
          ) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        });
        csvRows.push(row.join(','));
      });

      return Buffer.from(csvRows.join('\n'));
    }
  }
}
