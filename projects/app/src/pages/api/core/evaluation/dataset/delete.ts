import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationDatasetService } from '@fastgpt/service/core/evaluation/dataset';
import type {
  DatasetDeleteQuery,
  DeleteDatasetResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<{}, DatasetDeleteQuery>
): Promise<DeleteDatasetResponse> {
  try {
    const { id } = req.query;

    if (!id) {
      return Promise.reject('Dataset ID is required');
    }

    await EvaluationDatasetService.deleteDataset(id, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation Dataset] 数据集删除成功', {
      datasetId: id
    });

    return { message: 'Dataset deleted successfully' };
  } catch (error) {
    addLog.error('[Evaluation Dataset] 删除数据集失败', {
      datasetId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
