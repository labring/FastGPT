import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationDatasetService } from '@fastgpt/service/core/evaluation/dataset';
import type {
  ListDatasetsRequest,
  ListDatasetsResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(req: ApiRequestProps<ListDatasetsRequest>): Promise<ListDatasetsResponse> {
  try {
    const { pageNum = 1, pageSize = 20, searchKey } = req.body;

    // Validate pagination parameters
    const pageNumInt = Number(pageNum);
    const pageSizeInt = Number(pageSize);

    if (pageNumInt < 1) {
      return Promise.reject('Invalid page number');
    }

    if (pageSizeInt < 1 || pageSizeInt > 100) {
      return Promise.reject('Invalid page size (1-100)');
    }

    const result = await EvaluationDatasetService.listDatasets(
      {
        req,
        authToken: true
      },
      pageNumInt,
      pageSizeInt,
      searchKey?.trim()
    );

    addLog.info('[Evaluation Dataset] Dataset list query successful', {
      pageNum: pageNumInt,
      pageSize: pageSizeInt,
      searchKey: searchKey?.trim(),
      total: result.total,
      returned: result.datasets.length
    });

    return {
      list: result.datasets,
      total: result.total
    };
  } catch (error) {
    addLog.error('[Evaluation Dataset] Failed to query dataset list', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
