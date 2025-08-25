import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationDatasetService } from '@fastgpt/service/core/evaluation/dataset';
import type { CreateDatasetBody, CreateDatasetResponse } from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(req: ApiRequestProps<CreateDatasetBody>): Promise<CreateDatasetResponse> {
  try {
    const { name, description, dataFormat, columns } = req.body;

    // 验证必填字段
    if (!name?.trim()) {
      return Promise.reject('Dataset name is required');
    }

    if (!columns || !Array.isArray(columns) || columns.length === 0) {
      return Promise.reject('Dataset columns are required');
    }

    // 验证列定义
    for (const column of columns) {
      if (!column.name?.trim()) {
        return Promise.reject('Column name is required');
      }
      if (!['string', 'number', 'boolean'].includes(column.type)) {
        return Promise.reject(`Invalid column type: ${column.type}`);
      }
    }

    // 检查列名重复
    const columnNames = columns.map((col) => col.name.trim());
    const uniqueNames = new Set(columnNames);
    if (columnNames.length !== uniqueNames.size) {
      return Promise.reject('Duplicate column names are not allowed');
    }

    const dataset = await EvaluationDatasetService.createDataset(
      {
        name: name.trim(),
        description: description?.trim(),
        dataFormat: dataFormat || 'csv',
        columns
      },
      {
        req,
        authToken: true
      }
    );

    addLog.info('[Evaluation Dataset] 数据集创建成功', {
      datasetId: dataset._id,
      name: dataset.name,
      columnCount: dataset.columns.length
    });

    return dataset;
  } catch (error) {
    addLog.error('[Evaluation Dataset] 创建数据集失败', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
