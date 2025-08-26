import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationDatasetService } from '@fastgpt/service/core/evaluation/dataset';
import type {
  DatasetDetailQuery,
  DatasetDetailResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<{}, DatasetDetailQuery>
): Promise<DatasetDetailResponse> {
  try {
    const { id } = req.query;

    if (!id) {
      return Promise.reject('Dataset ID is required');
    }

    const dataset = await EvaluationDatasetService.getDataset(id, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation Dataset] Dataset details retrieved successfully', {
      datasetId: id,
      name: dataset.name,
      itemCount: dataset.dataItems?.length || 0
    });

    return dataset;
  } catch (error) {
    addLog.error('[Evaluation Dataset] Failed to get dataset details', {
      datasetId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
