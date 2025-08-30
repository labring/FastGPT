import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationDatasetService } from '@fastgpt/service/core/evaluation/dataset';
import type {
  UpdateDatasetRequest,
  UpdateDatasetResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { validateEvaluationParams } from '@fastgpt/global/core/evaluation/utils';

async function handler(req: ApiRequestProps<UpdateDatasetRequest>): Promise<UpdateDatasetResponse> {
  try {
    const { datasetId, name, description, columns } = req.body;

    if (!datasetId) {
      return Promise.reject('Dataset ID is required');
    }

    // Validate name and description with common validation utility
    const paramValidation = validateEvaluationParams(
      { name, description },
      { namePrefix: 'Dataset' }
    );
    if (!paramValidation.success) {
      return Promise.reject(paramValidation.message);
    }

    if (columns !== undefined) {
      if (!Array.isArray(columns) || columns.length === 0) {
        return Promise.reject('Dataset columns are required');
      }

      // Validate column definitions
      for (const column of columns) {
        if (!column.name?.trim()) {
          return Promise.reject('Column name is required');
        }
        if (!['string', 'number', 'boolean'].includes(column.type)) {
          return Promise.reject(`Invalid column type: ${column.type}`);
        }
      }

      // Check for duplicate column names
      const columnNames = columns.map((col) => col.name.trim());
      const uniqueNames = new Set(columnNames);
      if (columnNames.length !== uniqueNames.size) {
        return Promise.reject('Duplicate column names are not allowed');
      }
    }

    await EvaluationDatasetService.updateDataset(
      datasetId,
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

    addLog.info('[Evaluation Dataset] Dataset updated successfully', {
      datasetId: datasetId,
      updates: { name, description, columnCount: columns?.length }
    });

    return { message: 'Dataset updated successfully' };
  } catch (error) {
    addLog.error('[Evaluation Dataset] Failed to update dataset', {
      datasetId: req.query.datasetId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
