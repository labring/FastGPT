import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationDatasetService } from '@fastgpt/service/core/evaluation/dataset';
import type {
  DatasetUpdateQuery,
  UpdateDatasetBody,
  UpdateDatasetResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<UpdateDatasetBody, DatasetUpdateQuery>
): Promise<UpdateDatasetResponse> {
  try {
    const { id } = req.query;
    const { name, description, columns } = req.body;

    if (!id) {
      return Promise.reject('Dataset ID is required');
    }

    // 验证更新参数
    if (name !== undefined && !name?.trim()) {
      return Promise.reject('Dataset name cannot be empty');
    }

    if (columns !== undefined) {
      if (!Array.isArray(columns) || columns.length === 0) {
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
    }

    await EvaluationDatasetService.updateDataset(
      id,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(columns !== undefined && { columns })
      },
      {
        req,
        authToken: true
      }
    );

    addLog.info('[Evaluation Dataset] 数据集更新成功', {
      datasetId: id,
      updates: { name, description, columnCount: columns?.length }
    });

    return { message: 'Dataset updated successfully' };
  } catch (error) {
    addLog.error('[Evaluation Dataset] 更新数据集失败', {
      datasetId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
