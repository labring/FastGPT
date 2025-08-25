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

    addLog.info('[Evaluation Dataset] 数据集详情查询成功', {
      datasetId: id,
      name: dataset.name,
      itemCount: dataset.dataItems?.length || 0
    });

    return dataset;
  } catch (error) {
    addLog.error('[Evaluation Dataset] 获取数据集详情失败', {
      datasetId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
