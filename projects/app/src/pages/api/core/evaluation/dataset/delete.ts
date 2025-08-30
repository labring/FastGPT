import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationDatasetService } from '@fastgpt/service/core/evaluation/dataset';
import type {
  DeleteDatasetRequest,
  DeleteDatasetResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<{}, DeleteDatasetRequest>
): Promise<DeleteDatasetResponse> {
  try {
    const { datasetId } = req.query;

    if (!datasetId) {
      return Promise.reject('Dataset ID is required');
    }

    await EvaluationDatasetService.deleteDataset(datasetId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation Dataset] Dataset deleted successfully', {
      datasetId: datasetId
    });

    return { message: 'Dataset deleted successfully' };
  } catch (error) {
    addLog.error('[Evaluation Dataset] Failed to delete dataset', {
      datasetId: req.query.datasetId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
